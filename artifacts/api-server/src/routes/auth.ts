import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { AdminLoginBody, ClientLoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { sendPasswordResetEmail, getEmailConfig, isEmailConfigured } from "../lib/email";
import { authLimiter, sensitiveLimiter, isAccountLocked, recordFailedLogin, resetLoginAttempts, validatePassword, regenerateSession } from "../lib/security";

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: "admin" | "client";
    name: string;
  }
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

    // Check account lockout
    const lockSeconds = isAccountLocked(username);
    if (lockSeconds > 0) {
      res.status(429).json({ error: `Account locked. Try again in ${Math.ceil(lockSeconds / 60)} minutes.` });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user || user.role !== "admin") {
      if (username) recordFailedLogin(username, req.ip || "unknown");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedLogin(username, req.ip || "unknown");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    resetLoginAttempts(username);

    // Regenerate session ID to prevent session fixation attacks
    await regenerateSession(req);

    req.session.userId = user.id;
    req.session.role = "admin";
    req.session.name = user.name;

    res.json({ role: "admin", name: user.name, id: user.id });
  } catch (err) {
    logger.error({ err }, "Admin login error");
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

    const lockSeconds = isAccountLocked(username);
    if (lockSeconds > 0) {
      res.status(429).json({ error: `Account locked. Try again in ${Math.ceil(lockSeconds / 60)} minutes.` });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user || user.role !== "client") {
      if (username) recordFailedLogin(username, req.ip || "unknown");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordFailedLogin(username, req.ip || "unknown");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    resetLoginAttempts(username);

    // Regenerate session ID to prevent session fixation attacks
    await regenerateSession(req);

    req.session.userId = user.id;
    req.session.role = "client";
    req.session.name = user.name;

    res.json({ role: "client", name: user.name, id: user.id });
  } catch (err) {
    logger.error({ err }, "Client login error");
    res.status(500).json({ error: "Internal server error" });
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

    const passwordHash = await bcrypt.hash(password, 10);

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

router.get("/auth/me", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({
    role: req.session.role,
    name: req.session.name,
    id: req.session.userId,
  });
});

export default router;
