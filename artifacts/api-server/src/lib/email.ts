import nodemailer from "nodemailer";
import { db, adminConfigTable, notificationsTable, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { escapeHtml } from "./security";
import { eq } from "drizzle-orm";
import { createApprovalToken } from "./planApproval";

const EMAIL_KEYS = [
  "notif_recipient_email",
  "notif_smtp_host",
  "notif_smtp_port",
  "notif_smtp_user",
  "notif_smtp_pass",
  "notif_smtp_encryption",
] as const;

export type SmtpEncryption = "tls" | "ssl" | "none";

export async function getEmailConfig() {
  const rows = await db.select().from(adminConfigTable);
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));
  return {
    recipientEmail: map.get("notif_recipient_email") ?? "",
    smtpHost: map.get("notif_smtp_host") ?? "",
    smtpPort: Number(map.get("notif_smtp_port") ?? "587"),
    smtpUser: map.get("notif_smtp_user") ?? "",
    smtpPass: map.get("notif_smtp_pass") ?? "",
    smtpEncryption: (map.get("notif_smtp_encryption") ?? "tls") as SmtpEncryption,
  };
}

export function isSmtpConfigured(cfg: Awaited<ReturnType<typeof getEmailConfig>>) {
  return !!(cfg.smtpHost && cfg.smtpUser && cfg.smtpPass);
}

export function isEmailConfigured(cfg: Awaited<ReturnType<typeof getEmailConfig>>) {
  return !!(cfg.recipientEmail && cfg.smtpHost && cfg.smtpUser && cfg.smtpPass);
}

export function buildTransporter(cfg: Awaited<ReturnType<typeof getEmailConfig>>) {
  const enc = cfg.smtpEncryption;
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    // ssl → TLS-wrapped from the start (port 465)
    // tls → STARTTLS upgrade (port 587, nodemailer default when secure=false)
    // none → plain, no encryption
    secure: enc === "ssl",
    ignoreTLS: enc === "none",
    tls: enc === "none" ? { rejectUnauthorized: false } : undefined,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });
}

export async function sendNewTicketNotification(ticket: {
  id: number;
  title: string;
  description: string;
  clientName: string;
}) {
  try {
    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) return;

    const transporter = buildTransporter(cfg);
    await transporter.sendMail({
      from: `"Bot Manager" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      subject: `[New Problem #${ticket.id}] ${ticket.title}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f4f4f5;border-radius:10px;">
          <h2 style="margin:0 0 4px;color:#18181b;font-size:20px;">New Customer Problem</h2>
          <p style="margin:0 0 20px;color:#71717a;font-size:14px;">Submitted via Bot Manager</p>

          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:12px;background:#fff;border:1px solid #e4e4e7;border-radius:6px 6px 0 0;">
                <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;">Customer</p>
                <p style="margin:0;font-weight:600;color:#18181b;">${escapeHtml(ticket.clientName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px;background:#fff;border:1px solid #e4e4e7;border-top:0;">
                <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;">Problem</p>
                <p style="margin:0;font-weight:600;color:#18181b;">${escapeHtml(ticket.title)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px;background:#fff;border:1px solid #e4e4e7;border-top:0;border-radius:0 0 6px 6px;">
                <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;">Description</p>
                <p style="margin:0;color:#3f3f46;white-space:pre-wrap;line-height:1.6;font-size:14px;">${escapeHtml(ticket.description)}</p>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;">
            Log in to Bot Manager to review and resolve this problem.
          </p>
        </div>
      `,
    });

    logger.info({ ticketId: ticket.id }, "Ticket notification email sent");
  } catch (err) {
    logger.warn({ err }, "Failed to send ticket email (non-fatal)");
  }
}

/**
 * Send an actionable notification email to the admin for a new plan subscription or top-up request.
 * The admin can reply "OK" to instantly approve, auto-activate, and dispatch the invoice to the client,
 * or click the embedded 1-Click Instant Approval button.
 */
export async function sendPlanRequestAdminNotification(input: {
  id: number;
  title: string;
  description: string;
  clientName: string;
  clientEmail?: string;
  companyName?: string;
}) {
  try {
    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) {
      logger.warn({ ticketId: input.id }, "Admin email not configured, skipping plan request email notification");
      return;
    }

    const token = createApprovalToken(input.id);
    const appUrl =
      process.env.APP_URL ||
      (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : "http://localhost:5000");
    const approveUrl = `${appUrl}/api/admin/plan-requests/approve?ticketId=${input.id}&token=${token}`;

    const transporter = buildTransporter(cfg);

    const subject = `[طلب باقة جديد #${input.id}] ${input.title} (رد بـ OK للموافقة والتفعيل الفوري)`;

    const html = `
      <div dir="rtl" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f8fafc;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;color:#1e293b;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #0e1838 0%, #1e3a8a 100%);padding:28px 24px;color:#ffffff;text-align:center;">
          <span style="display:inline-block;padding:4px 12px;background:rgba(59,130,246,0.25);border:1px solid rgba(147,197,253,0.3);border-radius:20px;font-size:11px;font-weight:700;color:#bfdbfe;margin-bottom:8px;">
            طلب اشتراك / ترقية جديد • ACTION REQUIRED
          </span>
          <h2 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">طلب باقة جديد بحاجة للموافقة #${input.id}</h2>
          <p style="margin:6px 0 0;font-size:13px;color:#93c5fd;">تنبيه للإدارة من منصة Bot Manager</p>
        </div>

        <!-- Content Body -->
        <div style="padding:24px;">
          <!-- Action Callout Box (Prominent for "OK" reply) -->
          <div style="background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
            <h3 style="margin:0 0 10px;color:#1d4ed8;font-size:17px;font-weight:800;">⚡ طريقة الموافقة والتفعيل الفوري:</h3>
            <p style="margin:0 0 14px;color:#1e3a8a;font-size:14px;line-height:1.6;">
              يمكنك ببساطة <strong>الرد على هذا البريد الإلكتروني بكلمة "OK"</strong> أو <strong>"موافق"</strong>.<br/>
              فور وصول ردك، سيقوم النظام تلقائياً بتفعيل الباقة / شحن الرصيد لحساب العميل وإرسال الفاتورة الرسمية له عبر الواتساب والبريد!
            </p>
            <div style="margin:16px 0 8px;">
              <a href="${approveUrl}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:8px;box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                ✅ الموافقة والتفعيل بنقرة واحدة (One-Click Approve)
              </a>
            </div>
            <span style="display:block;margin-top:6px;font-size:11px;color:#64748b;">رابط آمن ومشفر برقم التذكرة #${input.id}</span>
          </div>

          <!-- Request Details Table -->
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;font-size:14px;">
            <tr>
              <td style="padding:12px 16px;background:#f8fafc;width:30%;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0;">
                العميل / Client:
              </td>
              <td style="padding:12px 16px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                ${escapeHtml(input.clientName)} ${input.clientEmail ? `<span style="font-size:12px;color:#64748b;">(${escapeHtml(input.clientEmail)})</span>` : ""}
              </td>
            </tr>
            ${
              input.companyName
                ? `<tr>
                    <td style="padding:12px 16px;background:#f8fafc;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0;">
                      الشركة / Company:
                    </td>
                    <td style="padding:12px 16px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">
                      ${escapeHtml(input.companyName)}
                    </td>
                  </tr>`
                : ""
            }
            <tr>
              <td style="padding:12px 16px;background:#f8fafc;font-weight:700;color:#475569;border-bottom:1px solid #e2e8f0;">
                الطلب / Request:
              </td>
              <td style="padding:12px 16px;font-weight:700;color:#2563eb;border-bottom:1px solid #e2e8f0;">
                ${escapeHtml(input.title)}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 16px;background:#f8fafc;font-weight:700;color:#475569;vertical-align:top;">
                تفاصيل الطلب:
              </td>
              <td style="padding:12px 16px;color:#334155;white-space:pre-wrap;line-height:1.6;font-size:13px;background:#ffffff;">
                ${escapeHtml(input.description)}
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">
            تلقيت هذا البريد لأن عنوانك مسجل في إعدادات إشعارات الإدارة (Email Notifications).<br/>
            يمكنك الرد بـ <strong>OK</strong> عبر تطبيق بريدك على الهاتف أو الحاسوب لمعالجة الطلب فوراً.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Bot Manager Notifications" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      replyTo: cfg.recipientEmail,
      subject,
      headers: {
        "X-Ticket-ID": String(input.id),
        "In-Reply-To": `<ticket-${input.id}@botmanager>`,
        "References": `<ticket-${input.id}@botmanager>`,
      },
      html,
    });

    logger.info({ ticketId: input.id, recipient: cfg.recipientEmail }, "Plan request admin notification email sent");
  } catch (err) {
    logger.warn({ err, ticketId: input.id }, "Failed to send plan request notification email (non-fatal)");
  }
}

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  try {
    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) {
      throw new Error("Email not configured");
    }
    const transporter = buildTransporter(cfg);
    await transporter.sendMail({
      from: `"Bot Manager" <${cfg.smtpUser}>`,
      to,
      subject: "Bot Manager — Password Reset",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f4f4f5;border-radius:10px;">
          <h2 style="margin:0 0 8px;color:#18181b;">Reset Your Password</h2>
          <p style="color:#71717a;margin:0 0 20px;">You requested a password reset. Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${encodeURI(resetLink)}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Reset Password</a>
          <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;">If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    logger.info({ to }, "Password reset email sent");
  } catch (err) {
    logger.warn({ err }, "Failed to send password reset email");
    throw err;
  }
}

export async function sendTestEmail() {
  const cfg = await getEmailConfig();
  if (!isEmailConfigured(cfg)) {
    throw new Error("Email not configured");
  }
  const transporter = buildTransporter(cfg);
  await transporter.sendMail({
    from: `"Bot Manager" <${cfg.smtpUser}>`,
    to: cfg.recipientEmail,
    subject: "Bot Manager — Test Email",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f4f4f5;border-radius:10px;">
        <h2 style="margin:0 0 8px;color:#18181b;">Test Email ✓</h2>
        <p style="color:#71717a;margin:0;">Your email notifications are working correctly. You'll receive an alert like this whenever a customer submits a new problem.</p>
      </div>
    `,
  });
}


export async function sendClientNotification(clientEmail: string, title: string, messageText: string) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #3b82f6; padding: 20px; color: white;">
        <h2 style="margin: 0;">New Notification</h2>
      </div>
      <div style="padding: 20px;">
        <p style="font-size: 16px; margin-bottom: 8px;"><strong>${escapeHtml(title)}</strong></p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 20px;">
          ${escapeHtml(messageText).replace(/\n/g, "<br>")}
        </p>
        <p style="font-size: 14px; margin-bottom: 20px;">
          Please check the Bot Manager client portal for more details.
        </p>
      </div>
    </div>
  `;

  const cfg = await getEmailConfig();
  if (!isSmtpConfigured(cfg)) {
    logger.warn({ clientEmail }, "Cannot send client notification email: SMTP host, user, or pass are not configured in admin settings.");
    return;
  }
  const transporter = buildTransporter(cfg);
  await transporter.sendMail({
    from: `"Bot Manager" <${cfg.smtpUser}>`,
    to: clientEmail,
    subject: `[Notification] ${title}`,
    html
  });
  logger.info({ clientEmail, title }, "Client notification email sent successfully");
}

export async function sendAttackSpikeNotification(input: {
  recentFailedAttempts: number;
  windowMinutes: number;
}) {
  const title = "Security alert: failed-login spike";
  const message = `${input.recentFailedAttempts} failed login attempts were detected within ${input.windowMinutes} minutes. Review the Attack Monitoring page immediately.`;

  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map((admin) => ({
          userId: admin.id,
          type: "security_alert",
          title,
          message,
          companyId: null,
          isRead: false,
        })),
      );
    }
    logger.info({ adminCount: admins.length }, "Security alert added to admin notifications");
  } catch (err) {
    logger.error({ err }, "Failed to add security alert to admin notifications");
  }

  try {
    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) {
      logger.warn("Security alert recorded in notifications, but email is not configured");
      return;
    }

    const transporter = buildTransporter(cfg);
    await transporter.sendMail({
      from: `"Bot Manager" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      subject: `[Security Alert] ${input.recentFailedAttempts} failed login attempts`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
          <h2 style="margin:0 0 8px;color:#991b1b;">Security Alert</h2>
          <p style="margin:0 0 18px;color:#7f1d1d;font-size:15px;">${escapeHtml(message)}</p>
          <p style="margin:0;color:#450a0a;font-size:13px;">Open Bot Manager → Attack Monitoring to review IP addresses, targeted accounts, and automatic blocks.</p>
        </div>
      `,
    });

    logger.info({ recentFailedAttempts: input.recentFailedAttempts }, "Security alert email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send security alert email");
  }
}
export type SecurityEventType = 'failed_attempts_warning' | 'account_locked' | 'ip_blocked';

export async function sendSecurityEventEmail(
  event: SecurityEventType,
  ip: string,
  username: string,
  attempts: number,
) {
  let title: string;
  let message: string;
  let subjectBadge: string;
  let alertHeaderBg: string;
  let alertHeaderColor: string;
  let alertTitleAr: string;
  let alertSubtitleAr: string;

  if (event === "failed_attempts_warning") {
    title = `تحذير أمني: ${attempts} محاولات دخول فاشلة متتالية (${username})`;
    message = `تم رصد ${attempts} محاولات تسجيل دخول فاشلة متتالية للحساب "${username}" من عنوان IP: ${ip}. يرجى مراجعة صفحة مراقبة الهجوم.`;
    subjectBadge = "تحذير أمني";
    alertHeaderBg = "#fef3c7";
    alertHeaderColor = "#92400e";
    alertTitleAr = "تحذير: محاولات تسجيل دخول فاشلة متتالية";
    alertSubtitleAr = `تم رصد نشاط دخول مشبوه بعد ${attempts} محاولات متتالية`;
  } else if (event === "account_locked") {
    title = `تنبيه أمني: تم قفل الحساب (${username})`;
    message = `تم قفل الحساب "${username}" مؤقتًا بعد وصول محاولات تسجيل الدخول الفاشلة إلى ${attempts} محاولات من عنوان IP: ${ip}.`;
    subjectBadge = "قفل حساب";
    alertHeaderBg = "#fee2e2";
    alertHeaderColor = "#991b1b";
    alertTitleAr = "تنبيه أمني: تم قفل الحساب مؤقتًا";
    alertSubtitleAr = `تجاوز الحد الأقصى للمحاولات الفاشلة (${attempts} محاولات)`;
  } else {
    title = `تنبيه أمني: تم حظر عنوان IP (${ip})`;
    message = `تم حظر عنوان IP: ${ip} تلقائيًا بعد ${attempts} محاولات مشبوهة استهدفت الحساب "${username}".`;
    subjectBadge = "حظر IP";
    alertHeaderBg = "#fee2e2";
    alertHeaderColor = "#7f1d1d";
    alertTitleAr = "تنبيه عاجل: تم حظر عنوان IP تلقائيًا";
    alertSubtitleAr = "نشاط مشبوه متكرر استهدف خادم النظام";
  }

  // 1. Insert into notificationsTable for all admins so the notification bell icon pulses and increments
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map((admin) => ({
          userId: admin.id,
          type: "security_alert",
          title,
          message,
          companyId: null,
          isRead: false,
        })),
      );
      logger.info({ event, adminCount: admins.length }, "Security alert added to admin notification bell");
    }
  } catch (err) {
    logger.error({ err }, "Failed to add security alert to admin notifications table");
  }

  // 2. Dispatch email to configured recipient email (diaakhaled22@gmail.com) via SMTP
  try {
    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) {
      logger.warn({ recipient: cfg.recipientEmail }, "Security event email skipped: SMTP not fully configured");
      return;
    }

    const transporter = buildTransporter(cfg);
    const dateStr = new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });

    await transporter.sendMail({
      from: `"Bot Manager Security" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      subject: `[${subjectBadge}] ${title}`,
      html: `
        <div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background-color: ${alertHeaderBg}; padding: 24px 20px; border-bottom: 2px solid ${alertHeaderColor}; text-align: center;">
            <div style="font-size: 36px; line-height: 1; margin-bottom: 8px;">🛡️</div>
            <h2 style="margin: 0; color: ${alertHeaderColor}; font-size: 20px; font-weight: 700;">${escapeHtml(alertTitleAr)}</h2>
            <p style="margin: 6px 0 0; color: ${alertHeaderColor}; opacity: 0.9; font-size: 13px;">${escapeHtml(alertSubtitleAr)}</p>
          </div>

          <div style="padding: 24px 20px;">
            <p style="font-size: 15px; color: #1f2937; line-height: 1.6; margin: 0 0 20px; font-weight: 500;">
              ${escapeHtml(message)}
            </p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
              <tbody>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 12px; color: #6b7280; width: 40%; font-weight: 600;">اسم المستخدم المستهدف:</td>
                  <td style="padding: 10px 12px; color: #111827; font-weight: bold; font-family: monospace;">${escapeHtml(username)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 12px; color: #6b7280; font-weight: 600;">عنوان IP المصدر:</td>
                  <td style="padding: 10px 12px; color: #111827; font-weight: bold; font-family: monospace;">${escapeHtml(ip)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 12px; color: #6b7280; font-weight: 600;">عدد المحاولات الفاشلة:</td>
                  <td style="padding: 10px 12px; color: #dc2626; font-weight: bold;">${attempts} محاولات</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; color: #6b7280; font-weight: 600;">توقيت الرصد:</td>
                  <td style="padding: 10px 12px; color: #111827;">${escapeHtml(dateStr)}</td>
                </tr>
              </tbody>
            </table>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
                ℹ️ <strong>الإجراء المقترح:</strong> يمكنك الدخول إلى لوحة تحكم المسؤول ثم التوجه إلى صفحة <strong>مراقبة الهجوم (Attack Monitoring)</strong> لعرض تفاصيل المحاولات أو حظر عنوان الـ IP يدويًا إذا تطلب الأمر.
              </p>
            </div>
          </div>

          <div style="background-color: #f9fafb; padding: 14px 20px; border-top: 1px solid #f3f4f6; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">نظام الحماية والأمان — Bot Manager</p>
          </div>
        </div>
      `,
    });
    logger.info({ event, ip, recipient: cfg.recipientEmail }, "Security event email sent successfully to admin");
  } catch (err) {
    logger.error({ err }, "Failed to send security event email");
  }
}

export async function sendMalfunctionNotification(input: {
  id?: number;
  title: string;
  description: string;
  source?: string;
  companyId?: number | null;
  companyName?: string;
}) {
  const notifTitle = input.companyName
    ? `عطل جديد (${input.companyName}): ${input.title}`
    : `عطل جديد: ${input.title}`;
  const notifMessage = input.description;

  // 1. Insert into notificationsTable for all admins so the notification bell icon alerts the admin
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map((admin) => ({
          userId: admin.id,
          type: "malfunction",
          title: notifTitle,
          message: notifMessage,
          companyId: input.companyId ?? null,
          isRead: false,
        })),
      );
    }
    logger.info({ adminCount: admins.length, title: input.title }, "Malfunction alert added to admin notifications bell");
  } catch (err) {
    logger.error({ err }, "Failed to add malfunction alert to admin notifications");
  }

  // 2. Send email via configured SMTP to Recipient Email (diaakhaled22@gmail.com)
  try {
    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) {
      logger.warn("Malfunction recorded, but admin email notifications SMTP is not fully configured");
      return;
    }

    const transporter = buildTransporter(cfg);
    await transporter.sendMail({
      from: `"Bot Manager" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      subject: `🚨 [New Malfunction Reported] ${input.title}`,
      html: `
        <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
          <div style="background:#dc2626;color:#ffffff;padding:16px 20px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:18px;">⚠️ New Malfunction Reported | عطل جديد تم الإبلاغ عنه</h2>
          </div>
          <div style="background:#ffffff;padding:20px;border:1px solid #fee2e2;border-top:0;border-radius:0 0 8px 8px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;">
                  <span style="color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;">العنوان / Title:</span>
                  <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#18181b;">${escapeHtml(input.title)}</p>
                </td>
              </tr>
              ${input.companyName ? `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;">
                  <span style="color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;">الشركة / Company:</span>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;">${escapeHtml(input.companyName)}</p>
                </td>
              </tr>
              ` : ""}
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f4f4f5;">
                  <span style="color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;">المصدر / Source:</span>
                  <p style="margin:4px 0 0;font-size:14px;color:#18181b;">${escapeHtml(input.source || "Client / System")}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;">
                  <span style="color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;">التفاصيل / Description:</span>
                  <p style="margin:6px 0 0;color:#3f3f46;white-space:pre-wrap;line-height:1.6;font-size:14px;background:#f9fafb;padding:12px;border-radius:6px;border:1px solid #f3f4f6;">${escapeHtml(input.description)}</p>
                </td>
              </tr>
            </table>

            <div style="margin-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#71717a;">
                Log in to Bot Manager Admin &gt; Malfunctions to review and resolve this issue.
              </p>
            </div>
          </div>
        </div>
      `,
    });

    logger.info({ title: input.title, recipient: cfg.recipientEmail }, "Malfunction alert email sent to admin recipient successfully");
  } catch (err) {
    logger.error({ err }, "Failed to send malfunction alert email to admin recipient");
  }
}

export async function sendNewClientNotification(client: {
  id: number;
  name: string;
  username: string;
  email?: string | null;
  ip?: string | null;
  mac?: string | null;
  source?: "self_registration" | "admin_created";
}) {
  const isSelf = client.source !== "admin_created";
  const title = isSelf ? "New Client Registered" : "New Client Account Created";
  const message = isSelf
    ? `New client "${client.name}" (@${client.username}) registered successfully.${client.email ? ` Email: ${client.email}.` : ""}${client.ip ? ` IP: ${client.ip}.` : ""}${client.mac ? ` MAC: ${client.mac}.` : ""}`
    : `New client account "${client.name}" (@${client.username}) was added.${client.email ? ` Email: ${client.email}.` : ""}`;

  // 1. In-App Notification in Admin notification panel (bell icon)
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map((admin) => ({
          userId: admin.id,
          type: "new_client",
          title,
          message,
          companyId: null,
          isRead: false,
        }))
      );
    }
    logger.info({ clientId: client.id, adminCount: admins.length }, "New client notification added to admin notification panel");
  } catch (err) {
    logger.error({ err, clientId: client.id }, "Failed to add new client notification to admin panel");
  }

  // 2. Email notification via "Email Notifications" settings
  try {
    const cfg = await getEmailConfig();
    if (!isEmailConfigured(cfg)) {
      logger.info({ clientId: client.id }, "Email Notifications are not fully configured — skipped sending new client email.");
      return;
    }

    const transporter = buildTransporter(cfg);
    await transporter.sendMail({
      from: `"Bot Manager" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      subject: `[New Client] ${client.name} (@${client.username})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
          <!-- Header -->
          <div style="background:linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%);padding:28px 24px;text-align:center;color:#ffffff;">
            <div style="display:inline-block;width:52px;height:52px;line-height:52px;background:rgba(255,255,255,0.18);border-radius:14px;margin-bottom:12px;font-size:24px;">
              👤
            </div>
            <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(title)}</h1>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.9);">
              ${isSelf ? "A new client has self-registered via the Client Portal" : "A new client account was created in Bot Manager"}
            </p>
          </div>

          <!-- Body Content -->
          <div style="padding:24px;">
            <p style="font-size:14px;color:#475569;margin:0 0 16px;line-height:1.5;">
              Hello Admin, a new client account has been added to your Bot Manager platform. Here are the account details:
            </p>

            <table style="width:100%;border-collapse:separate;border-spacing:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px;">
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#64748b;width:35%;">Client Name</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(client.name)}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#64748b;">Username</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;font-family:monospace;color:#2563eb;font-weight:600;">@${escapeHtml(client.username)}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#64748b;">Gmail / Email</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">${client.email ? escapeHtml(client.email) : "<span style='color:#94a3b8;'>—</span>"}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#64748b;">IP Address</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;font-family:monospace;color:#0f172a;">${client.ip ? escapeHtml(client.ip) : "<span style='color:#94a3b8;'>—</span>"}</td>
              </tr>
              ${client.mac ? `
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#64748b;">MAC Address</td>
                <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;font-family:monospace;color:#0f172a;">${escapeHtml(client.mac)}</td>
              </tr>` : ""}
              <tr>
                <td style="padding:12px 16px;font-size:12px;font-weight:600;color:#64748b;">Date Added</td>
                <td style="padding:12px 16px;font-size:13px;color:#334155;">${new Date().toLocaleString()}</td>
              </tr>
            </table>

            <div style="text-align:center;margin-top:20px;">
              <p style="font-size:12px;color:#64748b;margin:0 0 12px;">Log in to Bot Manager Admin &gt; Clients Directory to configure or attach companies.</p>
            </div>
          </div>

          <!-- Footer -->
          <div style="padding:14px 24px;background:#f1f5f9;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#64748b;">
            This email was sent automatically based on your <strong>Email Notifications</strong> configuration in Bot Manager.
          </div>
        </div>
      `,
    });

    logger.info({ clientId: client.id, recipient: cfg.recipientEmail }, "New client notification email sent successfully");
  } catch (emailErr) {
    logger.warn({ emailErr, clientId: client.id }, "Failed to send new client email notification (non-fatal)");
  }
}


