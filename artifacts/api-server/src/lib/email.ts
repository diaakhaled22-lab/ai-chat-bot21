import nodemailer from "nodemailer";
import { db, adminConfigTable } from "@workspace/db";
import { logger } from "./logger";

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

export function isEmailConfigured(cfg: Awaited<ReturnType<typeof getEmailConfig>>) {
  return !!(cfg.recipientEmail && cfg.smtpHost && cfg.smtpUser && cfg.smtpPass);
}

function buildTransporter(cfg: Awaited<ReturnType<typeof getEmailConfig>>) {
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
      from: `"Mission Control" <${cfg.smtpUser}>`,
      to: cfg.recipientEmail,
      subject: `[New Problem #${ticket.id}] ${ticket.title}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f4f4f5;border-radius:10px;">
          <h2 style="margin:0 0 4px;color:#18181b;font-size:20px;">New Customer Problem</h2>
          <p style="margin:0 0 20px;color:#71717a;font-size:14px;">Submitted via Mission Control</p>

          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:12px;background:#fff;border:1px solid #e4e4e7;border-radius:6px 6px 0 0;">
                <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;">Customer</p>
                <p style="margin:0;font-weight:600;color:#18181b;">${ticket.clientName}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px;background:#fff;border:1px solid #e4e4e7;border-top:0;">
                <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;">Problem</p>
                <p style="margin:0;font-weight:600;color:#18181b;">${ticket.title}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px;background:#fff;border:1px solid #e4e4e7;border-top:0;border-radius:0 0 6px 6px;">
                <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.5px;">Description</p>
                <p style="margin:0;color:#3f3f46;white-space:pre-wrap;line-height:1.6;font-size:14px;">${ticket.description}</p>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;">
            Log in to Mission Control to review and resolve this problem.
          </p>
        </div>
      `,
    });

    logger.info({ ticketId: ticket.id }, "Ticket notification email sent");
  } catch (err) {
    logger.warn({ err }, "Failed to send ticket email (non-fatal)");
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
      from: `"Mission Control" <${cfg.smtpUser}>`,
      to,
      subject: "Mission Control — Password Reset",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f4f4f5;border-radius:10px;">
          <h2 style="margin:0 0 8px;color:#18181b;">Reset Your Password</h2>
          <p style="color:#71717a;margin:0 0 20px;">You requested a password reset. Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Reset Password</a>
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
    from: `"Mission Control" <${cfg.smtpUser}>`,
    to: cfg.recipientEmail,
    subject: "Mission Control — Test Email",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f4f4f5;border-radius:10px;">
        <h2 style="margin:0 0 8px;color:#18181b;">Test Email ✓</h2>
        <p style="color:#71717a;margin:0;">Your email notifications are working correctly. You'll receive an alert like this whenever a customer submits a new problem.</p>
      </div>
    `,
  });
}
