import { Router } from "express";
import type { Request } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable, passwordResetTokensTable, companiesTable, notificationsTable, emailVerificationCodesTable } from "@workspace/db";
import { eq, and, gt, sql, or } from "drizzle-orm";
import { AdminLoginBody, ClientLoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { getResendConfig } from "../lib/companyNotification";
import { sendAttackSpikeNotification, sendPasswordResetEmail, sendNewClientNotification, getEmailConfig, isEmailConfigured, isSmtpConfigured, buildTransporter } from "../lib/email";
import {
  maskApiKey,
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
  isTotpSecretUnavailable,
  isTotpCodeUsed,
  markTotpCodeUsed,
} from "../lib/security";
import { authenticator } from "otplib";

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: "admin" | "client";
    name: string;
  }
}

export interface Temp2FaSession {
  userId: number;
  username: string;
  name: string;
  expiresAt: number;
  attempts: number;
}

export const temp2faTokens = new Map<string, Temp2FaSession>();

function extractClientIp(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || "unknown";
  return raw.replace(/^::ffff:/i, "").trim() || "unknown";
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
    const clientIp = extractClientIp(req);

    if (isIpBlocked(clientIp)) {
      res.status(429).json({ error: "Suspicious activity detected. This IP address is temporarily blocked." });
      return;
    }

    // Check account lockout
    const lockSeconds = isAccountLocked(username, clientIp);
    if (lockSeconds > 0) {
      recordBlockedLoginAttempt(username, clientIp);
      res.status(429).json({ error: `Account locked due to too many failed attempts. Try again in ${Math.ceil(lockSeconds / 60)} minutes.` });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user || user.role !== "admin") {
      if (username) {
        const result = recordFailedLogin(username, clientIp);
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

    const valid = password !== "admin123" && await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const result = recordFailedLogin(username, clientIp);
      if (result.spikeDetected) {
        void sendAttackSpikeNotification({
          recentFailedAttempts: result.recentFailedAttempts,
          windowMinutes: 5,
        });
      }
      res.status(401).json({ error: "Invalid login credentials" });
      return;
    }

    resetLoginAttempts(username, clientIp);

    if (isTotpSecretUnavailable(user.id)) {
      res.status(503).json({ error: "Admin two-factor credentials require secure re-enrollment. Contact the system operator." });
      return;
    }

    const totpSecret = getTotpSecret(user.id);
    if (totpSecret) {
      // Create a temporary token scoped to user with attempt limits
      const tempToken = crypto.randomBytes(32).toString("hex");
      temp2faTokens.set(tempToken, {
        userId: user.id,
        username: user.username,
        name: user.name,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
      });
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

    const clientIp = extractClientIp(req);

    // 1. Check account lockout before verifying code
    const lockSeconds = isAccountLocked(tokenData.username, clientIp);
    if (lockSeconds > 0) {
      temp2faTokens.delete(tempToken);
      recordBlockedLoginAttempt(tokenData.username, clientIp);
      res.status(429).json({ error: `Account locked due to too many failed attempts. Try again in ${Math.ceil(lockSeconds / 60)} minutes.` });
      return;
    }

    const secret = getTotpSecret(tokenData.userId);
    if (!secret) {
      temp2faTokens.delete(tempToken);
      res.status(400).json({ error: "2FA is not enabled for this user" });
      return;
    }

    const cleanCode = code.trim();

    // 2. Prevent replay attacks: check if this code was already used
    if (isTotpCodeUsed(tokenData.userId, cleanCode)) {
      res.status(401).json({ error: "This verification code has already been used. Please wait for the next code." });
      return;
    }

    const isValid = authenticator.verify({ token: cleanCode, secret });
    if (!isValid) {
      tokenData.attempts = (tokenData.attempts || 0) + 1;
      const failedResult = recordFailedLogin(tokenData.username, clientIp);

      // Invalidate tempToken after 3 failed attempts or if account gets locked
      if (tokenData.attempts >= 3 || failedResult.accountLocked) {
        temp2faTokens.delete(tempToken);
        res.status(401).json({ error: "Too many failed 2FA verification attempts. Session invalidated. Please log in again." });
        return;
      }

      const remainingAttempts = 3 - tokenData.attempts;
      res.status(401).json({
        error: `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} remaining.`,
      });
      return;
    }

    // Mark code as used to prevent replay
    markTotpCodeUsed(tokenData.userId, cleanCode);
    temp2faTokens.delete(tempToken);
    resetLoginAttempts(tokenData.username, clientIp);

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
    const clientIp = extractClientIp(req);

    if (isIpBlocked(clientIp)) {
      res.status(429).json({ error: "Suspicious activity detected. This IP address is temporarily blocked." });
      return;
    }

    const lockSeconds = isAccountLocked(username, clientIp);
    if (lockSeconds > 0) {
      recordBlockedLoginAttempt(username, clientIp);
      res.status(429).json({ error: `Account locked due to too many failed attempts. Try again in ${Math.ceil(lockSeconds / 60)} minutes.` });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user || user.role !== "client") {
      if (username) {
        const result = recordFailedLogin(username, clientIp);
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
      const result = recordFailedLogin(username, clientIp);
      if (result.spikeDetected) {
        void sendAttackSpikeNotification({
          recentFailedAttempts: result.recentFailedAttempts,
          windowMinutes: 5,
        });
      }
      res.status(401).json({ error: "Invalid login credentials" });
      return;
    }

    resetLoginAttempts(username, clientIp);

    // Regenerate session ID to prevent session fixation attacks
    await regenerateSession(req);

    const loginUpdates: Record<string, any> = { lastLoginIp: clientIp };

    await db
      .update(usersTable)
      .set(loginUpdates)
      .where(eq(usersTable.id, user.id))
      .catch((err) => logger.warn({ err }, "Failed to update last login IP"));

    req.session.userId = user.id;
    req.session.role = "client";
    req.session.name = user.name;

    res.json({ role: "client", name: user.name, id: user.id });
  } catch (err) {
    logger.error({ err }, "Client login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [localPart, domain] = trimmed.split("@");
  if (!localPart || !domain) return trimmed;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const cleanLocal = localPart.split("+")[0].replace(/\./g, "");
    return `${cleanLocal}@gmail.com`;
  }
  return `${localPart}@${domain}`;
}

router.post("/auth/send-registration-otp", sensitiveLimiter, async (req, res) => {
  try {
    const { email, username, name, lang } = req.body as {
      email?: string;
      username?: string;
      name?: string;
      lang?: string;
    };
    const isAr = lang !== "en";
    const clientIp = extractClientIp(req);

    if (isIpBlocked(clientIp)) {
      res.status(429).json({ error: isAr ? "تم حظر هذا الـ IP مؤقتاً بسبب نشاط مشبوه." : "Suspicious activity detected. IP blocked." });
      return;
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: isAr ? "يرجى إدخال بريد إلكتروني صحيح" : "Please provide a valid email address" });
      return;
    }

    const cleanEmail = normalizeEmail(email);

    if (username && typeof username === "string") {
      const cleanUsername = username.trim().toLowerCase();
      const [existingUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.username, cleanUsername))
        .limit(1);
      if (existingUser) {
        res.status(409).json({ error: isAr ? "اسم المستخدم مستخدم بالفعل. يرجى اختيار اسم آخر." : "Username already taken." });
        return;
      }
    }

    // Check if email already registered
    const [existingEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "client"),
          or(
            eq(usersTable.email, cleanEmail),
            eq(usersTable.notificationEmail, cleanEmail)
          )
        )
      )
      .limit(1);

    if (existingEmail) {
      res.status(409).json({
        error: isAr ? "هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول مباشرة." : "This email is already registered. Please sign in.",
      });
      return;
    }

    // Ensure email_verification_codes table exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email ON email_verification_codes(email);
    `).catch(() => {});

    // Cooldown check (60 seconds) & Hourly limit (5 max)
    const recentCodes = await db
      .select()
      .from(emailVerificationCodesTable)
      .where(eq(emailVerificationCodesTable.email, cleanEmail))
      .orderBy(sql`${emailVerificationCodesTable.id} DESC`)
      .limit(5);

    if (recentCodes.length > 0) {
      const latest = recentCodes[0];
      const timeSinceLatest = Date.now() - new Date(latest.createdAt).getTime();
      if (timeSinceLatest < 60000) {
        const remainingSec = Math.ceil((60000 - timeSinceLatest) / 1000);
        res.status(429).json({
          error: isAr
            ? `يرجى الانتظار ${remainingSec} ثانية قبل طلب كود جديد.`
            : `Please wait ${remainingSec}s before requesting a new code.`,
        });
        return;
      }

      // Check count in last 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const codesInLastHour = recentCodes.filter((c) => new Date(c.createdAt) > oneHourAgo);
      if (codesInLastHour.length >= 5) {
        res.status(429).json({
          error: isAr
            ? "تم تجاوز الحد الأقصى لمحاولات إرسال الكود لهذا الإيميل (5 محاولات في الساعة). يرجى المحاولة لاحقاً."
            : "Too many verification requests for this email. Please try again later.",
        });
        return;
      }
    }

    // Check Email Delivery Providers: Prefer Resend, fallback to Admin SMTP (Gmail)
    const { apiKey, fromEmail } = await getResendConfig();
    const smtpCfg = await getEmailConfig();
    const smtpReady = isSmtpConfigured(smtpCfg);

    if (!apiKey && !smtpReady) {
      res.status(503).json({
        error: isAr
          ? "خدمة تأكيد البريد الإلكتروني غير مهيأة حالياً. يرجى التواصل مع إدارة النظام."
          : "Email verification service is not configured. Please contact support.",
      });
      return;
    }

    // Generate cryptographically secure 6-digit code
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

    // Insert new OTP record
    await db.insert(emailVerificationCodesTable).values({
      email: cleanEmail,
      code: otpCode,
      attempts: 0,
      expiresAt,
    });

    // Email content
    const sender = fromEmail || (smtpReady ? `"Bot Manager" <${smtpCfg.smtpUser}>` : "Bot Manager <onboarding@resend.dev>");
    const subject = isAr
      ? `رمز التحقق الخاص بك: ${otpCode} | منصة المساعد الذكي`
      : `Your Verification Code: ${otpCode} | AI Chatbot`;

    const html = `
      <div dir="${isAr ? "rtl" : "ltr"}" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e293b; margin: 0; font-size: 22px;">${isAr ? "تأكيد البريد الإلكتروني" : "Verify Your Email"}</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 6px;">
            ${isAr ? `مرحباً ${name ? name.trim() : ""}، استخدم الرمز التالي لتفعيل حسابك الجديد:` : `Hello ${name ? name.trim() : ""}, use the code below to complete your registration:`}
          </p>
        </div>

        <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2563eb; display: inline-block;">
            ${otpCode}
          </span>
        </div>

        <div style="background-color: #fef2f2; border-right: 4px solid #ef4444; border-radius: 6px; padding: 12px; margin-bottom: 20px;">
          <p style="margin: 0; color: #991b1b; font-size: 13px; font-weight: 600;">
            ${isAr ? "صلاحية هذا الرمز 10 دقائق فقط. لا تشارك هذا الرمز مع أي شخص لحماية حسابك." : "This code expires in 10 minutes. Never share this code with anyone."}
          </p>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          ${isAr ? "إذا لم تقم بطلب هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان." : "If you did not request this registration, you can safely ignore this email."}
        </p>
      </div>
    `;

    let emailSent = false;
    let lastError = "";

    // 1. Try Resend if configured
    if (apiKey) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: sender,
            to: [email.trim()],
            subject,
            html,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
          logger.info({ email: cleanEmail }, "Registration OTP sent successfully via Resend");
        } else {
          const errText = await resendRes.text();
          lastError = errText;
          logger.warn({ status: resendRes.status, err: errText }, "Resend OTP send failed, attempting SMTP fallback");
        }
      } catch (rErr: any) {
        lastError = rErr?.message || "Resend network error";
        logger.warn({ err: rErr }, "Resend exception while sending OTP, attempting SMTP fallback");
      }
    }

    // 2. Fallback to Admin SMTP (Gmail) if Resend failed or not configured
    if (!emailSent && smtpReady) {
      try {
        const transporter = buildTransporter(smtpCfg);
        await transporter.sendMail({
          from: `"Bot Manager" <${smtpCfg.smtpUser}>`,
          to: email.trim(),
          subject,
          html,
        });
        emailSent = true;
        logger.info({ email: cleanEmail, via: "SMTP" }, "Registration OTP sent successfully via SMTP (Gmail)");
      } catch (smtpErr: any) {
        lastError = smtpErr?.message || "SMTP error";
        logger.error({ err: smtpErr, email: cleanEmail }, "SMTP failed to send registration OTP");
      }
    }

    if (!emailSent) {
      let friendlyError = isAr ? "فشل إرسال كود التحقق عبر البريد الإلكتروني." : "Failed to send verification code.";
      if (lastError.includes("testing emails")) {
        friendlyError = isAr
          ? "يرجى التأكد من إعدادات الـ SMTP في لوحة التحكم أو توثيق الدومين في Resend."
          : "Delivery restriction: Please configure Admin SMTP or verify custom domain in Resend.";
      }
      res.status(500).json({ error: friendlyError });
      return;
    }

    res.json({
      ok: true,
      message: isAr ? "تم إرسال كود التحقق إلى بريدك الإلكتروني بنجاح." : "Verification code sent to your email successfully.",
      email: cleanEmail,
    });
  } catch (err: any) {
    logger.error({ err }, "Error in send-registration-otp");
    res.status(500).json({ error: err.message || "Failed to process verification request" });
  }
});

router.post("/auth/client/register", authLimiter, async (req, res) => {
  try {
    const { name, username, email, password, otpCode, lang } = req.body as {
      name?: string;
      username?: string;
      email?: string;
      password?: string;
      otpCode?: string;
      lang?: string;
    };
    const isAr = lang !== "en";
    const clientIp = extractClientIp(req);

    if (isIpBlocked(clientIp)) {
      res.status(429).json({ error: isAr ? "تم حظر هذا الـ IP مؤقتاً بسبب نشاط مشبوه." : "Suspicious activity detected. This IP address is temporarily blocked." });
      return;
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: isAr ? "الاسم يجب أن يكون حرفين على الأقل" : "Name must be at least 2 characters" });
      return;
    }

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      res.status(400).json({ error: isAr ? "اسم المستخدم يجب أن يكون 3 أحرف على الأقل" : "Username must be at least 3 characters" });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    if (!password || typeof password !== "string") {
      res.status(400).json({ error: isAr ? "كلمة المرور مطلوبة" : "Password is required" });
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: isAr ? "يرجى إدخال بريد إلكتروني صحيح" : "A valid email is required" });
      return;
    }
    const cleanEmail = normalizeEmail(email);

    // Verify OTP code
    if (!otpCode || typeof otpCode !== "string" || otpCode.trim().length !== 6) {
      res.status(400).json({
        error: isAr
          ? "يرجى إدخال رمز التحقق المكون من 6 أرقام المرسل إلى بريدك الإلكتروني."
          : "Please enter the 6-digit verification code sent to your email.",
      });
      return;
    }

    const [verificationRecord] = await db
      .select()
      .from(emailVerificationCodesTable)
      .where(eq(emailVerificationCodesTable.email, cleanEmail))
      .orderBy(sql`${emailVerificationCodesTable.id} DESC`)
      .limit(1);

    if (!verificationRecord) {
      res.status(400).json({
        error: isAr
          ? "لم يتم العثور على رمز تحقق لهذا البريد. يرجى طلب رمز جديد أولاً."
          : "No verification code found for this email. Please request a new code.",
      });
      return;
    }

    if (new Date(verificationRecord.expiresAt) < new Date()) {
      await db.delete(emailVerificationCodesTable).where(eq(emailVerificationCodesTable.id, verificationRecord.id));
      res.status(400).json({
        error: isAr
          ? "انتهت صلاحية رمز التحقق (10 دقائق). يرجى طلب رمز جديد."
          : "Verification code has expired. Please request a new code.",
      });
      return;
    }

    if (verificationRecord.attempts >= 5) {
      await db.delete(emailVerificationCodesTable).where(eq(emailVerificationCodesTable.id, verificationRecord.id));
      res.status(429).json({
        error: isAr
          ? "تم تجاوز الحد الأقصى للمحاولات الخاطئة. تم إلغاء الرمز لأسباب أمنية، يرجى طلب رمز جديد."
          : "Too many failed attempts. Code invalidated, please request a new one.",
      });
      return;
    }

    if (verificationRecord.code !== otpCode.trim()) {
      await db
        .update(emailVerificationCodesTable)
        .set({ attempts: verificationRecord.attempts + 1 })
        .where(eq(emailVerificationCodesTable.id, verificationRecord.id));
      const remaining = 5 - (verificationRecord.attempts + 1);
      res.status(400).json({
        error: isAr
          ? `رمز التحقق غير صحيح. متبقي ${remaining} محاولات.`
          : `Invalid verification code. ${remaining} attempts remaining.`,
      });
      return;
    }

    // Code is valid! Delete verification records for this email
    await db.delete(emailVerificationCodesTable).where(eq(emailVerificationCodesTable.email, cleanEmail));

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
      res.status(409).json({ error: isAr ? "اسم المستخدم مستخدم بالفعل. يرجى اختيار اسم آخر." : "Username already taken." });
      return;
    }

    const [existingEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "client"),
          or(
            eq(usersTable.email, cleanEmail),
            eq(usersTable.notificationEmail, cleanEmail)
          )
        )
      )
      .limit(1);

    if (existingEmail) {
      res.status(409).json({
        error: isAr ? "هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول مباشرة." : "This email is already registered.",
      });
      return;
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
        res.status(409).json({
          error: isAr ? "تم تسجيل حساب مسبقاً من هذا الجهاز/الشبكة. يرجى تسجيل الدخول أو التواصل مع الدعم." : "Unable to create account. Please contact support if you need assistance.",
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
        email: cleanEmail,
        notificationEmail: cleanEmail,
        lastLoginIp: clientIp,
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
      email: newUser.email || newUser.notificationEmail || null,
      ip: clientIp || null,
      mac: null,
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

    // Global fallbacks for notification email and resend api key (e.g. for admin or shared config)
    if (!notificationEmail) {
      try {
        const [compWithEmail] = await db
          .select({ notificationEmail: companiesTable.notificationEmail })
          .from(companiesTable)
          .where(and(sql`${companiesTable.notificationEmail} IS NOT NULL`, sql`${companiesTable.notificationEmail} != ''`))
          .limit(1);
        if (compWithEmail?.notificationEmail?.trim()) {
          notificationEmail = compWithEmail.notificationEmail.trim();
        }
      } catch {}
    }

    if (!notificationEmail) {
      try {
        const [uWithEmail] = await db
          .select({ notificationEmail: usersTable.notificationEmail })
          .from(usersTable)
          .where(and(sql`${usersTable.notificationEmail} IS NOT NULL`, sql`${usersTable.notificationEmail} != ''`))
          .limit(1);
        if (uWithEmail?.notificationEmail?.trim()) {
          notificationEmail = uWithEmail.notificationEmail.trim();
        }
      } catch {}
    }

    if (!resendApiKey) {
      try {
        const [compWithKey] = await db
          .select({ resendApiKey: companiesTable.resendApiKey })
          .from(companiesTable)
          .where(and(sql`${companiesTable.resendApiKey} IS NOT NULL`, sql`${companiesTable.resendApiKey} != ''`))
          .limit(1);
        if (compWithKey?.resendApiKey?.trim()) {
          resendApiKey = compWithKey.resendApiKey.trim();
        }
      } catch {}
    }

    if (!resendApiKey) {
      try {
        const [uWithKey] = await db
          .select({ resendApiKey: usersTable.resendApiKey })
          .from(usersTable)
          .where(and(sql`${usersTable.resendApiKey} IS NOT NULL`, sql`${usersTable.resendApiKey} != ''`))
          .limit(1);
        if (uWithKey?.resendApiKey?.trim()) {
          resendApiKey = uWithKey.resendApiKey.trim();
        }
      } catch {}
    }

    res.json({
      role: user.role,
      name: user.name,
      username: user.username,
      id: user.id,
      notificationEmail,
      resendApiKey: maskApiKey(resendApiKey),
    });
  } catch (err) {
    logger.error({ err }, "Get me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
