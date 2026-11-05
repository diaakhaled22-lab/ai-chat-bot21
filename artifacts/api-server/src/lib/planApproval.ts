import crypto from "crypto";
import { db, ticketsTable, companiesTable, usersTable, notificationsTable, chatLogsTable, companyActivityLogsTable, adminConfigTable, type Ticket, type Company, type User } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { DEFAULT_PACKAGES_CATALOG, type PackageItem, type TopupPackItem, type PackagesCatalog } from "./packagesCatalog";
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
 * Load the active packages & topup catalog dynamically from the database.
 * Falls back to DEFAULT_PACKAGES_CATALOG if not configured yet.
 */
export async function getActivePackagesCatalog(): Promise<PackagesCatalog> {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "packages_catalog"));

    if (row && row.value) {
      const parsed = JSON.parse(row.value);
      return {
        packages: Array.isArray(parsed.packages) ? parsed.packages : DEFAULT_PACKAGES_CATALOG.packages,
        topupPacks: Array.isArray(parsed.topupPacks) ? parsed.topupPacks : DEFAULT_PACKAGES_CATALOG.topupPacks,
        updatedAt: row.updatedAt?.toISOString() || new Date().toISOString(),
      };
    }
  } catch (err) {
    logger.warn({ err }, "Could not load dynamic packages catalog from DB, falling back to defaults");
  }
  return DEFAULT_PACKAGES_CATALOG;
}

/**
 * Helper to parse plan / topup request details from ticket title and description.
 * Accepts an optional dynamic catalog from the database.
 */
export function parseTicketPlanDetails(ticket: Ticket, catalog: PackagesCatalog = DEFAULT_PACKAGES_CATALOG) {
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

  // Extract client email from ticket if provided
  let clientEmail = "";
  const emailMatch = desc.match(/(?:البريد الإلكتروني|بريد|email)[:\s]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
    desc.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch && emailMatch[1]) {
    clientEmail = emailMatch[1].trim();
  }

  // Extract company name from ticket if present
  let parsedCompanyName = "";
  const compMatch = desc.match(/(?:اسم الشركة|الشركة|company|organization)[:\s]+([^\n\r]+)/i);
  if (compMatch && compMatch[1]) {
    parsedCompanyName = compMatch[1].trim();
  }

  // Extract billing cycle
  const isYearly = descLower.includes("سنوي") || titleLower.includes("سنوي") || descLower.includes("yearly");
  const billingCycle: "monthly" | "yearly" = isYearly ? "yearly" : "monthly";

  // Extract retention days from ticket description if explicitly chosen by client
  let explicitRetention: number | null | undefined = undefined;
  if (desc.includes("دائم") || desc.includes("permanent") || desc.includes("بدون حذف")) {
    explicitRetention = null;
  } else {
    // Matches patterns like:
    // "سياسة الحذف التلقائي للاحتفاظ بالسجلات: 7 يوم"
    // "سياسة الحذف التلقائي للاحتفاظ بالسجلات: 7 أيام"
    // "الاحتفاظ بالسجلات: 7"
    // "retention: 7 Days"
    const retMatch = desc.match(/(?:سياسة الحذف التلقائي|الاحتفاظ بالسجلات|سياسة الحذف|الحذف التلقائي|retention)[^:\d\n\r]*[:\s]+(\d+)/i);
    if (retMatch && retMatch[1]) {
      explicitRetention = parseInt(retMatch[1], 10);
    }
  }

  // Extract explicit price from ticket description if client ordered with a specific price
  let explicitPrice: number | null = null;
  const priceMatch = desc.match(/(?:السعر التقديري|السعر|price)[:\s]+(?:[\$€£]|USD\s*)?(\d+(?:\.\d+)?)/i);
  if (priceMatch && priceMatch[1]) {
    const p = parseFloat(priceMatch[1]);
    if (p > 0) explicitPrice = p;
  }

  const activeTopupPacks = Array.isArray(catalog?.topupPacks) && catalog.topupPacks.length > 0
    ? catalog.topupPacks
    : DEFAULT_PACKAGES_CATALOG.topupPacks;

  const activePackages = Array.isArray(catalog?.packages) && catalog.packages.length > 0
    ? catalog.packages
    : DEFAULT_PACKAGES_CATALOG.packages;

  if (isTopup) {
    // Find tokens
    let tokens = 50_000;
    const tokenMatch =
      desc.match(/(\d+[\d,]*)\s*tokens?/i) ||
      title.match(/(\d+[\d,]*)\s*رموز/i) ||
      desc.match(/(\d+[\d,]*)\s*رموز/i);
    const kMatch = titleLower.match(/(\d+)\s*k\b/) || descLower.match(/(\d+)\s*k\b/);
    const mMatch = titleLower.match(/(\d+)\s*m\b/) || descLower.match(/(\d+)\s*m\b/);

    if (tokenMatch && tokenMatch[1]) {
      tokens = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
    } else if (kMatch && kMatch[1]) {
      tokens = parseInt(kMatch[1], 10) * 1000;
    } else if (mMatch && mMatch[1]) {
      tokens = parseInt(mMatch[1], 10) * 1_000_000;
    } else if (titleLower.includes("25k") || descLower.includes("25k")) {
      tokens = 25_000;
    } else if (titleLower.includes("50k") || descLower.includes("50k")) {
      tokens = 50_000;
    } else if (titleLower.includes("100k") || descLower.includes("100k")) {
      tokens = 100_000;
    } else if (titleLower.includes("250k") || descLower.includes("250k")) {
      tokens = 250_000;
    } else if (titleLower.includes("500k") || descLower.includes("500k")) {
      tokens = 500_000;
    } else if (titleLower.includes("1m") || descLower.includes("1m")) {
      tokens = 1_000_000;
    }

    const matchedPack =
      activeTopupPacks.find((p) => p.tokens === tokens) || {
        id: `custom-${tokens}`,
        tokens,
        priceUsd: explicitPrice || Math.max(5, Math.round((tokens / 25000) * 5)),
        formatted: `${tokens >= 1_000_000 ? tokens / 1_000_000 + "M" : tokens / 1000 + "K"}+`,
      };

    // If explicit price was recorded in the ticket when requested, honor it
    const finalPack: TopupPackItem = {
      ...matchedPack,
      priceUsd: explicitPrice !== null ? explicitPrice : matchedPack.priceUsd,
    };

    return {
      isTopup: true,
      topupPack: finalPack,
      tokens,
      phone,
      clientEmail,
      parsedCompanyName,
      billingCycle: "monthly" as const,
      retentionDays: null,
      plan: null,
    };
  }

  // Extract Plan ID
  let planId = "";
  // 1. Explicit bracketed tag like [معرف الباقة: pro] or معرف الباقة: pro
  const planIdMatch = desc.match(/(?:\[معرف الباقة|معرف الباقة|معرف الخطة|plan_id|planId)[:\s]+([a-zA-Z0-9_-]+)/i);
  if (planIdMatch && planIdMatch[1]) {
    planId = planIdMatch[1].trim().toLowerCase();
  }

  // 2. Target plan in change/upgrade requests: "من ... إلى [الباقة الجديدة]" or "إلى ..."
  if (!planId) {
    const toMatch = desc.match(/(?:إلى|to)\s*\[?([^\]\n\r]+)\]?/i) || title.match(/(?:إلى|to)\s*\[?([^\]\n\r]+)\]?/i);
    if (toMatch && toMatch[1]) {
      const targetText = toMatch[1].toLowerCase();
      for (const p of activePackages) {
        if (
          targetText.includes(p.id) ||
          targetText.includes(p.nameAr.toLowerCase()) ||
          targetText.includes(p.nameEn.toLowerCase())
        ) {
          planId = p.id;
          break;
        }
      }
    }
  }

  // 3. Match tokens if explicitly mentioned in ticket description (e.g. 1,000,000 tokens => pro, 500,000 => starter)
  if (!planId) {
    const tokenMatch =
      desc.match(/(?:رصيد الرموز المرفق|رموز|tokens?)[:\s]+(\d+[\d,]*)/i) ||
      desc.match(/(\d+[\d,]*)\s*tokens?/i);
    if (tokenMatch && tokenMatch[1]) {
      const parsedTokens = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
      const matchedByTokens = activePackages.find((p) => p.tokensMonthly === parsedTokens);
      if (matchedByTokens) {
        planId = matchedByTokens.id;
      }
    }
  }

  // 4. Fallback search in title & description, excluding any "الباقة السابقة" line
  if (!planId) {
    const cleanedDesc = desc.replace(/\[الباقة السابقة:[^\]]+\]/gi, "").replace(/من\s+\[?[^\]\n\r]+\]?\s+إلى/gi, "");
    const cleanedTitle = title.replace(/من\s+\[?[^\]\n\r]+\]?\s+إلى/gi, "");
    const cleanedDescLower = cleanedDesc.toLowerCase();
    const cleanedTitleLower = cleanedTitle.toLowerCase();

    for (const p of activePackages) {
      if (
        cleanedDescLower.includes(p.id) ||
        cleanedTitleLower.includes(p.id) ||
        cleanedDesc.includes(p.nameAr) ||
        cleanedTitle.includes(p.nameAr) ||
        cleanedDescLower.includes(p.nameEn.toLowerCase()) ||
        cleanedTitleLower.includes(p.nameEn.toLowerCase())
      ) {
        planId = p.id;
        break;
      }
    }
  }

  const basePlan =
    activePackages.find((p) => p.id === planId) ||
    activePackages[1] ||
    DEFAULT_PACKAGES_CATALOG.packages[1]; // default to Pro

  const plan: PackageItem = {
    ...basePlan,
    monthlyPriceUsd: explicitPrice !== null ? explicitPrice : basePlan.monthlyPriceUsd,
  };

  // Extract channels from specific "قنوات التواصل المطلوب تفعيلها" line
  const channelsMatch = desc.match(/قنوات التواصل المطلوب تفعيلها[:\s]+([^\n\r]+)/i);
  let channels = [...(plan.channels || ["widget", "telegram"])];
  if (channelsMatch && channelsMatch[1]) {
    const chansText = channelsMatch[1].toLowerCase();
    const parsedChans: string[] = [];
    if (chansText.includes("موقع") || chansText.includes("widget")) parsedChans.push("widget");
    if (chansText.includes("تليجرام") || chansText.includes("telegram")) parsedChans.push("telegram");
    if (chansText.includes("واتساب") || chansText.includes("whatsapp")) parsedChans.push("whatsapp");
    if (chansText.includes("ماسنجر") || chansText.includes("messenger")) parsedChans.push("messenger");
    if (parsedChans.length > 0) channels = parsedChans;
  }

  // Extract tools from specific "الأدوات والتكاملات المطلوب تفعيلها" line
  const toolsMatch = desc.match(/الأدوات والتكاملات المطلوب تفعيلها[:\s]+([^\n\r]+)/i);
  let tools = [...(plan.tools || ["leads_crm"])];
  if (toolsMatch && toolsMatch[1]) {
    const toolsText = toolsMatch[1].toLowerCase();
    const parsedTools: string[] = [];
    if (toolsText.includes("تقويم") || toolsText.includes("calendar")) parsedTools.push("calendar");
    if (toolsText.includes("جداول") || toolsText.includes("sheets")) parsedTools.push("sheets");
    if (toolsText.includes("صوت") || toolsText.includes("voice")) parsedTools.push("voice");
    if (toolsText.includes("مزامنة") || toolsText.includes("web_sync")) parsedTools.push("web_sync");
    if (toolsText.includes("عملاء") || toolsText.includes("leads")) parsedTools.push("leads_crm");
    if (toolsText.includes("بشري") || toolsText.includes("handoff")) parsedTools.push("handoff");
    if (parsedTools.length > 0) tools = parsedTools;
  }

  // Extract data sources from specific "صلاحيات مصادر البيانات المطلوب تفعيلها" line
  const sourcesMatch = desc.match(/صلاحيات مصادر البيانات المطلوب تفعيلها[:\s]+([^\n\r]+)/i);
  let dataSources = [...(plan.dataSources || ["website", "files"])];
  if (sourcesMatch && sourcesMatch[1]) {
    const srcText = sourcesMatch[1].toLowerCase();
    const parsedSrc: string[] = [];
    if (srcText.includes("موقع") || srcText.includes("website")) parsedSrc.push("website");
    if (srcText.includes("ملفات") || srcText.includes("مستندات") || srcText.includes("files")) parsedSrc.push("files");
    if (srcText.includes("ووردبريس") || srcText.includes("wordpress")) parsedSrc.push("wordpress");
    if (srcText.includes("api") || srcText.includes("rest_api")) parsedSrc.push("rest_api");
    if (srcText.includes("شوبيفاي") || srcText.includes("shopify")) parsedSrc.push("shopify");
    if (parsedSrc.length > 0) dataSources = parsedSrc;
  }

  return {
    isTopup: false,
    plan,
    topupPack: null,
    tokens: plan.tokensMonthly,
    phone,
    clientEmail,
    parsedCompanyName,
    billingCycle,
    retentionDays: explicitRetention !== undefined
      ? explicitRetention
      : (plan.retentionDays !== undefined && plan.retentionDays !== null && plan.retentionDays !== 30
          ? plan.retentionDays
          : (plan.id === "pro" ? 7 : (plan.id === "starter" ? 3 : (plan.id === "enterprise" ? 14 : (plan.id === "free_trial" ? 7 : (plan.retentionDays ?? 7)))))),
    channels,
    tools,
    dataSources,
  };
}

export interface ApplyPlanTierOptions {
  durationDays?: number;
  isYearly?: boolean;
  phone?: string;
  explicitRetentionDays?: number | null;
  allowedPages?: string[];
  customChannels?: string[];
  customTools?: string[];
  customSources?: string[];
  approvedBy?: string;
}

/**
 * Core unified function to apply a subscription plan tier to a company.
 * 100% synchronized between "One-Click Plan Tier Switcher (Sync)" and "Approve & Activate Plan".
 */
export async function applyPlanTierToCompany(
  companyId: number,
  plan: PackageItem,
  options: ApplyPlanTierOptions = {}
): Promise<Company> {
  const [existingCompany] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (!existingCompany) {
    throw new Error(`Company #${companyId} not found`);
  }

  const isFreeTrial = plan.id === "free_trial";
  const durationDays =
    options.durationDays ??
    (isFreeTrial ? 7 : options.isYearly ? 365 : 30);

  const now = new Date();
  const activationStart = now;
  const activationEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const quotaStartDate = now;
  const quotaEndDate = new Date(now.getTime() + (isFreeTrial ? 7 : 30) * 24 * 60 * 60 * 1000);

  const quota = Number(plan.tokensMonthly) || 50_000;

  // Determine retention days: explicit > plan definition > tier defaults
  let retention: number | null = 7;
  if (options.explicitRetentionDays !== undefined) {
    retention = options.explicitRetentionDays;
  } else if (plan.retentionDays !== undefined && plan.retentionDays !== null) {
    retention = plan.retentionDays;
  } else {
    if (plan.id === "pro") retention = 7;
    else if (plan.id === "starter") retention = 3;
    else if (plan.id === "enterprise") retention = 14;
    else if (plan.id === "free_trial") retention = 7;
    else retention = 7;
  }

  // Determine channels
  const channels = options.customChannels || plan.channels || ["widget", "telegram"];
  const widgetEnabled = channels.includes("widget");
  const telegramEnabled = channels.includes("telegram");
  const whatsappEnabled = channels.includes("whatsapp");
  const messengerEnabled = channels.includes("messenger");

  // Determine tools (including web_sync)
  const tools = options.customTools || plan.tools || ["leads_crm"];
  const googleSheetsEnabled = tools.includes("sheets");
  const googleCalendarEnabled = tools.includes("calendar");
  const voiceReplyEnabled = tools.includes("voice");
  const websiteAutoSync = tools.includes("web_sync");

  // Determine data sources
  const sources = options.customSources || plan.dataSources || ["website", "files"];
  const allowSourceWebsite = sources.includes("website");
  const allowSourceFiles = sources.includes("files");
  const allowSourceWordpress = sources.includes("wordpress");
  const allowSourceRestApi = sources.includes("rest_api");
  const allowSourceShopify = sources.includes("shopify");

  // Allowed pages
  const pages = options.allowedPages || plan.allowedPages || [];

  const companyUpdates: Record<string, any> = {
    isActive: true,
    aiExecutionMode: "quota",
    monthlyTokenQuota: quota,
    chatLogRetentionDays: retention,
    activationStart,
    activationEnd,
    quotaStartDate,
    quotaEndDate,
    widgetEnabled,
    telegramEnabled,
    whatsappEnabled,
    messengerEnabled,
    googleSheetsEnabled,
    googleCalendarEnabled,
    voiceReplyEnabled,
    websiteAutoSync,
    allowSourceWebsite,
    allowSourceFiles,
    allowSourceWordpress,
    allowSourceRestApi,
    allowSourceShopify,
    updatedAt: now,
  };

  if (pages.length > 0) {
    companyUpdates.enabledClientPages = JSON.stringify(pages);
  }

  if (isFreeTrial) {
    companyUpdates.freeTrialClaimed = true;
  }

  if (options.phone && !existingCompany.whatsappNumber) {
    companyUpdates.whatsappNumber = options.phone;
  }

  await db
    .update(companiesTable)
    .set(companyUpdates)
    .where(eq(companiesTable.id, companyId));

  // Dual-persist enabledClientPages into adminConfigTable key enabled_client_pages_${companyId}
  if (pages.length > 0) {
    const pagesKey = `enabled_client_pages_${companyId}`;
    try {
      await db
        .insert(adminConfigTable)
        .values({
          key: pagesKey,
          value: JSON.stringify(pages),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: adminConfigTable.key,
          set: {
            value: JSON.stringify(pages),
            updatedAt: now,
          },
        });
    } catch (e) {
      logger.warn({ err: e }, "Could not dual-persist enabled client pages in adminConfigTable");
    }
  }

  // Record plan tier application in company activity logs
  await db
    .insert(companyActivityLogsTable)
    .values({
      companyId,
      action: "plan_tier_applied",
      performedBy: options.approvedBy || "Admin",
      note: JSON.stringify({
        planId: plan.id,
        planNameAr: plan.nameAr,
        planNameEn: plan.nameEn,
        quota,
        retention,
        channels,
        tools,
        dataSources: sources,
        activationEnd: activationEnd.toISOString(),
      }),
    })
    .catch((e) => logger.warn({ err: e }, "Could not log plan tier application in activity logs"));

  const [updatedCompany] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  return updatedCompany || existingCompany;
}

export interface ProcessApprovalOptions {
  approvedBy: string;
  channel: "email_reply" | "email_button" | "admin_ui";
  isPaid?: boolean;
  overridePlanId?: string;
  overrideRetentionDays?: number | null;
  overrideEndDate?: string | null;
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

  // 2. Parse details from ticket using dynamic catalog from DB
  const catalog = await getActivePackagesCatalog();
  const parsed = parseTicketPlanDetails(ticket, catalog);

  // 3. Fetch Client and Company
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

  // If no company found by clientId, try matching parsed company name from ticket description
  if (!company && parsed.parsedCompanyName) {
    const [compByName] = await db
      .select()
      .from(companiesTable)
      .where(ilike(companiesTable.name, `%${parsed.parsedCompanyName}%`))
      .limit(1);
    if (compByName) company = compByName;
  }

  // If no company exists yet, create a default one for this client
  if (!company) {
    const [newComp] = await db
      .insert(companiesTable)
      .values({
        clientId: client.id,
        name: parsed.parsedCompanyName || (client.name ? `${client.name}'s Bot` : "شركة جديدة"),
        isActive: true,
      })
      .returning();
    company = newComp;
  }

  const effectiveClientEmail =
    parsed.clientEmail ||
    client.notificationEmail ||
    client.email ||
    company.notificationEmail ||
    "";

  if (parsed.clientEmail) {
    if (!client.email && !client.notificationEmail) {
      await db.update(usersTable).set({ notificationEmail: parsed.clientEmail }).where(eq(usersTable.id, client.id)).catch(() => {});
    }
    if (!company.notificationEmail) {
      await db.update(companiesTable).set({ notificationEmail: parsed.clientEmail }).where(eq(companiesTable.id, company.id)).catch(() => {});
    }
  }

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

    // Determine Top-Up Expiration: Custom override date if specified by admin, otherwise match subscription end date
    let subEndDate: Date | null = null;
    if (options.overrideEndDate) {
      const parsedOverride = new Date(options.overrideEndDate);
      if (!isNaN(parsedOverride.getTime())) {
        subEndDate = parsedOverride;
      }
    }
    if (!subEndDate) {
      if (company.activationEnd && new Date(company.activationEnd).getTime() > now.getTime()) {
        subEndDate = new Date(company.activationEnd);
      } else if (company.quotaEndDate && new Date(company.quotaEndDate).getTime() > now.getTime()) {
        subEndDate = new Date(company.quotaEndDate);
      } else {
        // Fallback if missing or already expired: 30 days from now
        subEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
    }

    const formattedEndDate = subEndDate.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

    // Update Company Quota and synchronize quota expiration date with subscription
    const currentQuota = company.monthlyTokenQuota || 0;
    const updatedQuota = currentQuota + pack.tokens;

    await db
      .update(companiesTable)
      .set({
        isActive: true,
        monthlyTokenQuota: updatedQuota,
        quotaEndDate: subEndDate,
        activationEnd: (!company.activationEnd || new Date(company.activationEnd).getTime() < now.getTime()) ? subEndDate : company.activationEnd,
        updatedAt: now,
      })
      .where(eq(companiesTable.id, company.id));

    invoice = {
      invoiceNumber,
      ticketId: ticket.id,
      issueDate,
      endDate: formattedEndDate,
      clientName: client.name || "العميل",
      clientEmail: effectiveClientEmail,
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
      isPaid: options.isPaid !== undefined ? Boolean(options.isPaid) : true,
    };
  } else {
    // ── SUBSCRIPTION PLAN APPROVAL ──
    const plan = (options.overridePlanId ? catalog.packages.find((p) => p.id === options.overridePlanId) : null) || parsed.plan!;
    const isFreeTrial = plan.id === "free_trial";
    const isYearly = !isFreeTrial && parsed.billingCycle === "yearly";
    const durationDays = isFreeTrial ? 7 : (isYearly ? 365 : 30);
    const rawPrice = isYearly ? plan.monthlyPriceUsd * 12 * 0.8 : plan.monthlyPriceUsd;
    const priceUsd = Math.round(rawPrice);
    const priceLocal = Math.round(priceUsd * exchangeRate);

    const explicitRetention = options.overrideRetentionDays !== undefined ? options.overrideRetentionDays : parsed.retentionDays;

    // Apply plan tier to company via unified engine (100% parity with One-Click Plan Tier Switcher)
    company = await applyPlanTierToCompany(company.id, plan, {
      durationDays,
      isYearly,
      phone: parsed.phone,
      explicitRetentionDays: explicitRetention,
      customChannels: parsed.channels,
      customTools: parsed.tools,
      customSources: parsed.dataSources,
      approvedBy: options.approvedBy,
    });

    if (options.overrideEndDate) {
      const parsedOverride = new Date(options.overrideEndDate);
      if (!isNaN(parsedOverride.getTime())) {
        await db
          .update(companiesTable)
          .set({
            activationEnd: parsedOverride,
            quotaEndDate: parsedOverride,
            updatedAt: now,
          })
          .where(eq(companiesTable.id, company.id));
        company.activationEnd = parsedOverride;
        company.quotaEndDate = parsedOverride;
      }
    }

    const planEndDate = company.activationEnd ? new Date(company.activationEnd).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : undefined;

    invoice = {
      invoiceNumber,
      ticketId: ticket.id,
      issueDate,
      endDate: planEndDate,
      clientName: client.name || "العميل",
      clientEmail: effectiveClientEmail,
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
      retentionDays: company.chatLogRetentionDays ?? explicitRetention,
      channels: parsed.channels,
      tools: parsed.tools,
      dataSources: parsed.dataSources,
      status: "activated",
      isPaid: options.isPaid !== undefined ? Boolean(options.isPaid) : true,
    };
  }

  // 4. Dispatch Invoice via Email and WhatsApp
  const dispatchResult = await sendInvoiceToClient(invoice, client, company);

  // 5. Update Ticket Status & Record Payment Override
  const isPaid = options.isPaid !== undefined ? Boolean(options.isPaid) : true;
  await db
    .insert(companyActivityLogsTable)
    .values({
      companyId: company.id,
      action: "invoice_payment_override",
      performedBy: options.approvedBy || "Admin",
      note: JSON.stringify({
        invoiceNumber,
        ticketId: ticket.id,
        isPaid,
        endDate: invoice.endDate,
        updatedAt: now.toISOString(),
      }),
    })
    .catch((err) => logger.warn({ err }, "Failed to record invoice payment override in company activity logs"));

  if (parsed.isTopup) {
    await db
      .insert(companyActivityLogsTable)
      .values({
        companyId: company.id,
        action: "topup_invoice",
        performedBy: options.approvedBy || "Admin",
        note: JSON.stringify(invoice),
      })
      .catch((err) => logger.warn({ err }, "Failed to record topup invoice in company activity logs"));
  }

  const approvalSourceText =
    options.channel === "email_reply"
      ? `رد الإدارة عبر البريد الإلكتروني ("OK") بواسطة [${options.approvedBy}]`
      : options.channel === "email_button"
      ? `رابط الموافقة الفوري في البريد الإلكتروني (1-Click Approve)`
      : `لوحة تحكم الإدارة بواسطة [${options.approvedBy}]`;

  const paymentBadge = isPaid ? "مسددة (Paid)" : "غير مسددة (Unpaid)";
  const endDateText = invoice.endDate ? `\nتاريخ انتهاء صلاحية الرصيد: ${invoice.endDate} (مطابق لنهاية دورة الاشتراك)` : "";
  const resolutionNote = `تم التفعيل التلقائي بنجاح بناءً على ${approvalSourceText}.\nتم إصدار فاتورة الاشتراك رقم #${invoiceNumber} (الحالة: ${paymentBadge}) وإرسالها للعميل عبر البريد الإلكتروني والواتساب.${endDateText}`;

  await db
    .update(ticketsTable)
    .set({
      status: "resolved",
      adminNote: resolutionNote,
      aiResponse: `تم اعتماد وتفعيل طلبكم بنجاح! تم إصدار فاتورة الاشتراك #${invoiceNumber} (${isPaid ? "مسددة" : "غير مسددة"})${invoice.endDate ? ` بصلاحية تنتهي في ${invoice.endDate} (مطابقة لنهاية اشتراككم)` : ""} وإرسالها إليكم عبر البريد والواتساب.`,
      updatedAt: now,
    })
    .where(eq(ticketsTable.id, ticket.id));

  // 6. Update Chat Logs (Universal Chat / Inbox)
  await db
    .update(chatLogsTable)
    .set({
      botResponse: `✅ [تم التفعيل بنجاح] تمت مراجعة واعتماد طلبكم #${ticket.id} من قبل الإدارة. تم إصدار وإرسال الفاتورة رقم #${invoiceNumber}${invoice.endDate ? ` (تاريخ الانتهاء: ${invoice.endDate})` : ""}.`,
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
