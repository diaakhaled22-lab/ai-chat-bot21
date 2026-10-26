import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { exec } from "child_process";
import { db, usersTable, passwordResetTokensTable, companiesTable, notificationsTable } from "@workspace/db";
import { eq, and, gt, sql, or } from "drizzle-orm";
import { AdminLoginBody, ClientLoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendAttackSpikeNotification, sendPasswordResetEmail, sendNewClientNotification, getEmailConfig, isEmailConfigured } from "../lib/email";
import {
  authLimiter,
  sensitiveLimiter,
  isAccountLocked,
  isIpBlocked,
  recordBlockedLoginAttempt,
  recordFailedLogin,
  resetLoginAttempts,
  validatePassword,
  regenerateSession,
  getTotpSecret,
} from "../lib/security";
import { authenticator } from "otplib";

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: "admin" | "client";
    name: string;
  }
}

export const temp2faTokens = new Map<string, { userId: number; name: string; expiresAt: number }>();

function extractClientIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "") || req.ip || req.socket?.remoteAddress || "unknown";
  return raw.replace(/^::ffff:/, "").trim();
}

function getArpMac(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
      return resolve(null);
    }
    const isWin = process.platform === "win32";
    const cmd = isWin ? `arp -a ${ip}` : `arp -n ${ip}`;
    exec(cmd, { timeout: 1500 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const match = stdout.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
      if (match) {
        resolve(match[0].replace(/-/g, ":").toUpperCase());
      } else {
        resolve(null);
      }
    });
  });
}

const router = Router();

router.post("/auth/admin/login", authLimiter, async (req, res) => {
  try {
    const parsed = AdminLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { username, password } = parsed.data;
    const ip = req.ip || "unknown";
    const clientIp = extractClientIp(req);
    const bodyMac = typeof (req.body as any)?.macAddress === "string" ? (req.body as any).macAddress.trim() : null;
    const headerMac = typeof req.headers["x-mac-address"] === "string" ? (req.headers["x-mac-address"] as string).trim() : null;
    const arpMac = await getArpMac(clientIp);
    const finalMac = bodyMac || headerMac || arpMac || null;

    if (isIpBlocked(ip, finalMac)) {
      res.status(429).json({ error: "Suspicious activity detected. This IP address or device (MAC) is temporarily blocked." });
      return;
    }

    // Check account lockout
    const lockSeconds = isAccountLocked(username);
    if (lockSeconds > 0) {
      recordBlockedLoginAttempt(username, ip, finalMac);
      res.status(429).json({ error: `Account locked. Try again in ${Math.ceil(lockSeconds / 60)} minutes.` });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user || user.role !== "admin") {
      if (username) {
        const result = recordFailedLogin(username, ip, finalMac);
        if (result.spikeDetected) {
          void sendAttackSpikeNotification({
            recentFailedAttempts: result.recentFailedAttempts,
            windowMinutes: 5,
          });
        }
      }
      res.status(401).json({ error: "Invalid login credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const result = recordFailedLogin(username, ip, finalMac);
      if (result.spikeDetected) {
        void sendAttackSpikeNotification({
          recentFailedAttempts: result.recentFailedAttempts,
          windowMinutes: 5,
        });
      }
      res.status(401).json({ error: "Invalid login credentials" });
      return;
    }

    resetLoginAttempts(username, ip);

    const totpSecret = getTotpSecret(user.id);
    if (totpSecret) {
      // Create a temporary token
      const tempToken = crypto.randomBytes(32).toString("hex");
      temp2faTokens.set(tempToken, { userId: user.id, name: user.name, expiresAt: Date.now() + 5 * 60 * 1000 });
      res.json({ requires2FA: true, tempToken });
      return;
    }

    // Regenerate session ID to prevent session fixation attacks
    await regenerateSession(req);

    const adminIp = extractClientIp(req);
    await db
      .update(usersTable)
      .set({ lastLoginIp: adminIp })
      .where(eq(usersTable.id, user.id))
      .catch((err) => logger.warn({ err }, "Failed to update last login IP"));

    req.session.userId = user.id;
    req.session.role = "admin";
    req.session.name = user.name;

    res.json({ role: "admin", name: user.name, id: user.id });
  } catch (err) {
    logger.error({ err }, "Admin login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/admin/login/verify-2fa", authLimiter, async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || typeof tempToken !== "string" || !code || typeof code !== "string") {
      res.status(400).json({ error: "Missing token or code" });
      return;
    }

    const tokenData = temp2faTokens.get(tempToken);
    if (!tokenData) {
      res.status(401).json({ error: "Session expired or invalid" });
      return;
    }

    if (Date.now() > tokenData.expiresAt) {
      temp2faTokens.delete(tempToken);
      res.status(401).json({ error: "Session expired" });
      return;
    }

    const secret = getTotpSecret(tokenData.userId);
    if (!secret) {
      res.status(400).json({ error: "2FA is not enabled for this user" });
      return;
    }

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      res.status(401).json({ error: "Invalid verification code" });
      return;
    }

    temp2faTokens.delete(tempToken);

    await regenerateSession(req);

    const adminIp = extractClientIp(req);
    await db
      .update(usersTable)
      .set({ lastLoginIp: adminIp })
      .where(eq(usersTable.id, tokenData.userId))
      .catch((err) => logger.warn({ err }, "Failed to update last login IP"));

    req.session.userId = tokenData.userId;
    req.session.role = "admin";
    req.session.name = tokenData.name;

    res.json({ role: "admin", name: tokenData.name, id: tokenData.userId });
  } catch (err) {
    logger.error({ err }, "Admin 2FA verify error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/client/login", authLimiter, async (req, res) => {
  try {
    const parsed = ClientLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { username, password } = parsed.data;
    const ip = req.ip || "unknown";
    const clientIp = extractClientIp(req);
    const bodyMac = typeof (req.body as any)?.macAddress === "string" ? (req.body as any).macAddress.trim() : null;
    const headerMac = typeof req.headers["x-mac-address"] === "string" ? (req.headers["x-mac-address"] as string).trim() : null;
    const arpMac = await getArpMac(clientIp);
    let finalMac = bodyMac || headerMac || arpMac || null;

    if (isIpBlocked(ip, finalMac)) {
      res.status(429).json({ error: "Suspicious activity detected. This IP address or device (MAC) is temporarily blocked." });
      return;
    }

    const lockSeconds = isAccountLocked(username);
    if (lockSeconds > 0) {
      recordBlockedLoginAttempt(username, ip, finalMac);
      res.status(429).json({ error: `Account locked. Try again in ${Math.ceil(lockSeconds / 60)} minutes.` });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (user?.macAddress && !finalMac) {
      finalMac = user.macAddress;
    }

    if (!user || user.role !== "client") {
      if (username) {
        const result = recordFailedLogin(username, ip, finalMac);
        if (result.spikeDetected) {
          void sendAttackSpikeNotification({
            recentFailedAttempts: result.recentFailedAttempts,
            windowMinutes: 5,
          });
        }
      }
      res.status(401).json({ error: "Invalid login credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const result = recordFailedLogin(username, ip, finalMac);
      if (result.spikeDetected) {
        void sendAttackSpikeNotification({
          recentFailedAttempts: result.recentFailedAttempts,
          windowMinutes: 5,
        });
      }
      res.status(401).json({ error: "Invalid login credentials" });
      return;
    }

    resetLoginAttempts(username, ip);

    // Regenerate session ID to prevent session fixation attacks
    await regenerateSession(req);

    const loginUpdates: Record<string, any> = { lastLoginIp: clientIp };
    if (finalMac) {
      loginUpdates.macAddress = finalMac;
    }

    await db
      .update(usersTable)
      .set(loginUpdates)
      .where(eq(usersTable.id, user.id))
      .catch((err) => logger.warn({ err }, "Failed to update last login IP / MAC"));

    req.session.userId = user.id;
    req.session.role = "client";
    req.session.name = user.name;

    res.json({ role: "client", name: user.name, id: user.id });
  } catch (err) {
    logger.error({ err }, "Client login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/client/register", authLimiter, async (req, res) => {
  try {
    const { name, username, email, password } = req.body as {
      name?: string;
      username?: string;
      email?: string;
      password?: string;
    };
    const clientIp = extractClientIp(req);
    const bodyMac = typeof (req.body as any)?.macAddress === "string" ? (req.body as any).macAddress.trim() : null;
    const arpMac = await getArpMac(clientIp);
    const rawMac = arpMac || bodyMac || null;
    const finalMac = rawMac ? rawMac.replace(/-/g, ":").toUpperCase() : null;

    if (isIpBlocked(ip, finalMac)) {
      res.status(429).json({ error: "Suspicious activity detected. This IP address or device (MAC) is temporarily blocked." });
      return;
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: "Name must be at least 2 characters" });
      return;
    }

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      res.status(400).json({ error: "Username must be at least 3 characters" });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    // Ensure columns exist on users table
    await db.execute(sql`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mac_address TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email TEXT;
    `).catch((e) => logger.warn({ err: e }, "Failed to ensure users columns in register"));

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, cleanUsername))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: `Username "${cleanUsername}" is already taken. Please choose another.` });
      return;
    }

    const trimmedEmail = typeof email === "string" && email.trim() ? email.trim() : null;
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }

    if (trimmedEmail) {
      const [existingEmail] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "client"),
            or(
              eq(usersTable.email, trimmedEmail),
              eq(usersTable.notificationEmail, trimmedEmail)
            )
          )
        )
        .limit(1);

      if (existingEmail) {
        const isAr = (req.body as any)?.lang === "ar" || req.headers["accept-language"]?.includes("ar");
        res.status(409).json({
          error: isAr
            ? `يوجد حساب مسجل بالفعل بهذا البريد الإلكتروني (${trimmedEmail}).`
            : `An account with email "${trimmedEmail}" already exists.`,
        });
        return;
      }
    }

    // Block addition if an IP address is already stored in the Clients Directory
    if (clientIp && clientIp !== "unknown") {
      const [existingIpClient] = await db
        .select({ id: usersTable.id, username: usersTable.username, name: usersTable.name })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "client"),
            eq(usersTable.lastLoginIp, clientIp)
          )
        )
        .limit(1);

      if (existingIpClient) {
        const isAr = (req.body as any)?.lang === "ar" || req.headers["accept-language"]?.includes("ar");
        res.status(409).json({
          error: isAr
            ? `يوجد حساب مسجل بالفعل من عنوان IP هذا (${clientIp}). يسمح بحساب واحد فقط لكل عنوان IP.`
            : `An account already exists from this IP address (${clientIp}). Only one client account is allowed per IP address.`,
        });
        return;
      }
    }

    // Block addition if a MAC address is already stored in the Clients Directory
    if (finalMac) {
      const [existingMacClient] = await db
        .select({ id: usersTable.id, username: usersTable.username, name: usersTable.name })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "client"),
            eq(sql`UPPER(REPLACE(${usersTable.macAddress}, '-', ':'))`, finalMac)
          )
        )
        .limit(1);

      if (existingMacClient) {
        const isAr = (req.body as any)?.lang === "ar" || req.headers["accept-language"]?.includes("ar");
        res.status(409).json({
          error: isAr
            ? `يوجد حساب مسجل بالفعل من هذا الجهاز (عنوان MAC: ${finalMac}). يسمح بحساب واحد فقط لكل جهاز.`
            : `An account already exists from this device (MAC address: ${finalMac}). Only one client account is allowed per device.`,
        });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        name: name.trim(),
        username: cleanUsername,
        passwordHash,
        role: "client",
        email: trimmedEmail,
        notificationEmail: trimmedEmail,
        lastLoginIp: clientIp,
        macAddress: finalMac,
      })
      .returning();

    await regenerateSession(req);
    req.session.userId = newUser.id;
    req.session.role = "client";
    req.session.name = newUser.name;

    // Send in-app notification to all admins + email via "Email Notifications" settings
    void sendNewClientNotification({
      id: newUser.id,
      name: newUser.name,
      username: newUser.username,
      email: (newUser as any).email || newUser.notificationEmail || null,
      ip: clientIp || null,
      mac: finalMac || null,
      source: "self_registration",
    });

    res.status(201).json({
      role: "client",
      name: newUser.name,
      id: newUser.id,
      message: "Account created successfully",
    });
  } catch (err: any) {
    logger.error({ err }, "Client registration error");
    res.status(500).json({ error: err?.message || "Failed to create account" });
  }
});

router.post("/auth/forgot-password", sensitiveLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    // Always return same response to prevent user enumeration
    const genericResponse = { ok: true };

    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.username, username), eq(usersTable.role, "admin")))
      .limit(1);

    if (!user) {
      res.json(genericResponse);
      return;
    }

    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) {
      // Return same response — don't reveal that email isn't configured
      logger.warn("Forgot password requested but email not configured");
      res.json(genericResponse);
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokensTable).values({ token, username: user.username, expiresAt });

    const appUrl = process.env.APP_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail(cfg.recipientEmail, resetLink);

    res.json(genericResponse);
  } catch (err) {
    logger.error({ err }, "Forgot password error");
    // Return same response even on error to prevent info leakage
    res.json({ ok: true });
  }
});

router.post("/auth/reset-password", sensitiveLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    const [record] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.token, token),
          eq(passwordResetTokensTable.used, false),
          gt(passwordResetTokensTable.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!record) {
      res.status(400).json({ error: "Invalid or expired reset link" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.username, record.username));

    await db
      .update(passwordResetTokensTable)
      .set({ used: true })
      .where(eq(passwordResetTokensTable.token, token));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Reset password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        username: usersTable.username,
        role: usersTable.role,
        notificationEmail: usersTable.notificationEmail,
        resendApiKey: usersTable.resendApiKey,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    let notificationEmail = user.notificationEmail ?? "";
    let resendApiKey = user.resendApiKey ?? "";

    if (user.role === "client") {
      const [comp] = await db
        .select({
          notificationEmail: companiesTable.notificationEmail,
          resendApiKey: companiesTable.resendApiKey,
        })
        .from(companiesTable)
        .where(eq(companiesTable.clientId, user.id))
        .limit(1);

      if (comp) {
        if (!notificationEmail && comp.notificationEmail) {
          notificationEmail = comp.notificationEmail;
        }
        if (!resendApiKey && comp.resendApiKey) {
          resendApiKey = comp.resendApiKey;
        }
      }
    }

    res.json({
      role: user.role,
      name: user.name,
      username: user.username,
      id: user.id,
      notificationEmail,
      resendApiKey,
    });
  } catch (err) {
    logger.error({ err }, "Get me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
