import { db, adminConfigTable, emailLogsTable, chatLogsTable, type Company, type User } from "@workspace/db";
import { getEmailConfig, isSmtpConfigured, buildTransporter } from "./email";
import { getExchangeRates } from "./currencyRates";
import { sendWhatsAppMessage } from "../routes/whatsapp";
import { logger } from "./logger";
import { escapeHtml } from "./security";

export interface InvoiceData {
  invoiceNumber: string;
  ticketId: number;
  issueDate: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  companyName: string;
  itemType: "plan" | "topup";
  itemNameAr: string;
  itemNameEn: string;
  billingCycleAr: string;
  billingCycleEn: string;
  tokenQuota: number;
  priceUsd: number;
  priceLocal: number;
  currencySymbol: string;
  retentionDays?: number | null;
  channels?: string[];
  tools?: string[];
  dataSources?: string[];
  status: "paid" | "activated";
}

/**
 * Render a high-conversion, professional HTML invoice email.
 */
export function generateInvoiceHtml(inv: InvoiceData): string {
  const retentionText =
    inv.retentionDays && inv.retentionDays > 0
      ? `${inv.retentionDays} يوم / Days`
      : "دائم (بدون حذف تلقائي) / Permanent";

  const channelsList = inv.channels && inv.channels.length > 0 ? inv.channels.join(" • ") : "الأساسية / Default";
  const toolsList = inv.tools && inv.tools.length > 0 ? inv.tools.join(" • ") : "تلقائي / Standard";

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة اشتراك #${inv.invoiceNumber}</title>
</head>
<body style="margin:0;padding:24px;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#1e293b;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.06),0 8px 10px -6px rgba(0,0,0,0.04);border:1px solid #e2e8f0;">
    
    <!-- Header Banner -->
    <div style="background:linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);padding:36px 32px;color:#ffffff;position:relative;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <div style="display:inline-block;padding:6px 14px;background:rgba(59,130,246,0.25);border:1px solid rgba(147,197,253,0.3);border-radius:30px;font-size:12px;font-weight:600;letter-spacing:0.5px;color:#bfdbfe;margin-bottom:12px;">
              BOT MANAGER • INVOICE & RECEIPT
            </div>
            <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">فاتورة تفعيل الاشتراك الرسمية</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#93c5fd;">تمت الموافقة وتفعيل الباقة بنجاح من قبل إدارة المنصة</p>
          </td>
          <td style="vertical-align:middle;text-align:left;">
            <div style="background:rgba(34,197,94,0.18);border:1px solid rgba(74,222,128,0.4);border-radius:12px;padding:8px 16px;display:inline-block;text-align:center;">
              <span style="display:block;font-size:11px;color:#86efac;font-weight:600;text-transform:uppercase;">الحالة / STATUS</span>
              <strong style="font-size:14px;color:#4ade80;">✅ نشط ومفعّل</strong>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Meta Bar -->
    <div style="background:#f1f5f9;padding:16px 32px;border-bottom:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="color:#64748b;">
            رقم الفاتورة: <strong style="color:#0f172a;">#${escapeHtml(inv.invoiceNumber)}</strong>
          </td>
          <td style="text-align:center;color:#64748b;">
            رقم الطلب: <strong style="color:#0f172a;">#${inv.ticketId}</strong>
          </td>
          <td style="text-align:left;color:#64748b;">
            تاريخ الإصدار: <strong style="color:#0f172a;">${escapeHtml(inv.issueDate)}</strong>
          </td>
        </tr>
      </table>
    </div>

    <!-- Bill To Details -->
    <div style="padding:28px 32px;border-bottom:1px solid #f1f5f9;">
      <h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">
        بيانات العميل والشركة / Billed To
      </h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding-left:12px;">
            <p style="margin:0 0 4px;color:#64748b;font-size:12px;">اسم العميل / Client Name</p>
            <p style="margin:0 0 12px;font-weight:700;color:#0f172a;">${escapeHtml(inv.clientName)}</p>

            <p style="margin:0 0 4px;color:#64748b;font-size:12px;">الشركة / Organization</p>
            <p style="margin:0;font-weight:600;color:#1e293b;">${escapeHtml(inv.companyName)}</p>
          </td>
          <td style="width:50%;vertical-align:top;padding-right:12px;">
            <p style="margin:0 0 4px;color:#64748b;font-size:12px;">البريد الإلكتروني / Email</p>
            <p style="margin:0 0 12px;font-weight:600;color:#1e293b;">${escapeHtml(inv.clientEmail)}</p>

            <p style="margin:0 0 4px;color:#64748b;font-size:12px;">رقم التواصل / WhatsApp</p>
            <p style="margin:0;font-weight:600;color:#1e293b;direction:ltr;text-align:right;">${escapeHtml(inv.clientPhone || "غير مسجل")}</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Items Table -->
    <div style="padding:28px 32px;">
      <h3 style="margin:0 0 14px;font-size:14px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">
        تفاصيل الباقة / Subscription Details
      </h3>

      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;font-size:14px;">
        <thead>
          <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;color:#475569;font-weight:700;font-size:12px;">
            <th style="padding:14px;text-align:right;">البند / Item</th>
            <th style="padding:14px;text-align:center;">الدورة / Cycle</th>
            <th style="padding:14px;text-align:center;">رصيد الرموز / Tokens</th>
            <th style="padding:14px;text-align:left;">المبلغ / Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:16px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
              <strong style="color:#0f172a;font-size:15px;display:block;">${escapeHtml(inv.itemNameAr)}</strong>
              <span style="color:#64748b;font-size:12px;display:block;margin-top:2px;">${escapeHtml(inv.itemNameEn)}</span>
              
              <div style="margin-top:10px;font-size:12px;color:#475569;line-height:1.6;">
                <div>• سياسة الاحتفاظ بالسجلات: <strong>${escapeHtml(retentionText)}</strong></div>
                <div>• القنوات النشطة: <span>${escapeHtml(channelsList)}</span></div>
                <div>• الأدوات والتكاملات: <span>${escapeHtml(toolsList)}</span></div>
              </div>
            </td>
            <td style="padding:16px 14px;text-align:center;border-bottom:1px solid #f1f5f9;vertical-align:top;color:#334155;">
              <strong>${escapeHtml(inv.billingCycleAr)}</strong>
              <span style="display:block;font-size:11px;color:#94a3b8;">${escapeHtml(inv.billingCycleEn)}</span>
            </td>
            <td style="padding:16px 14px;text-align:center;border-bottom:1px solid #f1f5f9;vertical-align:top;color:#2563eb;font-weight:700;">
              ${inv.tokenQuota.toLocaleString()}
            </td>
            <td style="padding:16px 14px;text-align:left;border-bottom:1px solid #f1f5f9;vertical-align:top;direction:ltr;">
              <strong style="color:#0f172a;font-size:16px;">$${inv.priceUsd} USD</strong>
              ${
                inv.currencySymbol && inv.currencySymbol !== "$"
                  ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">≈ ${inv.priceLocal.toLocaleString()} ${escapeHtml(inv.currencySymbol)}</div>`
                  : ""
              }
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Total Summary -->
      <table style="width:100%;margin-top:20px;border-collapse:collapse;">
        <tr>
          <td style="width:55%;vertical-align:top;padding-left:16px;">
            <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:14px;font-size:12px;color:#475569;line-height:1.6;">
              <strong style="color:#0f172a;display:block;margin-bottom:4px;">ملاحظة التفعيل:</strong>
              تم اعتماد هذا الطلب تلقائياً بواسطة الإدارة عبر البريد الإلكتروني. حساب الذكاء الاصطناعي وكافة القنوات المحددة تعمل الآن بأقصى كفاءة.
            </div>
          </td>
          <td style="width:45%;vertical-align:top;">
            <div style="background:#f1f5f9;border-radius:12px;padding:16px 20px;">
              <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr>
                  <td style="color:#64748b;padding-bottom:8px;">السعر الأساسي:</td>
                  <td style="text-align:left;font-weight:600;color:#1e293b;padding-bottom:8px;direction:ltr;">$${inv.priceUsd} USD</td>
                </tr>
                <tr>
                  <td style="color:#64748b;padding-bottom:8px;">الضرائب والرسوم:</td>
                  <td style="text-align:left;font-weight:600;color:#10b981;padding-bottom:8px;">مشمولة (0.00)</td>
                </tr>
                <tr style="border-top:1px solid #cbd5e1;">
                  <td style="padding-top:10px;font-weight:800;font-size:15px;color:#0f172a;">الإجمالي النهائي:</td>
                  <td style="text-align:left;padding-top:10px;font-weight:800;font-size:17px;color:#2563eb;direction:ltr;">
                    $${inv.priceUsd} USD
                  </td>
                </tr>
                ${
                  inv.currencySymbol && inv.currencySymbol !== "$"
                    ? `<tr>
                        <td colspan="2" style="text-align:left;font-size:12px;color:#64748b;padding-top:4px;direction:ltr;">
                          (يعادل تقريباً ${inv.priceLocal.toLocaleString()} ${escapeHtml(inv.currencySymbol)})
                        </td>
                      </tr>`
                    : ""
                }
              </table>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#0f172a;color:#94a3b8;padding:24px 32px;font-size:12px;text-align:center;line-height:1.6;">
      <p style="margin:0 0 6px;color:#ffffff;font-weight:600;">شكراً لاختياركم Bot Manager لأنظمة الذكاء الاصطناعي</p>
      <p style="margin:0;">لأي استفسارات أو دعم فني، تواصل معنا عبر لوحة التحكم أو عبر الواتساب مباشرة.</p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate formatted text invoice optimized for WhatsApp.
 */
export function generateInvoiceWhatsAppText(inv: InvoiceData): string {
  const retentionText =
    inv.retentionDays && inv.retentionDays > 0 ? `${inv.retentionDays} يوم` : "دائم (بدون حذف)";
  const channelsText =
    inv.channels && inv.channels.length > 0 ? inv.channels.join("، ") : "الأساسية";

  const localPriceText =
    inv.currencySymbol && inv.currencySymbol !== "$"
      ? ` (~ ${inv.priceLocal.toLocaleString()} ${inv.currencySymbol})`
      : "";

  return [
    `🧾 *فاتورة تفعيل اشتراك معتمدة - Bot Manager*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🔹 *رقم الفاتورة:* #${inv.invoiceNumber}`,
    `🔹 *تاريخ الإصدار:* ${inv.issueDate}`,
    `👤 *العميل:* ${inv.clientName}`,
    `🏢 *الشركة:* ${inv.companyName}`,
    inv.clientPhone ? `📱 *رقم التواصل:* ${inv.clientPhone}` : null,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 *تفاصيل الاشتراك:*`,
    `• الباقة: *${inv.itemNameAr} (${inv.itemNameEn})*`,
    `• دورة الفوترة: *${inv.billingCycleAr}*`,
    `• رصيد الرموز: *${inv.tokenQuota.toLocaleString()} Tokens*`,
    `• سياسة حفظ السجلات: *${retentionText}*`,
    `• القنوات المتاحة: *${channelsText}*`,
    `• الإجمالي: *$${inv.priceUsd} USD*${localPriceText}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `⚡ *الحالة:* ✅ *تمت الموافقة والتفعيل بنجاح*`,
    `تم شحن الرصيد وتحديث إعدادات الذكاء الاصطناعي الخاصة بكم.`,
    `شكراً لثقتكم بنا! في حال وجود أي استفسار، يسعدنا دائماً خدمتكم.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Clean and normalize phone numbers for WhatsApp API / Click-to-chat.
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return "";
  let cleaned = rawPhone.replace(/[^\d+]/g, "").trim();
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  // If local Egyptian number like 010..., prepend 20
  if (cleaned.startsWith("01") && cleaned.length === 11) {
    cleaned = `20${cleaned.substring(1)}`;
  }
  // If Saudi number like 05..., prepend 966
  if (cleaned.startsWith("05") && cleaned.length === 10) {
    cleaned = `966${cleaned.substring(1)}`;
  }
  return cleaned;
}

/**
 * Dispatches the invoice to the client via Email and WhatsApp.
 */
export async function sendInvoiceToClient(
  invoice: InvoiceData,
  client: User,
  company: Company | null
): Promise<{ emailSent: boolean; whatsappSent: boolean; whatsappUrl: string }> {
  let emailSent = false;
  let whatsappSent = false;

  const targetEmail = client.email || client.notificationEmail || company?.notificationEmail;
  const targetPhone = normalizePhoneNumber(invoice.clientPhone || company?.whatsappNumber || "");
  const waText = generateInvoiceWhatsAppText(invoice);
  const waUrl = targetPhone ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(waText)}` : "";

  // 1. Dispatch Email Invoice
  if (targetEmail) {
    try {
      const cfg = await getEmailConfig();
      if (isSmtpConfigured(cfg)) {
        const transporter = buildTransporter(cfg);
        const html = generateInvoiceHtml(invoice);

        await transporter.sendMail({
          from: `"Bot Manager Billing" <${cfg.smtpUser}>`,
          to: targetEmail,
          subject: `🧾 فاتورة تفعيل الاشتراك #${invoice.invoiceNumber} - ${invoice.itemNameAr}`,
          html,
        });

        emailSent = true;
        logger.info({ targetEmail, invoiceNumber: invoice.invoiceNumber }, "Invoice email dispatched to client");

        if (company) {
          await db.insert(emailLogsTable).values({
            companyId: company.id,
            recipientEmail: targetEmail,
            subject: `فاتورة اشتراك #${invoice.invoiceNumber}`,
            eventType: "invoice",
            status: "sent",
          }).catch(() => {});
        }
      } else {
        logger.warn({ targetEmail }, "SMTP not configured, skipping client invoice email");
      }
    } catch (err) {
      logger.error({ err, targetEmail, invoiceNumber: invoice.invoiceNumber }, "Failed to send invoice email");
      if (company && targetEmail) {
        await db.insert(emailLogsTable).values({
          companyId: company.id,
          recipientEmail: targetEmail,
          subject: `فاتورة اشتراك #${invoice.invoiceNumber}`,
          eventType: "invoice",
          status: "failed",
          error: (err as any)?.message ?? "Email send failure",
        }).catch(() => {});
      }
    }
  }

  // 2. Dispatch WhatsApp Invoice
  if (targetPhone) {
    try {
      // Check if company has WhatsApp Cloud API configured
      const phoneId = company?.whatsappPhoneNumberId;
      const apiToken = company?.whatsappApiToken;

      if (phoneId && apiToken) {
        await sendWhatsAppMessage(phoneId, apiToken, targetPhone, waText);
        whatsappSent = true;
        logger.info({ targetPhone, invoiceNumber: invoice.invoiceNumber }, "Invoice WhatsApp message sent via Cloud API");
      } else {
        // Also check adminConfigTable for platform-level WhatsApp credentials
        const adminRows = await db.select().from(adminConfigTable);
        const adminMap = new Map(adminRows.map((r) => [r.key, r.value ?? ""]));
        const sysPhoneId = adminMap.get("whatsapp_phone_number_id");
        const sysApiToken = adminMap.get("whatsapp_api_token");

        if (sysPhoneId && sysApiToken) {
          await sendWhatsAppMessage(sysPhoneId, sysApiToken, targetPhone, waText);
          whatsappSent = true;
          logger.info({ targetPhone, invoiceNumber: invoice.invoiceNumber }, "Invoice WhatsApp message sent via system Cloud API");
        }
      }
    } catch (err) {
      logger.error({ err, targetPhone, invoiceNumber: invoice.invoiceNumber }, "Failed to dispatch WhatsApp message via Cloud API");
    }

    // Mirror to chatLogsTable so it appears directly in Universal Chat / Inbox
    if (company) {
      await db.insert(chatLogsTable).values({
        companyId: company.id,
        channel: "whatsapp" as any,
        sessionId: `invoice_${invoice.invoiceNumber}`,
        customerMessage: `[طلب اشتراك معتمد #${invoice.ticketId}]`,
        botResponse: waText,
        isRead: false,
        isHandoff: false,
        intent: "invoice",
        sentiment: "positive",
      }).catch((e) => logger.warn({ err: e }, "Failed to mirror invoice to chat logs"));
    }
  }

  return { emailSent, whatsappSent, whatsappUrl: waUrl };
}
