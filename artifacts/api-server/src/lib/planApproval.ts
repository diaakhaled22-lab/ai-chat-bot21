import crypto from "crypto";
import { db, ticketsTable, companiesTable, usersTable, notificationsTable, chatLogsTable, type Ticket, type Company, type User } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { DEFAULT_PACKAGES_CATALOG, type PackageItem, type TopupPackItem } from "./packagesCatalog";
import { getExchangeRates } from "./currencyRates";
import { sendInvoiceToClient, type InvoiceData } from "./invoice";
import { logger } from "./logger";

const APPROVAL_SALT = process.env.SESSION_SECRET || "bot-manager-plan-approval-secret-salt-2026";

/**
 * Generate a cryptographic HMAC token for 1-click email approval links.
 */
export function createApprovalToken(ticketId: number): string {
  return crypto
    .createHmac("sha256", APPROVAL_SALT)
    .update(`approve-plan-ticket-${ticketId}`)
    .digest("hex");
}

/**
 * Verify HMAC token for 1-click email approval.
 */
export function verifyApprovalToken(ticketId: number, token: string): boolean {
  if (!ticketId || !token) return false;
  const expected = createApprovalToken(ticketId);
  try {
    return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return token === expected;
  }
}

/**
 * Helper to parse plan / topup request details from ticket title and description.
 */
export function parseTicketPlanDetails(ticket: Ticket) {
  const title = ticket.title || "";
  const desc = ticket.description || "";
  const titleLower = title.toLowerCase();
  const descLower = desc.toLowerCase();

  const isTopup =
    titleLower.includes("شحن") ||
    titleLower.includes("topup") ||
    titleLower.includes("حزمة") ||
    descLower.includes("طلب شحن");

  // Extract phone / WhatsApp
  let phone = "";
  const phoneMatch = desc.match(/(?:رقم هاتف \/ واتساب للتواصل|رقم هاتف|واتساب|phone|whatsapp)[:\s]+([+\d\s-]+)/i);
  if (phoneMatch && phoneMatch[1]) {
    phone = phoneMatch[1].trim();
  }

  // Extract billing cycle
  const isYearly = descLower.includes("سنوي") || titleLower.includes("سنوي") || descLower.includes("yearly");
  const billingCycle: "monthly" | "yearly" = isYearly ? "yearly" : "monthly";

  // Extract retention days
  let retentionDays: number | null = 30;
  const retMatch = desc.match(/(?:سياسة الحذف التلقائي|الاحتفاظ بالسجلات|retention)[:\s]+(\d+)\s*يوم/i);
  if (retMatch && retMatch[1]) {
    retentionDays = parseInt(retMatch[1], 10);
  } else if (desc.includes("دائم") || desc.includes("permanent")) {
    retentionDays = null;
  }

  if (isTopup) {
    // Find tokens
    let tokens = 50_000;
    const tokenMatch = desc.match(/(\d+[\d,]*)\s*tokens?/i) || title.match(/(\d+[\d,]*)\s*رموز/i);
    if (tokenMatch && tokenMatch[1]) {
      tokens = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
    } else if (title.includes("25k") || desc.includes("25k")) {
      tokens = 25_000;
    } else if (title.includes("50k") || desc.includes("50k")) {
      tokens = 50_000;
    } else if (title.includes("100k") || desc.includes("100k")) {
      tokens = 100_000;
    } else if (title.includes("250k") || desc.includes("250k")) {
      tokens = 250_000;
    }

    const matchedPack =
      DEFAULT_PACKAGES_CATALOG.topupPacks.find((p) => p.tokens === tokens) ||
      DEFAULT_PACKAGES_CATALOG.topupPacks[1];

    return {
      isTopup: true,
      topupPack: matchedPack,
      tokens,
      phone,
      billingCycle: "monthly" as const,
      retentionDays: null,
      plan: null,
    };
  }

  // Extract Plan ID
  let planId = "";
  const planIdMatch = desc.match(/\[معرف الباقة:\s*([a-zA-Z0-9_-]+)\]/i);
  if (planIdMatch && planIdMatch[1]) {
    planId = planIdMatch[1].trim().toLowerCase();
  } else {
    for (const p of DEFAULT_PACKAGES_CATALOG.packages) {
      if (
        descLower.includes(p.id) ||
        titleLower.includes(p.id) ||
        desc.includes(p.nameAr) ||
        title.includes(p.nameAr)
      ) {
        planId = p.id;
        break;
      }
    }
  }

  const plan =
    DEFAULT_PACKAGES_CATALOG.packages.find((p) => p.id === planId) ||
    DEFAULT_PACKAGES_CATALOG.packages[1]; // default to Pro

  // Extract channels
  const channels = plan.channels || ["widget", "telegram"];
  if (desc.includes("واتساب") && !channels.includes("whatsapp")) channels.push("whatsapp");
  if (desc.includes("ماسنجر") && !channels.includes("messenger")) channels.push("messenger");

  // Extract tools
  const tools = plan.tools || ["calendar", "sheets", "leads_crm"];
  if (desc.includes("صوت") && !tools.includes("voice")) tools.push("voice");

  // Extract data sources
  const dataSources = plan.dataSources || ["website", "files"];
  if (desc.includes("ووردبريس") && !dataSources.includes("wordpress")) dataSources.push("wordpress");
  if (desc.includes("api") && !dataSources.includes("rest_api")) dataSources.push("rest_api");
  if (desc.includes("شوبيفاي") && !dataSources.includes("shopify")) dataSources.push("shopify");

  return {
    isTopup: false,
    plan,
    topupPack: null,
    tokens: plan.tokensMonthly,
    phone,
    billingCycle,
    retentionDays: retentionDays !== undefined ? retentionDays : plan.retentionDays,
    channels,
    tools,
    dataSources,
  };
}

export interface ProcessApprovalOptions {
  approvedBy: string;
  channel: "email_reply" | "email_button" | "admin_ui";
}

/**
 * Fully process the approved plan or package request:
 * 1. Updates Company quota, status, channels, tools, retention, and dates.
 * 2. Generates Invoice.
 * 3. Dispatches Invoice to client via WhatsApp and Email.
 * 4. Resolves Ticket and pushes instant in-app & chat notifications.
 */
export async function processApprovedPlanRequest(
  ticketId: number,
  options: ProcessApprovalOptions
) {
  logger.info({ ticketId, options }, "Processing approved plan request");

  // 1. Fetch ticket
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, ticketId))
    .limit(1);

  if (!ticket) {
    throw new Error(`Ticket #${ticketId} not found`);
  }

  // 2. Fetch Client and Company
  const [client] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, ticket.clientId))
    .limit(1);

  if (!client) {
    throw new Error(`Client user #${ticket.clientId} not found`);
  }

  let [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.clientId, client.id))
    .limit(1);

  // If no company exists yet, create a default one for this client
  if (!company) {
    const [newComp] = await db
      .insert(companiesTable)
      .values({
        clientId: client.id,
        name: client.name ? `${client.name}'s Bot` : "شركة جديدة",
        isActive: true,
      })
      .returning();
    company = newComp;
  }

  // 3. Parse details
  const parsed = parseTicketPlanDetails(ticket);
  const ratesData = await getExchangeRates();
  const exchangeRate = ratesData.rates.EGP || 50.0;
  const currencySymbol = "EGP";

  const now = new Date();
  const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${ticket.id}`;
  const issueDate = now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

  let invoice: InvoiceData;

  if (parsed.isTopup && parsed.topupPack) {
    // ── TOP-UP PACK APPROVAL ──
    const pack = parsed.topupPack;
    const priceUsd = pack.priceUsd;
    const priceLocal = Math.round(priceUsd * exchangeRate);

    // Update Company Quota
    const currentQuota = company.monthlyTokenQuota || 0;
    const updatedQuota = currentQuota + pack.tokens;

    await db
      .update(companiesTable)
      .set({
        isActive: true,
        monthlyTokenQuota: updatedQuota,
        updatedAt: now,
      })
      .where(eq(companiesTable.id, company.id));

    invoice = {
      invoiceNumber,
      ticketId: ticket.id,
      issueDate,
      clientName: client.name || "العميل",
      clientEmail: client.email || client.notificationEmail || company.notificationEmail || "",
      clientPhone: parsed.phone || company.whatsappNumber || "",
      companyName: company.name,
      itemType: "topup",
      itemNameAr: `حزمة شحن رصيد إضافي (${pack.formatted})`,
      itemNameEn: `Top-up Tokens Pack (${pack.formatted})`,
      billingCycleAr: "دفعة واحدة",
      billingCycleEn: "One-Time",
      tokenQuota: pack.tokens,
      priceUsd,
      priceLocal,
      currencySymbol,
      status: "activated",
    };
  } else {
    // ── SUBSCRIPTION PLAN APPROVAL ──
    const plan = parsed.plan!;
    const isYearly = parsed.billingCycle === "yearly";
    const durationDays = isYearly ? 365 : 30;
    const rawPrice = isYearly ? plan.monthlyPriceUsd * 12 * 0.8 : plan.monthlyPriceUsd;
    const priceUsd = Math.round(rawPrice);
    const priceLocal = Math.round(priceUsd * exchangeRate);

    const activationStart = now;
    const activationEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const quotaStartDate = now;
    const quotaEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const channels = parsed.channels || [];
    const tools = parsed.tools || [];
    const sources = parsed.dataSources || [];

    const companyUpdates: Record<string, any> = {
      isActive: true,
      activationStart,
      activationEnd,
      quotaStartDate,
      quotaEndDate,
      aiExecutionMode: "tokens",
      monthlyTokenQuota: plan.tokensMonthly,
      chatLogRetentionDays: parsed.retentionDays !== undefined ? parsed.retentionDays : plan.retentionDays,
      widgetEnabled: channels.includes("widget"),
      telegramEnabled: channels.includes("telegram"),
      whatsappEnabled: channels.includes("whatsapp"),
      messengerEnabled: channels.includes("messenger"),
      googleSheetsEnabled: tools.includes("sheets"),
      googleCalendarEnabled: tools.includes("calendar"),
      voiceReplyEnabled: tools.includes("voice"),
      allowSourceWebsite: sources.includes("website"),
      allowSourceFiles: sources.includes("files"),
      allowSourceWordpress: sources.includes("wordpress"),
      allowSourceRestApi: sources.includes("rest_api"),
      allowSourceShopify: sources.includes("shopify"),
      updatedAt: now,
    };

    if (plan.allowedPages && plan.allowedPages.length > 0) {
      companyUpdates.enabledClientPages = JSON.stringify(plan.allowedPages);
    }

    if (parsed.phone && !company.whatsappNumber) {
      companyUpdates.whatsappNumber = parsed.phone;
    }

    await db
      .update(companiesTable)
      .set(companyUpdates)
      .where(eq(companiesTable.id, company.id));

    // Refresh company reference
    const [updatedComp] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, company.id))
      .limit(1);
    if (updatedComp) company = updatedComp;

    invoice = {
      invoiceNumber,
      ticketId: ticket.id,
      issueDate,
      clientName: client.name || "العميل",
      clientEmail: client.email || client.notificationEmail || company.notificationEmail || "",
      clientPhone: parsed.phone || company.whatsappNumber || "",
      companyName: company.name,
      itemType: "plan",
      itemNameAr: plan.nameAr,
      itemNameEn: plan.nameEn,
      billingCycleAr: isYearly ? "سنوي (خصم 20%)" : "شهري",
      billingCycleEn: isYearly ? "Yearly (20% off)" : "Monthly",
      tokenQuota: plan.tokensMonthly,
      priceUsd,
      priceLocal,
      currencySymbol,
      retentionDays: parsed.retentionDays,
      channels: channels,
      tools: tools,
      dataSources: sources,
      status: "activated",
    };
  }

  // 4. Dispatch Invoice via Email and WhatsApp
  const dispatchResult = await sendInvoiceToClient(invoice, client, company);

  // 5. Update Ticket Status
  const approvalSourceText =
    options.channel === "email_reply"
      ? `رد الإدارة عبر البريد الإلكتروني ("OK") بواسطة [${options.approvedBy}]`
      : options.channel === "email_button"
      ? `رابط الموافقة الفوري في البريد الإلكتروني (1-Click Approve)`
      : `لوحة تحكم الإدارة بواسطة [${options.approvedBy}]`;

  const resolutionNote = `تم التفعيل التلقائي بنجاح بناءً على ${approvalSourceText}.\nتم إصدار فاتورة الاشتراك رقم #${invoiceNumber} وإرسالها للعميل عبر البريد الإلكتروني والواتساب.`;

  await db
    .update(ticketsTable)
    .set({
      status: "resolved",
      adminNote: resolutionNote,
      aiResponse: `تم اعتماد وتفعيل طلبكم بنجاح! تم إصدار فاتورة الاشتراك #${invoiceNumber} وإرسالها إليكم عبر البريد والواتساب.`,
      updatedAt: now,
    })
    .where(eq(ticketsTable.id, ticket.id));

  // 6. Update Chat Logs (Universal Chat / Inbox)
  await db
    .update(chatLogsTable)
    .set({
      botResponse: `✅ [تم التفعيل بنجاح] تمت مراجعة واعتماد طلبكم #${ticket.id} من قبل الإدارة. تم إصدار وإرسال الفاتورة رقم #${invoiceNumber}.`,
      isHandoff: false,
      isRead: false,
    })
    .where(eq(chatLogsTable.sessionId, `ticket_${ticket.id}`))
    .catch(() => {});

  // 7. Push In-App Notification for Client
  await db.insert(notificationsTable).values({
    userId: client.id,
    companyId: company.id,
    type: "plan_request",
    title: `🎉 [تم تفعيل طلبك بنجاح] ${invoice.itemNameAr}`,
    message: `تم اعتماد طلبك وتفعيل الباقة/الرصيد بنجاح! تم إرسال فاتورة الاشتراك رقم #${invoiceNumber} إلى بريدك والواتساب.`,
    isRead: false,
  }).catch(() => {});

  // 8. Push In-App Notification for Admins
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  if (admins.length > 0) {
    await db.insert(notificationsTable).values(
      admins.map((a) => ({
        userId: a.id,
        companyId: company.id,
        type: "plan_request",
        title: `✅ [تم اعتماد وتفعيل طلب #${ticket.id}] ${client.name}`,
        message: `تمت معالجة الطلب تلقائياً بناءً على موافقة الإدارة (OK). تم تفعيل "${invoice.itemNameAr}" وإرسال الفاتورة #${invoiceNumber} للعميل.`,
        isRead: false,
      }))
    ).catch(() => {});
  }

  logger.info(
    { ticketId, invoiceNumber, dispatchResult },
    "Plan request successfully processed, activated, and invoice dispatched"
  );

  return {
    success: true,
    invoice,
    dispatchResult,
    company,
  };
}
