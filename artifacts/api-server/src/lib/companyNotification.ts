import { db, companiesTable, emailLogsTable, adminConfigTable, notificationsTable, usersTable, pool } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Ensures the notification_email column on companies table and
 * the email_logs table exist in PostgreSQL.
 */
export async function ensureEmailNotificationSchema(): Promise<void> {
  try {
    if (!pool) return;
    await pool.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS notification_email text;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS resend_api_key text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS resend_api_key text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_email text;
    `);
    try {
      await pool.query(`
        ALTER TABLE malfunctions ADD COLUMN IF NOT EXISTS ai_analysis text;
        ALTER TABLE malfunctions ADD COLUMN IF NOT EXISTS ai_provider text;
        ALTER TABLE malfunctions ADD COLUMN IF NOT EXISTS ai_model text;
      `);
    } catch (e) {
      // malfunctions table might be optional or managed elsewhere
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id serial PRIMARY KEY,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        recipient_email text NOT NULL,
        subject text NOT NULL,
        event_type text,
        status text NOT NULL,
        error text,
        resend_id text,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `);
    logger.info("Email notification schema ensured in database");
  } catch (err) {
    logger.error({ err }, "Failed to ensure email notification schema");
  }
}

/**
 * Retrieves the Resend API key and sender email address.
 * Prioritizes company/client-provided secret, then process.env, then adminConfigTable.
 */
export async function getResendConfig(companyResendKey?: string | null): Promise<{ apiKey: string; fromEmail: string }> {
  let apiKey = companyResendKey?.trim() || process.env.RESEND_API_KEY || "";
  let fromEmail = process.env.RESEND_FROM_EMAIL || "";

  if (!apiKey || !fromEmail) {
    try {
      const rows = await db
        .select()
        .from(adminConfigTable)
        .where(inArray(adminConfigTable.key, ["resend_api_key", "resend_from_email"]));
      for (const row of rows) {
        if (!apiKey && row.key === "resend_api_key" && row.value) apiKey = row.value.trim();
        if (!fromEmail && row.key === "resend_from_email" && row.value) fromEmail = row.value.trim();
      }
    } catch (err) {
      logger.warn({ err }, "Could not load Resend config from admin_config");
    }
  }

  if (!fromEmail) {
    fromEmail = "Bot Manager <onboarding@resend.dev>";
  }

  return { apiKey, fromEmail };
}

export interface NotificationDetails {
  eventType: string;
  title?: string;
  dateTime?: Date | string;
  customerDetails?: Record<string, string | number | null | undefined>;
  eventDetails?: Record<string, any> | string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Builds a clean, responsive, professional HTML email layout conforming to:
 * - Event type
 * - Date and time
 * - Customer details
 * - Full event details
 */
export function buildNotificationHtml(input: {
  companyName: string;
  eventType: string;
  title?: string;
  dateTime?: Date | string;
  customerDetails?: Record<string, string | number | null | undefined>;
  eventDetails?: Record<string, any> | string;
}): string {
  const dateObj = input.dateTime instanceof Date
    ? input.dateTime
    : input.dateTime
    ? new Date(input.dateTime)
    : new Date();

  const formattedDate = dateObj.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "full",
    timeStyle: "medium",
  }) + " (UTC)";

  const customerRows = Object.entries(input.customerDetails || {})
    .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([key, val]) => `
      <tr>
        <td style="padding: 8px 12px; font-weight: 600; color: #4b5563; border-bottom: 1px solid #e5e7eb; width: 35%; font-size: 13px;">${escapeHtml(key)}</td>
        <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #e5e7eb; font-size: 13px;">${escapeHtml(String(val))}</td>
      </tr>
    `).join("");

  let eventDetailsContent = "";
  if (typeof input.eventDetails === "string") {
    eventDetailsContent = `<div style="font-size: 14px; line-height: 1.6; color: #1f2937; white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb;">${escapeHtml(input.eventDetails)}</div>`;
  } else if (input.eventDetails && typeof input.eventDetails === "object") {
    const rows = Object.entries(input.eventDetails)
      .filter(([_, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #4b5563; border-bottom: 1px solid #e5e7eb; width: 35%; font-size: 13px;">${escapeHtml(k)}</td>
          <td style="padding: 8px 12px; color: #111827; border-bottom: 1px solid #e5e7eb; font-size: 13px; white-space: pre-wrap;">${escapeHtml(typeof v === "object" ? JSON.stringify(v, null, 2) : String(v))}</td>
        </tr>
      `).join("");
    eventDetailsContent = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 6px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.eventType)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px; color: #111827;">
  <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e5e7eb;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #2563eb, #4f46e5); padding: 24px 32px; color: #ffffff;">
        <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255, 255, 255, 0.85); font-weight: 700;">
          ${escapeHtml(input.companyName)}
        </p>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
          ${escapeHtml(input.title || input.eventType)}
        </h1>
      </td>
    </tr>

    <!-- Body Content -->
    <tr>
      <td style="padding: 28px 32px;">
        <!-- Meta block: Event Type & Date/Time -->
        <table role="presentation" style="width: 100%; margin-bottom: 24px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px;">
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #4b5563;">
              <strong style="color: #111827;">Event Type:</strong>
              <span style="display: inline-block; background-color: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-left: 6px;">
                ${escapeHtml(input.eventType)}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 4px 0; font-size: 13px; color: #4b5563;">
              <strong style="color: #111827;">Date &amp; Time:</strong> ${escapeHtml(formattedDate)}
            </td>
          </tr>
        </table>

        ${customerRows ? `
        <!-- Customer Details -->
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.05em;">
            Customer Details
          </h2>
          <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
            <tbody>
              ${customerRows}
            </tbody>
          </table>
        </div>
        ` : `
        <!-- Customer Details (General Visitor / System) -->
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.05em;">
            Customer Details
          </h2>
          <p style="margin: 0; font-size: 13px; color: #6b7280; font-style: italic;">
            Not applicable (System or unauthenticated visitor event)
          </p>
        </div>
        `}

        <!-- Full Event Details -->
        <div style="margin-bottom: 12px;">
          <h2 style="font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.05em;">
            Full Event Details
          </h2>
          ${eventDetailsContent}
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f9fafb; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
        <p style="margin: 0 0 4px 0;">This email was sent exclusively to the notification email of <strong>${escapeHtml(input.companyName)}</strong>.</p>
        <p style="margin: 0; color: #9ca3af;">Bot Manager Client Notification Service &bull; Powered by Resend</p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Reusable notification service:
 * sendCompanyNotification(companyId, subject, html)
 *
 * Rules:
 * - Do NOT send emails to platform admins.
 * - Send emails only to the company that owns the data.
 * - Read recipient email from: company.notificationEmail
 * - Use Resend as email provider.
 * - Handle failures gracefully.
 * - Log all email activity.
 */
export async function sendCompanyNotification(
  companyId: number,
  subject: string,
  html: string,
  options?: { eventType?: string; inAppTitle?: string; inAppMessage?: string }
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    if (!companyId || isNaN(companyId)) {
      logger.warn({ companyId }, "sendCompanyNotification called with invalid companyId");
      return { ok: false, error: "Invalid companyId" };
    }

    // 1. Fetch company and its notificationEmail & custom Resend API key
    const [company] = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        clientId: companiesTable.clientId,
        notificationEmail: companiesTable.notificationEmail,
        resendApiKey: companiesTable.resendApiKey,
      })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1);

    if (!company) {
      logger.warn({ companyId }, "sendCompanyNotification: Company not found");
      return { ok: false, error: "Company not found" };
    }

    // Link with in-app Notification Bell:
    // Synchronize event with notificationsTable so the notification bell icon pulses and counts it in the dashboard!
    if (company.clientId && options?.eventType) {
      const skipDuplicates = ["New chatbot message", "Customer Service Request"];
      if (!skipDuplicates.includes(options.eventType)) {
        try {
          const inAppTitle = options.inAppTitle || `[${options.eventType}] ${company.name}`;
          const inAppMessage = options.inAppMessage || subject;
          await db.insert(notificationsTable).values({
            userId: company.clientId,
            type: (options as any)?.inAppType || options.eventType.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            title: inAppTitle,
            message: inAppMessage,
            companyId: company.id,
            isRead: false,
          });
        } catch (notifErr) {
          logger.warn({ notifErr }, "Failed to create synced in-app notification in notificationsTable");
        }
      }
    }

    let recipient = company.notificationEmail?.trim();
    let companyResendKey = company.resendApiKey?.trim();

    // 1a. If company lacks notificationEmail or resendApiKey, fall back to owner user in usersTable
    if ((!recipient || !companyResendKey) && company.clientId) {
      try {
        const [owner] = await db
          .select({
            notificationEmail: usersTable.notificationEmail,
            resendApiKey: usersTable.resendApiKey,
          })
          .from(usersTable)
          .where(eq(usersTable.id, company.clientId))
          .limit(1);

        if (owner) {
          if (!recipient && owner.notificationEmail?.trim()) {
            recipient = owner.notificationEmail.trim();
          }
          if (!companyResendKey && owner.resendApiKey?.trim()) {
            companyResendKey = owner.resendApiKey.trim();
          }
        }
      } catch (ownerErr) {
        logger.warn({ ownerErr, clientId: company.clientId }, "Failed to fetch owner user notification settings");
      }
    }

    // 1b. If still missing, check if any client user has configured notification credentials
    if (!recipient || !companyResendKey) {
      try {
        const clientUsers = await db
          .select({
            notificationEmail: usersTable.notificationEmail,
            resendApiKey: usersTable.resendApiKey,
          })
          .from(usersTable)
          .where(eq(usersTable.role, "client"))
          .limit(5);

        for (const cu of clientUsers) {
          if (!recipient && cu.notificationEmail?.trim()) {
            recipient = cu.notificationEmail.trim();
          }
          if (!companyResendKey && cu.resendApiKey?.trim()) {
            companyResendKey = cu.resendApiKey.trim();
          }
        }
      } catch (clientErr) {
        logger.warn({ clientErr }, "Failed to query client users for notification fallback");
      }
    }

    // 1c. Two-way sync: backfill companiesTable so both tables are always in sync
    if (recipient && !company.notificationEmail) {
      db.update(companiesTable)
        .set({ notificationEmail: recipient })
        .where(eq(companiesTable.id, company.id))
        .catch((e) => logger.warn({ err: e }, "Failed to backfill company.notificationEmail"));
    }
    if (companyResendKey && !company.resendApiKey) {
      db.update(companiesTable)
        .set({ resendApiKey: companyResendKey })
        .where(eq(companiesTable.id, company.id))
        .catch((e) => logger.warn({ err: e }, "Failed to backfill company.resendApiKey"));
    }

    if (!recipient) {
      logger.info(
        { companyId, companyName: company.name },
        "sendCompanyNotification: Skipped - No company.notificationEmail configured"
      );

      // Log activity to database as skipped
      try {
        await db.insert(emailLogsTable).values({
          companyId,
          recipientEmail: "N/A (not configured)",
          subject,
          eventType: options?.eventType || null,
          status: "skipped",
          error: "company.notificationEmail is empty",
        });
      } catch (logErr) {
        logger.warn({ logErr }, "Failed to insert skipped email log");
      }

      return { ok: false, error: "No notification email configured" };
    }

    // 2. Fetch Resend credentials (custom company key prioritized)
    const { apiKey, fromEmail } = await getResendConfig(companyResendKey);

    if (!apiKey) {
      const errorMsg = "RESEND_API_KEY is not configured (check environment variables or admin settings)";
      logger.warn({ companyId, recipient }, errorMsg);

      try {
        await db.insert(emailLogsTable).values({
          companyId,
          recipientEmail: recipient,
          subject,
          eventType: options?.eventType || null,
          status: "failed",
          error: errorMsg,
        });
      } catch (logErr) {
        logger.warn({ logErr }, "Failed to log email attempt");
      }

      return { ok: false, error: errorMsg };
    }

    // 3. Send email via Resend REST API
    logger.info({ companyId, recipient, subject, fromEmail }, "Sending notification email via Resend");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject,
        html,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { id?: string };
      logger.info(
        { companyId, recipient, resendId: data.id, subject },
        "Notification email successfully sent via Resend"
      );

      try {
        await db.insert(emailLogsTable).values({
          companyId,
          recipientEmail: recipient,
          subject,
          eventType: options?.eventType || null,
          status: "sent",
          resendId: data.id || null,
        });
      } catch (logErr) {
        logger.warn({ logErr }, "Failed to insert sent email log");
      }

      return { ok: true, id: data.id };
    } else {
      const errorText = await res.text();
      logger.error(
        { companyId, status: res.status, errorText },
        "Resend API returned error when sending company notification"
      );

      try {
        await db.insert(emailLogsTable).values({
          companyId,
          recipientEmail: recipient,
          subject,
          eventType: options?.eventType || null,
          status: "failed",
          error: `HTTP ${res.status}: ${errorText.slice(0, 500)}`,
        });
      } catch (logErr) {
        logger.warn({ logErr }, "Failed to insert failed email log");
      }

      return { ok: false, error: `Resend error (${res.status}): ${errorText}` };
    }
  } catch (err: any) {
    logger.error({ err, companyId, subject }, "Unhandled error in sendCompanyNotification");

    try {
      await db.insert(emailLogsTable).values({
        companyId,
        recipientEmail: "unknown",
        subject,
        eventType: options?.eventType || null,
        status: "failed",
        error: String(err?.message || err),
      });
    } catch {}

    return { ok: false, error: String(err?.message || err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level event helpers to dispatch the 13 required notification events
// ─────────────────────────────────────────────────────────────────────────────

/** Event 1: New chatbot message */
export async function notifyNewChatMessage(
  company: { id: number; name: string },
  details: {
    customerMessage: string;
    channel: string;
    sessionId?: string;
    customerPhone?: string;
  }
) {
  if (details.sessionId && details.sessionId.startsWith("preview_")) {
    return;
  }
  const eventType = "New chatbot message";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `New Message on ${details.channel}`,
    customerDetails: {
      Channel: details.channel,
      "Session ID": details.sessionId || "N/A",
      "Phone / Contact": details.customerPhone || "Visitor",
    },
    eventDetails: {
      "Customer Message": details.customerMessage,
      Channel: details.channel,
    },
  });
  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - Message received on ${details.channel}`,
    html,
    { eventType }
  );
}

/** Event 2: New conversation */
export async function notifyNewConversation(
  company: { id: number; name: string },
  details: {
    initialMessage: string;
    channel: string;
    sessionId?: string;
    customerPhone?: string;
  }
) {
  if (details.sessionId && details.sessionId.startsWith("preview_")) {
    return;
  }
  const channelNames: Record<string, string> = {
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    messenger: "Messenger",
    website: "Website Widget",
  };
  const channelDisplay = channelNames[details.channel] || details.channel;
  const eventType = "New conversation";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `New Conversation Started on ${channelDisplay}`,
    customerDetails: {
      Channel: channelDisplay,
      "Session ID": details.sessionId || "N/A",
      "Phone / Contact": details.customerPhone || "Visitor",
    },
    eventDetails: {
      "Initial Message": details.initialMessage,
      Channel: channelDisplay,
      "Session ID": details.sessionId || "N/A",
    },
  });

  const snippet = details.initialMessage.length > 70 ? details.initialMessage.substring(0, 70) + "..." : details.initialMessage;

  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - New conversation on ${channelDisplay}`,
    html,
    {
      eventType,
      inAppTitle: `New conversation (${channelDisplay})`,
      inAppMessage: `User started a conversation: "${snippet}"`,
    }
  );
}

/** Event 3: New lead */
export async function notifyNewLead(
  company: { id: number; name: string },
  lead: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    interest?: string | null;
    channel?: string;
    sessionId?: string;
  }
) {
  const eventType = "New lead";
  const leadIdentifier = lead.name || lead.phone || lead.email || "New Customer";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `New Lead Captured: ${leadIdentifier}`,
    customerDetails: {
      Name: lead.name || "N/A",
      Email: lead.email || "N/A",
      Phone: lead.phone || "N/A",
      Channel: lead.channel || "N/A",
      "Session ID": lead.sessionId || "N/A",
    },
    eventDetails: {
      Interest: lead.interest || "General Inquiry",
      Channel: lead.channel || "N/A",
    },
  });
  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - Lead: ${leadIdentifier}`,
    html,
    { eventType }
  );
}

/** Event 4: Contact form submission */
export async function notifyContactFormSubmission(
  company: { id: number; name: string },
  submission: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    subject?: string | null;
    message?: string | null;
    channel?: string;
  }
) {
  const eventType = "Contact form submission";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `Contact Form Submission from ${submission.name || submission.email || "Visitor"}`,
    customerDetails: {
      Name: submission.name || "N/A",
      Email: submission.email || "N/A",
      Phone: submission.phone || "N/A",
      Channel: submission.channel || "Website",
    },
    eventDetails: {
      Subject: submission.subject || "Contact Form Inquiry",
      Message: submission.message || "No message provided",
    },
  });
  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - ${submission.subject || "New Inquiry"}`,
    html,
    { eventType }
  );
}

/** Event 5: New order */
export async function notifyNewOrder(
  company: { id: number; name: string },
  order: {
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    items?: string | any[] | null;
    total?: string | number | null;
    notes?: string | null;
    channel?: string;
  }
) {
  const eventType = "New order";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `New Order Received for ${company.name}`,
    customerDetails: {
      "Customer Name": order.customerName || "N/A",
      "Customer Email": order.customerEmail || "N/A",
      "Customer Phone": order.customerPhone || "N/A",
      Channel: order.channel || "Chatbot",
    },
    eventDetails: {
      "Order Items": Array.isArray(order.items) ? JSON.stringify(order.items, null, 2) : order.items || "N/A",
      "Total Amount": order.total ? String(order.total) : "N/A",
      "Additional Notes": order.notes || "None",
    },
  });
  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - New order from ${order.customerName || "Customer"}`,
    html,
    { eventType }
  );
}

/** Event 6: When requesting to contact Customer Service */
export async function notifyCustomerServiceRequest(
  company: { id: number; name: string },
  request: {
    channel: string;
    sessionId?: string;
    customerPhone?: string;
    reason?: string;
  }
) {
  const eventType = "Customer Service Request";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `Customer Service Contact Request on ${request.channel}`,
    customerDetails: {
      Channel: request.channel,
      "Session ID": request.sessionId || "N/A",
      "Phone / Contact": request.customerPhone || "Visitor",
    },
    eventDetails: {
      "Action Required": "Customer explicitly requested to speak to a human representative / customer service.",
      Channel: request.channel,
      Reason: request.reason || "Customer requested human support",
    },
  });
  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - Customer requested support on ${request.channel}`,
    html,
    { eventType }
  );
}

/** Event 7: When there is a system malfunction */
export async function notifySystemMalfunction(
  company: { id: number; name: string },
  malfunction: {
    title: string;
    description: string;
    rawError?: any;
  }
) {
  const eventType = "System malfunction";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `System Malfunction Alert: ${malfunction.title}`,
    customerDetails: {
      "Affected Company": company.name,
    },
    eventDetails: {
      "Malfunction Title": malfunction.title,
      Description: malfunction.description,
      "Technical Details": malfunction.rawError ? String(malfunction.rawError).slice(0, 500) : "None",
    },
  });
  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - ${malfunction.title}`,
    html,
    { eventType }
  );
}

/** Event 8: Subscription activated */
export async function notifySubscriptionActivated(
  company: { id: number; name: string; clientId?: number },
  subscription: {
    activationStart?: Date | string | null;
    activationEnd?: Date | string | null;
  }
) {
  const eventType = "Subscription activated";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `Subscription Activated for ${company.name}`,
    customerDetails: {
      "Company Name": company.name,
      "Client ID": company.clientId ? String(company.clientId) : "N/A",
    },
    eventDetails: {
      Status: "Active",
      "Activation Start": subscription.activationStart ? String(subscription.activationStart) : "Now",
      "Activation End": subscription.activationEnd ? String(subscription.activationEnd) : "No expiration set",
    },
  });
  return sendCompanyNotification(
    company.id,
    `[${eventType}] ${company.name} - Your subscription is active!`,
    html,
    { eventType }
  );
}

/** Event 9: Upon consuming 75% of API.AI */
export async function notifyQuota75PercentConsumed(
  company: { id: number; name: string },
  quota: {
    usedTokens: number;
    monthlyQuota: number;
    percentUsed: number;
  }
) {
  const eventType = "Upon consuming 75% of API.AI";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `AI Quota Alert: 75% of API.AI consumed`,
    customerDetails: {
      "Company Name": company.name,
    },
    eventDetails: {
      "Usage Percentage": `${quota.percentUsed}%`,
      "Tokens Consumed": quota.usedTokens.toLocaleString(),
      "Total Monthly Quota": quota.monthlyQuota.toLocaleString(),
      Recommendation: "Your chatbot has consumed over 75% of its monthly AI token quota. Consider upgrading your quota to ensure continuous uninterrupted service.",
    },
  });
  return sendCompanyNotification(
    company.id,
    `[API.AI Alert] ${company.name} - 75% of monthly AI quota consumed`,
    html,
    { eventType }
  );
}

/** Quota Alert (Amber 🟡): Triggers when remaining token quota drops below 20% */
export async function notifyQuotaAmberLowBalance(
  company: { id: number; name: string; clientId?: number },
  quota: {
    usedTokens: number;
    monthlyQuota: number;
    remainingTokens: number;
    percentUsed: number;
  }
) {
  const eventType = "Quota Warning: Balance Below 20%";
  const inAppTitle = "🟡 تحذير: رصيد حصة الرموز أقل من 20%";
  const inAppMessage = `رصيدك المتبقي من حصة الذكاء الاصطناعي أصبح أقل من 20% (متبقي ${quota.remainingTokens.toLocaleString()} رمز من أصل ${quota.monthlyQuota.toLocaleString()}). يرجى طلب زيادة أو شحن الرصيد لضمان استمرار الردود التلقائية.`;

  // 1. Guaranteed in-app notification insertion:
  if (company.clientId) {
    try {
      await db.insert(notificationsTable).values({
        userId: company.clientId,
        type: "quota_warning_amber",
        title: inAppTitle,
        message: inAppMessage,
        companyId: company.id,
        isRead: false,
      });
    } catch (e) {
      logger.warn({ err: e }, "Failed to directly insert quota_warning_amber notification");
    }
  }

  // 2. Email notification via Resend:
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `AI Quota Warning: Balance below 20% (${quota.remainingTokens.toLocaleString()} tokens left)`,
    customerDetails: {
      "Company Name": company.name,
    },
    eventDetails: {
      "Remaining Tokens (الرصيد المتبقي)": quota.remainingTokens.toLocaleString(),
      "Usage Percentage (نسبة الاستهلاك)": `${quota.percentUsed}%`,
      "Tokens Consumed (المستهلك)": quota.usedTokens.toLocaleString(),
      "Total Monthly Quota (إجمالي الحصة)": quota.monthlyQuota.toLocaleString(),
      Recommendation: "Your chatbot has consumed over 80% of its monthly AI token quota. Please request a quota top-up or upgrade to ensure uninterrupted service.",
    },
  });

  return sendCompanyNotification(
    company.id,
    `[تنبيه الحصة 🟡] رصيد الرموز المتبقي لشركة ${company.name} أقل من 20%`,
    html,
    {
      eventType,
      inAppTitle,
      inAppMessage,
      inAppType: "quota_warning_amber",
    }
  );
}

/** Quota Alert (Red 🔴): Triggers when remaining token quota is completely depleted (0 remaining) */
export async function notifyQuotaRedDepleted(
  company: { id: number; name: string; clientId?: number },
  quota: {
    usedTokens: number;
    monthlyQuota: number;
    remainingTokens: number;
    percentUsed: number;
  }
) {
  const eventType = "Urgent: AI Quota Completely Depleted";
  const inAppTitle = "🔴 تنبيه عاجل: تم استنفاد حصة الرموز بالكامل (0 متبقي)";
  const inAppMessage = `لقد استنفدت كامل حصة الذكاء الاصطناعي الشهرية (${quota.monthlyQuota.toLocaleString()} رمز). توقفت الردود التلقائية للمساعد مؤقتاً حتى تجديد الحصة أو شحن رصيد إضافي.`;

  // 1. Guaranteed in-app notification insertion:
  if (company.clientId) {
    try {
      await db.insert(notificationsTable).values({
        userId: company.clientId,
        type: "quota_depleted_red",
        title: inAppTitle,
        message: inAppMessage,
        companyId: company.id,
        isRead: false,
      });
    } catch (e) {
      logger.warn({ err: e }, "Failed to directly insert quota_depleted_red notification");
    }
  }

  // 2. Email notification via Resend:
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `Urgent: Monthly AI Quota Depleted (0 Tokens Remaining)`,
    customerDetails: {
      "Company Name": company.name,
    },
    eventDetails: {
      "Remaining Tokens (الرصيد المتبقي)": "0 tokens (100% depleted)",
      "Tokens Consumed (المستهلك)": quota.usedTokens.toLocaleString(),
      "Total Monthly Quota (إجمالي الحصة)": quota.monthlyQuota.toLocaleString(),
      "Action Required": "Automated chatbot responses are currently paused. Please request an immediate quota top-up or upgrade from platform administration.",
    },
  });

  return sendCompanyNotification(
    company.id,
    `[تنبيه عاجل 🔴] استنفاد حصة الرموز بالكامل لشركة ${company.name}`,
    html,
    {
      eventType,
      inAppTitle,
      inAppMessage,
      inAppType: "quota_depleted_red",
    }
  );
}

/** Events 10, 11, 12: When 7, 3, or 1 day remains until subscription ends */
export async function notifySubscriptionExpiringSoon(
  company: { id: number; name: string },
  daysRemaining: 7 | 3 | 1,
  expirationDate: Date
) {
  const eventType = `When ${daysRemaining} day${daysRemaining > 1 ? "s" : ""} remain${daysRemaining === 1 ? "s" : ""} until the subscription ends`;
  const formattedEndDate = expirationDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `Urgent: ${daysRemaining} Day${daysRemaining > 1 ? "s" : ""} Remaining on Subscription`,
    customerDetails: {
      "Company Name": company.name,
    },
    eventDetails: {
      "Days Remaining": `${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`,
      "Expiration Date": formattedEndDate,
      "Action Required": "Please contact platform administration to renew your subscription and avoid service interruption.",
    },
  });

  return sendCompanyNotification(
    company.id,
    `[Subscription Notice] ${company.name} - ${daysRemaining} day${daysRemaining > 1 ? "s" : ""} remaining until subscription ends`,
    html,
    { eventType }
  );
}

/** Event 13: When the subscription expires */
export async function notifySubscriptionExpired(
  company: { id: number; name: string },
  expiredAt: Date
) {
  const eventType = "When the subscription expires";
  const html = buildNotificationHtml({
    companyName: company.name,
    eventType,
    title: `Subscription Expired for ${company.name}`,
    customerDetails: {
      "Company Name": company.name,
    },
    eventDetails: {
      Status: "Inactive (Expired)",
      "Expired On": expiredAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      Note: "Your chatbot service has been paused. Please contact administrator to reactivate your subscription.",
    },
  });

  return sendCompanyNotification(
    company.id,
    `[Subscription Expired] ${company.name} - Your subscription has expired`,
    html,
    { eventType }
  );
}
