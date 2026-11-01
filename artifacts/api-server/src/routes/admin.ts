import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, chatLogsTable, ticketsTable, adminConfigTable, companyActivityLogsTable, notificationsTable, adminActivityLogsTable, companyKnowledgeFilesTable, companyWordPressIntegrationsTable, malfunctionsTable, emailLogsTable } from "@workspace/db";
import { eq, count, and, sql, desc, gte, lte, inArray } from "drizzle-orm";
import OpenAI from "openai";
import {
  CreateClientBody,
  UpdateClientBody,
  UpdateClientParams,
  DeleteClientParams,
  GetCompanyParams,
  DeleteCompanyParams,
  ToggleCompanyStatusBody,
  ToggleCompanyStatusParams,
  ListAllChatLogsQueryParams,
  DeleteChatLogParams,
  UpdateAdminSettingsBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getAiModelCatalog, sanitizeOpenRouterModel, sanitizeGoogleModel, sanitizeOpenAiModel, sanitizeAnthropicModel, isAnthropicFreeModel, extractAnthropicText, buildOpenAiChatParams, buildOpenRouterChatParams, AI_MODEL_PRICING, getModelPricing, isOpenRouterFreeModel, stripThinkingTags, getOpenRouterHeaders } from "../lib/aiModels";
import { getQuotaAiSettings, getQuotaAiModelInfo } from "../lib/supportAi";
import { getAttackMonitoringSnapshot, maskApiKey, preserveMaskedSecret, validatePassword, manualBlockIp, manualUnblockIp, clearAttackLogs, getTotpSecret, setTotpSecret, removeTotpSecret, escapeHtml } from "../lib/security";
import { sendClientNotification, sendMalfunctionNotification, sendSecurityEventEmail, sendNewClientNotification, getEmailConfig, isSmtpConfigured, buildTransporter } from "../lib/email";
import { notifySubscriptionActivated, getResendConfig } from "../lib/companyNotification";
import { logAdminActivity } from "../lib/audit";
import { DEFAULT_PACKAGES_CATALOG, type PackageItem, type TopupPackItem, type PackagesCatalog } from "../lib/packagesCatalog";
import { getExchangeRates, saveExchangeRates, type CurrencyRatesData } from "../lib/currencyRates";
import { clearMetaAppSecretCache } from "../lib/webhookSecurity";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { processApprovedPlanRequest, parseTicketPlanDetails } from "../lib/planApproval";
import { generateInvoiceHtml, generateInvoiceWhatsAppText, normalizePhoneNumber } from "../lib/invoice";
import { sendWhatsAppMessage } from "./whatsapp";

const router = Router();
// Only enforce admin auth on /admin/* paths — other paths pass through this router unguarded
router.use("/admin", requireAdmin);

let quotaColumnsEnsured = false;
async function ensureQuotaColumns(): Promise<void> {
  if (quotaColumnsEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_start_date TIMESTAMP WITH TIME ZONE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_end_date TIMESTAMP WITH TIME ZONE;
    `);
    quotaColumnsEnsured = true;
  } catch (err) {
    logger.warn({ err }, "Could not ensure quota columns in companies table via db.execute");
  }
}

let businessTypeEnsured = false;
async function ensureBusinessTypeSchema(): Promise<void> {
  if (businessTypeEnsured) return;
  try {
    const { pool } = await import("@workspace/db");
    if (pool) {
      await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'general';`).catch(() => {});
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_date TEXT;`).catch(() => {});
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS doctor TEXT;`).catch(() => {});
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';`).catch(() => {});
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'new_checkup';`).catch(() => {});
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;`).catch(() => {});
    } else {
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'general';`).catch(() => {});
    }
    businessTypeEnsured = true;
  } catch (err) {
    logger.warn({ err }, "Could not ensure business_type schema");
  }
}

function parseEnabledPages(val: any): string[] | null {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

let enabledPagesColumnEnsured = false;
async function ensureEnabledClientPagesSchema(): Promise<void> {
  if (enabledPagesColumnEnsured) return;
  try {
    if (pool) {
      await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_client_pages TEXT;`).catch(() => {});
    }
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_client_pages TEXT;`).catch(() => {});
    enabledPagesColumnEnsured = true;
  } catch (err) {
    logger.warn({ err }, "Could not ensure enabled_client_pages schema");
  }
}

function toIsoOrNull(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// GET /admin/ai-models â€” provider catalogs are refreshed automatically every hour
router.get("/admin/ai-models", async (req, res) => {
  try {
    res.json(await getAiModelCatalog());
  } catch (err) {
    logger.error({ err }, "Get admin AI model catalog error");
    res.status(500).json({ error: "Unable to load AI model catalog" });
  }
});

// GET /admin/stats
router.get("/admin/stats", async (req, res) => {
  try {
    const [totalCompaniesRow] = await db.select({ count: count() }).from(companiesTable);
    const [activeRow] = await db.select({ count: count() }).from(companiesTable).where(eq(companiesTable.isActive, true));
    const [clientsRow] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, "client"));
    const [totalLogsRow] = await db.select({ count: count() }).from(chatLogsTable);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [todayLogsRow] = await db
      .select({ count: count() })
      .from(chatLogsTable)
      .where(sql`${chatLogsTable.createdAt} >= ${todayStart}`);

    // Query all open tickets and deduplicate/purge superseded plan switch tickets per client
    const allOpenTickets = await db
      .select({
        id: ticketsTable.id,
        clientId: ticketsTable.clientId,
        title: ticketsTable.title,
        createdAt: ticketsTable.createdAt,
      })
      .from(ticketsTable)
      .where(eq(ticketsTable.status, "open"))
      .orderBy(desc(ticketsTable.createdAt));

    const clientPlanOpenTickets = new Map<number, typeof allOpenTickets>();
    for (const t of allOpenTickets) {
      const title = t.title || "";
      const lower = title.toLowerCase();
      const isPlan =
        title.includes("طلب تغيير باقة") ||
        title.includes("طلب اشتراك") ||
        title.includes("طلب باقة") ||
        title.includes("باقة") ||
        lower.includes("plan") ||
        lower.includes("upgrade") ||
        lower.includes("starter") ||
        lower.includes("professional") ||
        lower.includes("enterprise");

      if (isPlan && t.clientId) {
        if (!clientPlanOpenTickets.has(t.clientId)) {
          clientPlanOpenTickets.set(t.clientId, []);
        }
        clientPlanOpenTickets.get(t.clientId)!.push(t);
      }
    }

    const supersededOpenTicketIds: number[] = [];
    for (const [, pTickets] of clientPlanOpenTickets.entries()) {
      if (pTickets.length > 1) {
        for (let i = 1; i < pTickets.length; i++) {
          supersededOpenTicketIds.push(pTickets[i].id);
        }
      }
    }

    if (supersededOpenTicketIds.length > 0) {
      await db.delete(ticketsTable).where(inArray(ticketsTable.id, supersededOpenTicketIds)).catch(() => {});
      for (const sId of supersededOpenTicketIds) {
        await db.delete(chatLogsTable).where(eq(chatLogsTable.sessionId, `ticket_${sId}`)).catch(() => {});
        await db.delete(notificationsTable).where(sql`(${notificationsTable.title} LIKE '%#' || ${sId} || '%')`).catch(() => {});
      }
      logger.info({ supersededOpenTicketIds }, "Cleaned superseded open tickets in admin stats");
    }

    const supersededOpenSet = new Set(supersededOpenTicketIds);
    const validOpenTickets = allOpenTickets.filter((t) => !supersededOpenSet.has(t.id));

    const totalCompanies = totalCompaniesRow?.count ?? 0;
    const activeCompanies = activeRow?.count ?? 0;
    const inactiveCompanies = Number(totalCompanies) - Number(activeCompanies);

    const [quotaRow] = await db
      .select({ count: count() })
      .from(companiesTable)
      .where(sql`${companiesTable.monthlyTokenQuota} IS NOT NULL AND ${companiesTable.monthlyTokenQuota} > 0`);
    const quotaCompanies = quotaRow?.count ?? 0;

    const totalClients = clientsRow?.count ?? 0;
    const totalChatLogs = totalLogsRow?.count ?? 0;
    const todayChatLogs = todayLogsRow?.count ?? 0;
    const openTicketCount = validOpenTickets.length;

    res.json({ totalCompanies, activeCompanies, inactiveCompanies, quotaCompanies, totalClients, totalChatLogs, todayChatLogs, openTicketCount });
  } catch (err) {
    logger.error({ err }, "Get admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/attack-monitoring
router.get("/admin/attack-monitoring", async (_req, res) => {
  res.json(getAttackMonitoringSnapshot());
});

// POST /admin/attack-monitoring/block
router.post("/admin/attack-monitoring/block", async (req, res) => {
  const { ip, macAddress } = req.body as { ip?: string; macAddress?: string };
  if (!ip || typeof ip !== "string") {
    res.status(400).json({ error: "Valid IP is required" });
    return;
  }
  manualBlockIp(ip, macAddress);
  await logAdminActivity(req.session.userId!, "IP Blocked", `Manually blocked IP: ${ip}`, req.ip || null);
  res.json({ ok: true });
});

// POST /admin/attack-monitoring/unblock
router.post("/admin/attack-monitoring/unblock", async (req, res) => {
  const { ip, macAddress } = req.body as { ip?: string; macAddress?: string };
  if (!ip || typeof ip !== "string") {
    res.status(400).json({ error: "Valid IP is required" });
    return;
  }
  manualUnblockIp(ip, macAddress);
  await logAdminActivity(req.session.userId!, "IP Unblocked", `Manually unblocked IP: ${ip}`, req.ip || null);
  res.json({ ok: true });
});

// POST /admin/attack-monitoring/test-alert
router.post("/admin/attack-monitoring/test-alert", async (req, res) => {
  try {
    const ip = req.ip || "127.0.0.1";
    await sendSecurityEventEmail("failed_attempts_warning", ip, "admin_test", 3);
    await logAdminActivity(req.session.userId!, "Test Security Alert", "Sent test security warning alert to admin bell and email", ip);
    res.json({ ok: true, message: "Test security alert sent successfully" });
  } catch (err: any) {
    logger.error({ err }, "Failed to send test security alert");
    res.status(500).json({ error: err.message || "Failed to send test alert" });
  }
});

// DELETE /admin/attack-monitoring/logs
router.delete("/admin/attack-monitoring/logs", async (req, res) => {
  try {
    await clearAttackLogs();
    await logAdminActivity(req.session.userId!, "Clear Attack Logs", "Cleared all attack monitoring logs", req.ip || null);
    res.json({ ok: true, message: "Attack logs cleared successfully" });
  } catch (err: any) {
    logger.error({ err }, "Failed to clear attack logs");
    res.status(500).json({ error: err.message || "Failed to clear attack logs" });
  }
});

// GET /admin/usage-cost
router.get("/admin/usage-cost", async (req, res) => {
  await ensureQuotaColumns();
  try {
    const CHARS_PER_TOKEN = 4;

    const pricing = AI_MODEL_PRICING;

    const quotaModelInfo = await getQuotaAiModelInfo();
    const quotaModel = quotaModelInfo.model;
    const quotaProvider = quotaModelInfo.provider;

    const { from, to, range } = req.query as { from?: string; to?: string; range?: string };
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from) {
      fromDate = from.includes("T") ? new Date(from) : new Date(`${from}T00:00:00.000Z`);
      if (isNaN(fromDate.getTime())) fromDate = undefined;
    }
    if (to) {
      toDate = to.includes("T") ? new Date(to) : new Date(`${to}T23:59:59.999Z`);
      if (isNaN(toDate.getTime())) toDate = undefined;
    }

    if (!fromDate && range && range !== "all" && range !== "quota_period") {
      const now = new Date();
      if (range === "month") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (range === "today") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (range === "7d") {
        fromDate = new Date(now.getTime() - 7 * 864e5);
      } else if (range === "30d") {
        fromDate = new Date(now.getTime() - 30 * 864e5);
      }
    }

    const companies = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        aiProvider: companiesTable.aiProvider,
        aiModel: companiesTable.aiModel,
        monthlyTokenQuota: companiesTable.monthlyTokenQuota,
        quotaStartDate: companiesTable.quotaStartDate,
        quotaEndDate: companiesTable.quotaEndDate,
      })
      .from(companiesTable);

    const conditions = [];
    if (fromDate) conditions.push(gte(chatLogsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(chatLogsTable.createdAt, toDate));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select({
        companyId: chatLogsTable.companyId,
        customerMessage: chatLogsTable.customerMessage,
        botResponse: chatLogsTable.botResponse,
        createdAt: chatLogsTable.createdAt,
      })
      .from(chatLogsTable)
      .where(whereClause);

    // Fetch reset timestamps from admin_config
    const resetConfigs = await db
      .select({ key: adminConfigTable.key, value: adminConfigTable.value })
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} LIKE 'quota_reset_%'`);

    const resetMap = new Map<string, Date>();
    for (const r of resetConfigs) {
      if (r.value) {
        const d = new Date(r.value);
        if (!isNaN(d.getTime())) resetMap.set(r.key, d);
      }
    }
    const globalReset = resetMap.get("quota_reset_all");

    const companyMap = new Map(companies.map((c) => [c.id, c]));

    const byModel: Record<string, { provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }> = {};
    const byCompany: Record<number, { companyId: number; companyName: string; provider: string; model: string; messages: number; inputTokens: number; outputTokens: number; costUsd: number }> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;

    for (const log of logs) {
      const company = companyMap.get(log.companyId);
      if (!company) continue;

      const companyReset = resetMap.get(`quota_reset_company_${log.companyId}`) || globalReset;
      if (companyReset && log.createdAt && new Date(log.createdAt) < companyReset) {
        continue;
      }

      if (range === "quota_period") {
        if (company.quotaStartDate && log.createdAt && new Date(log.createdAt) < new Date(company.quotaStartDate)) {
          continue;
        }
        if (company.quotaEndDate && log.createdAt && new Date(log.createdAt) > new Date(company.quotaEndDate)) {
          continue;
        }
      }

      const hasQuota = typeof company.monthlyTokenQuota === "number" && company.monthlyTokenQuota > 0;
      // If company has dedicated aiModel, price that specific model; otherwise use Platform Quota AI Agent model:
      const modelKey = company.aiModel || (hasQuota ? quotaModel : "gpt-4o-mini");
      const provider = (company.aiModel ? company.aiProvider : null) || (hasQuota ? quotaProvider : (company.aiProvider ?? "openai"));
      const inputTokens = Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
      const outputTokens = Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
      const mp = getModelPricing(modelKey);
      const costUsd = (inputTokens / 1_000_000) * mp.input + (outputTokens / 1_000_000) * mp.output;

      if (!byModel[modelKey]) byModel[modelKey] = { provider, model: modelKey, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      byModel[modelKey].inputTokens += inputTokens;
      byModel[modelKey].outputTokens += outputTokens;
      byModel[modelKey].costUsd += costUsd;

      if (!byCompany[log.companyId]) byCompany[log.companyId] = { companyId: log.companyId, companyName: company.name, provider, model: modelKey, messages: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      byCompany[log.companyId].messages += 1;
      byCompany[log.companyId].inputTokens += inputTokens;
      byCompany[log.companyId].outputTokens += outputTokens;
      byCompany[log.companyId].costUsd += costUsd;

      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCostUsd += costUsd;
    }

    const byCompanyList = Object.values(byCompany)
      .map((c) => ({ ...c, costUsd: Math.round(c.costUsd * 1000000) / 1000000 }))
      .sort((a, b) => b.costUsd - a.costUsd);

    res.json({
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
      byModel: Object.values(byModel).map((m) => ({ ...m, costUsd: Math.round(m.costUsd * 1000000) / 1000000 })),
      byCompany: byCompanyList,
    });
  } catch (err) {
    logger.error({ err }, "Get admin usage cost error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/usage-cost/reset
router.post("/admin/usage-cost/reset", async (req, res) => {
  try {
    const { companyId, deleteLogs } = req.body as { companyId?: number; deleteLogs?: boolean };
    const nowIso = new Date().toISOString();

    if (deleteLogs) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);

      const conditions = [gte(chatLogsTable.createdAt, monthStart)];
      if (companyId) conditions.push(eq(chatLogsTable.companyId, companyId));

      await db.delete(chatLogsTable).where(and(...conditions));
    }

    if (companyId) {
      const key = `quota_reset_company_${companyId}`;
      await db.insert(adminConfigTable)
        .values({ key, value: nowIso })
        .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: nowIso, updatedAt: new Date() } });

      await logAdminActivity(
        req.session.userId!,
        "Reset Quota Usage",
        `Reset monthly quota usage counter for company ID ${companyId} (deleteLogs: ${!!deleteLogs})`,
        req.ip || null
      );
    } else {
      const key = "quota_reset_all";
      await db.insert(adminConfigTable)
        .values({ key, value: nowIso })
        .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: nowIso, updatedAt: new Date() } });

      await logAdminActivity(
        req.session.userId!,
        "Reset All Quota Usage",
        `Reset monthly quota usage counter for all companies (deleteLogs: ${!!deleteLogs})`,
        req.ip || null
      );
    }

    res.json({ ok: true, resetAt: nowIso });
  } catch (error: any) {
    logger.error({ error }, "Error resetting usage counter");
    res.status(500).json({ error: error?.message || "Failed to reset usage counter" });
  }
});

// GET /admin/clients
router.get("/admin/clients", async (req, res) => {
  try {
    const clients = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "client"))
      .orderBy(usersTable.createdAt);

    const companies = await db
      .select({ clientId: companiesTable.clientId, notificationEmail: companiesTable.notificationEmail })
      .from(companiesTable);

    const companyCountMap = new Map<number, number>();
    const companyEmailMap = new Map<number, string>();
    for (const comp of companies) {
      if (comp.clientId) {
        companyCountMap.set(comp.clientId, (companyCountMap.get(comp.clientId) ?? 0) + 1);
        if (comp.notificationEmail && !companyEmailMap.has(comp.clientId)) {
          companyEmailMap.set(comp.clientId, comp.notificationEmail);
        }
      }
    }

    res.json(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        username: c.username,
        email: (c as any).email?.trim() || c.notificationEmail?.trim() || companyEmailMap.get(c.id)?.trim() || null,
        lastLoginIp: c.lastLoginIp ?? null,
        macAddress: (c as any).macAddress ?? null,
        createdAt: c.createdAt.toISOString(),
        hasCompany: (companyCountMap.get(c.id) ?? 0) > 0,
      }))
    );
  } catch (err) {
    logger.error({ err }, "List clients error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/clients
router.post("/admin/clients", async (req, res) => {
  try {
    const parsed = CreateClientBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { name, username, password, email } = parsed.data;

    const pwError = validatePassword(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username));

    if (existing) {
      res.status(409).json({ error: `Username "${username}" is already taken. Please choose a different username.` });
      return;
    }

    const adminId = req.session.userId;
    if (!adminId) {
      res.status(401).json({ error: "Admin access required" });
      return;
    }

    const trimmedEmail = email && typeof email === "string" && email.trim() ? email.trim() : null;
    const macAddress = typeof (req.body as any)?.macAddress === "string" && (req.body as any).macAddress.trim()
      ? (req.body as any).macAddress.trim().replace(/-/g, ":").toUpperCase()
      : null;

    if (macAddress) {
      const [existingMac] = await db
        .select({ id: usersTable.id, username: usersTable.username })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "client"),
            eq(sql`UPPER(REPLACE(${usersTable.macAddress}, '-', ':'))`, macAddress)
          )
        )
        .limit(1);

      if (existingMac) {
        res.status(409).json({
          error: `A client with MAC address "${macAddress}" already exists (@${existingMac.username}). Only one client account is allowed per MAC address.`,
        });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({
        name,
        username,
        passwordHash,
        role: "client",
        email: trimmedEmail,
        notificationEmail: trimmedEmail,
        macAddress,
      })
      .returning();

    await logAdminActivity(
      adminId,
      "Client Created",
      `Created client "${user.name}" (${user.username})`,
      req.ip || null,
    );

    void sendNewClientNotification({
      id: user.id,
      name: user.name,
      username: user.username,
      email: (user as any).email || user.notificationEmail || null,
      ip: req.ip || null,
      mac: macAddress || null,
      source: "admin_created",
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
      email: (user as any).email ?? user.notificationEmail ?? null,
      macAddress: (user as any).macAddress ?? null,
      createdAt: user.createdAt.toISOString(),
      hasCompany: false,
    });
  } catch (err) {
    logger.error({ err }, "Create client error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/clients/:id
router.put("/admin/clients/:id", async (req, res) => {
  try {
    const params = UpdateClientParams.safeParse({ id: Number(req.params.id) });
    const body = UpdateClientBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { name, username, password, email } = body.data;

    if (password) {
      const pwError = validatePassword(password);
      if (pwError) {
        res.status(400).json({ error: pwError });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (username) updates.username = username;
    if (password) updates.passwordHash = await bcrypt.hash(password, 12);
    if (email !== undefined) {
      const trimmedEmail = email && typeof email === "string" && email.trim() ? email.trim() : null;
      updates.email = trimmedEmail;
      updates.notificationEmail = trimmedEmail;
      await db
        .update(companiesTable)
        .set({ notificationEmail: trimmedEmail })
        .where(eq(companiesTable.clientId, params.data.id))
        .catch(() => {});
    }

    if ((req.body as any)?.macAddress !== undefined) {
      const rawMac = (req.body as any)?.macAddress;
      const normalizedMac = typeof rawMac === "string" && rawMac.trim()
        ? rawMac.trim().replace(/-/g, ":").toUpperCase()
        : null;

      if (normalizedMac) {
        const [existingMac] = await db
          .select({ id: usersTable.id, username: usersTable.username })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.role, "client"),
              sql`${usersTable.id} != ${params.data.id}`,
              eq(sql`UPPER(REPLACE(${usersTable.macAddress}, '-', ':'))`, normalizedMac)
            )
          )
          .limit(1);

        if (existingMac) {
          res.status(409).json({
            error: `Another client with MAC address "${normalizedMac}" already exists (@${existingMac.username}). Only one client account is allowed per MAC address.`,
          });
          return;
        }
      }
      updates.macAddress = normalizedMac;
    }

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, params.data.id), eq(usersTable.role, "client")))
      .returning();

    if (!user) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json({
      id: user.id,
      name: user.name,
      username: user.username,
      email: (user as any).email ?? user.notificationEmail ?? null,
      macAddress: (user as any).macAddress ?? null,
      createdAt: user.createdAt.toISOString(),
      hasCompany: false,
    });
  } catch (err) {
    logger.error({ err }, "Update client error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/clients/:id
router.delete("/admin/clients/:id", async (req, res) => {
  try {
    const params = DeleteClientParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(usersTable).where(and(eq(usersTable.id, params.data.id), eq(usersTable.role, "client")));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Delete client error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/companies
router.get("/admin/companies", async (req, res) => {
  await ensureQuotaColumns();
  await ensureBusinessTypeSchema();
  await ensureEnabledClientPagesSchema();
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    let rows;
    try {
      rows = await db
        .select({
          company: companiesTable,
          clientName: usersTable.name,
          clientUsername: usersTable.username,
          clientNotificationEmail: usersTable.notificationEmail,
        })
        .from(companiesTable)
        .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id))
        .orderBy(companiesTable.createdAt);
    } catch (dbErr: any) {
      if (dbErr?.message?.includes("quota_start_date") || dbErr?.message?.includes("quota_end_date")) {
        await db.execute(sql`
          ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_start_date TIMESTAMP WITH TIME ZONE;
          ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_end_date TIMESTAMP WITH TIME ZONE;
        `);
        rows = await db
          .select({
            company: companiesTable,
            clientName: usersTable.name,
            clientUsername: usersTable.username,
            clientNotificationEmail: usersTable.notificationEmail,
          })
          .from(companiesTable)
          .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id))
          .orderBy(companiesTable.createdAt);
      } else {
        throw dbErr;
      }
    }

    // Fetch enabled pages from adminConfigTable as robust fallback
    const configPagesRows = await db
      .select({ key: adminConfigTable.key, value: adminConfigTable.value })
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} LIKE 'enabled_client_pages_%'`)
      .catch(() => []);

    const configPagesMap = new Map<number, string[]>();
    for (const r of configPagesRows) {
      if (r.value) {
        const compId = Number(r.key.replace("enabled_client_pages_", ""));
        if (compId) {
          try {
            const parsed = JSON.parse(r.value);
            if (Array.isArray(parsed)) configPagesMap.set(compId, parsed);
          } catch {}
        }
      }
    }

    res.json(
      rows.map(({ company, clientName, clientUsername, clientNotificationEmail }) => ({
        id: company.id,
        clientId: company.clientId,
        clientName: clientName ?? null,
        clientUsername: clientUsername ?? null,
        myId: company.myId ?? null,
        name: company.name,
        notificationEmail: company.notificationEmail?.trim() || clientNotificationEmail?.trim() || null,
        resendApiKey: maskApiKey(company.resendApiKey),
        generalInfo: company.generalInfo,
        isActive: company.isActive,
        activationStart: toIsoOrNull(company.activationStart),
        activationEnd: toIsoOrNull(company.activationEnd),
        quotaStartDate: toIsoOrNull(company.quotaStartDate),
        quotaEndDate: toIsoOrNull(company.quotaEndDate),
        systemPrompt: company.systemPrompt,
        securityPrompt: company.securityPrompt,
        googleSheetsEnabled: company.googleSheetsEnabled,
        googleSheetsLink: company.googleSheetsLink,
        googleSheetsName: company.googleSheetsName,
        googleSheetsPage: company.googleSheetsPage,
        serviceAccountKey: maskApiKey(company.serviceAccountKey),
        googleCalendarEnabled: company.googleCalendarEnabled ?? false,
        googleCalendarId: company.googleCalendarId ?? null,
        googleCalendarTimezone: company.googleCalendarTimezone ?? "UTC",
        googleCalendarDuration: company.googleCalendarDuration ?? 30,
        googleCalendarBookingRules: company.googleCalendarBookingRules ?? null,
        googleCalendarServiceAccountKey: maskApiKey(company.googleCalendarServiceAccountKey),
        aiProvider: company.aiProvider ?? null,
        aiModel: company.aiModel ?? null,
        aiExecutionMode: company.aiExecutionMode || "quota",
        aiAgentApiKey: maskApiKey(company.aiAgentApiKey),
        aiAgentUrl: company.aiAgentUrl,
        monthlyTokenQuota: company.monthlyTokenQuota ?? null,
        chatLogRetentionDays: company.chatLogRetentionDays ?? null,
        telegramBotApiKey: maskApiKey(company.telegramBotApiKey),
        telegramBotUsername: company.telegramBotUsername,
        telegramEnabled: company.telegramEnabled,
        whatsappApiToken: maskApiKey(company.whatsappApiToken),
        whatsappPhoneNumberId: company.whatsappPhoneNumberId,
        whatsappBusinessAccountId: company.whatsappBusinessAccountId,
        whatsappNumber: company.whatsappNumber,
        whatsappEnabled: company.whatsappEnabled,
        messengerApiKey: maskApiKey(company.messengerApiKey),
        messengerPageId: company.messengerPageId,
        messengerEnabled: company.messengerEnabled,
        websiteChatbotKey: company.websiteChatbotKey,
        widgetAllowedDomains: company.widgetAllowedDomains ?? null,
        widgetEnabled: company.widgetEnabled,
        websiteDataUrl: company.websiteDataUrl,
        websiteAutoSync: company.websiteAutoSync,
        websiteLastSynced: company.websiteLastSynced?.toISOString() ?? null,
        allowSourceWebsite: company.allowSourceWebsite === false ? false : true,
        allowSourceFiles: company.allowSourceFiles === false ? false : true,
        allowSourceWordpress: company.allowSourceWordpress === false ? false : true,
        allowSourceRestApi: company.allowSourceRestApi === false ? false : true,
        allowSourceShopify: company.allowSourceShopify === false ? false : true,
        businessType: company.businessType || "general",
        enabledClientPages: configPagesMap.has(company.id) ? (configPagesMap.get(company.id) ?? []) : (parseEnabledPages((company as any).enabledClientPages) ?? null),
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "List companies error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/companies/:id/data-sources
router.get("/admin/companies/:id/data-sources", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [fileStats] = await db
      .select({
        count: count(companyKnowledgeFilesTable.id),
        totalSize: sql<number>`COALESCE(SUM(${companyKnowledgeFilesTable.fileSize}), 0)`,
      })
      .from(companyKnowledgeFilesTable)
      .where(eq(companyKnowledgeFilesTable.companyId, id));

    const [wordpress] = await db
      .select({
        apiUrl: companyWordPressIntegrationsTable.apiUrl,
        status: companyWordPressIntegrationsTable.status,
        lastSynced: companyWordPressIntegrationsTable.lastSynced,
        totalItems: companyWordPressIntegrationsTable.totalItems,
      })
      .from(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.companyId, id))
      .limit(1);

    res.json({
      knowledgeFiles: {
        count: Number(fileStats?.count ?? 0),
        totalSize: Number(fileStats?.totalSize ?? 0),
      },
      wordpress: wordpress ? {
        apiUrl: wordpress.apiUrl,
        status: wordpress.status,
        lastSynced: wordpress.lastSynced?.toISOString() ?? null,
        totalItems: wordpress.totalItems,
      } : null,
    });
  } catch (err) {
    logger.error({ err }, "Get company data sources error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/companies/:id
router.get("/admin/companies/:id", async (req, res) => {
  await ensureQuotaColumns();
  await ensureBusinessTypeSchema();
  await ensureEnabledClientPagesSchema();
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    const params = GetCompanyParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db
      .select({ company: companiesTable, clientName: usersTable.name })
      .from(companiesTable)
      .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id))
      .where(eq(companiesTable.id, params.data.id));

    if (!row) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const { company, clientName } = row;

    let configPages: string[] | null = null;
    let hasConfigPages = false;
    try {
      const [cr] = await db
        .select({ value: adminConfigTable.value })
        .from(adminConfigTable)
        .where(eq(adminConfigTable.key, `enabled_client_pages_${params.data.id}`))
        .limit(1);
      if (cr?.value !== undefined && cr?.value !== null) {
        const p = JSON.parse(cr.value);
        if (Array.isArray(p)) {
          configPages = p;
          hasConfigPages = true;
        }
      }
    } catch {}

    res.json({
      id: company.id,
      clientId: company.clientId,
      clientName: clientName ?? null,
      myId: company.myId ?? null,
      name: company.name,
      notificationEmail: company.notificationEmail ?? null,
      resendApiKey: maskApiKey(company.resendApiKey),
      generalInfo: company.generalInfo,
      isActive: company.isActive,
      activationStart: toIsoOrNull(company.activationStart),
      activationEnd: toIsoOrNull(company.activationEnd),
      quotaStartDate: toIsoOrNull(company.quotaStartDate),
      quotaEndDate: toIsoOrNull(company.quotaEndDate),
      systemPrompt: company.systemPrompt,
      securityPrompt: company.securityPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: maskApiKey(company.serviceAccountKey),
      googleCalendarEnabled: company.googleCalendarEnabled ?? false,
      googleCalendarId: company.googleCalendarId ?? null,
      googleCalendarTimezone: company.googleCalendarTimezone ?? "UTC",
      googleCalendarDuration: company.googleCalendarDuration ?? 30,
      googleCalendarBookingRules: company.googleCalendarBookingRules ?? null,
      googleCalendarServiceAccountKey: maskApiKey(company.googleCalendarServiceAccountKey),
      aiProvider: company.aiProvider ?? null,
      aiModel: company.aiModel ?? null,
      aiExecutionMode: company.aiExecutionMode || "quota",
      aiAgentApiKey: maskApiKey(company.aiAgentApiKey),
      aiAgentUrl: company.aiAgentUrl,
      monthlyTokenQuota: company.monthlyTokenQuota ?? null,
      chatLogRetentionDays: company.chatLogRetentionDays ?? null,
      telegramBotApiKey: maskApiKey(company.telegramBotApiKey),
      telegramBotUsername: company.telegramBotUsername,
      telegramEnabled: company.telegramEnabled ?? false,
      whatsappApiToken: maskApiKey(company.whatsappApiToken),
      whatsappPhoneNumberId: company.whatsappPhoneNumberId,
      whatsappBusinessAccountId: company.whatsappBusinessAccountId,
      whatsappNumber: company.whatsappNumber,
      whatsappEnabled: company.whatsappEnabled ?? false,
      messengerApiKey: maskApiKey(company.messengerApiKey),
      messengerPageId: company.messengerPageId,
      messengerEnabled: company.messengerEnabled ?? false,
      websiteChatbotKey: company.websiteChatbotKey,
      widgetAllowedDomains: company.widgetAllowedDomains ?? null,
      widgetEnabled: company.widgetEnabled ?? false,
      websiteDataUrl: company.websiteDataUrl,
      websiteAutoSync: company.websiteAutoSync,
      websiteLastSynced: company.websiteLastSynced?.toISOString() ?? null,
      allowSourceWebsite: company.allowSourceWebsite === false ? false : true,
      allowSourceFiles: company.allowSourceFiles === false ? false : true,
      allowSourceWordpress: company.allowSourceWordpress === false ? false : true,
      allowSourceRestApi: company.allowSourceRestApi === false ? false : true,
      allowSourceShopify: company.allowSourceShopify === false ? false : true,
      businessType: company.businessType || "general",
      enabledClientPages: hasConfigPages ? configPages : (parseEnabledPages((company as any).enabledClientPages) ?? null),
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Get company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Comprehensive Company Update Handler (PATCH /admin/companies/:id and PUT /admin/companies/:id)
async function handleUpdateCompany(req: any, res: any) {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await ensureBusinessTypeSchema();
    await ensureEnabledClientPagesSchema();

    const [existing] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const body = req.body || {};
    const updateValues: Record<string, any> = {};

    // 1. Profile & Info
    if (body.name !== undefined && typeof body.name === "string" && body.name.trim()) {
      updateValues.name = body.name.trim();
    }
    if (body.myId !== undefined) {
      updateValues.myId = body.myId ? String(body.myId).trim() : null;
    }
    if (body.generalInfo !== undefined) {
      updateValues.generalInfo = body.generalInfo ?? null;
    }
    if (body.notificationEmail !== undefined) {
      updateValues.notificationEmail = body.notificationEmail ? String(body.notificationEmail).trim() : null;
    }
    if (body.resendApiKey !== undefined) {
      updateValues.resendApiKey = preserveMaskedSecret(body.resendApiKey, existing.resendApiKey);
    }
    if (body.businessType !== undefined) {
      updateValues.businessType = body.businessType === "clinic" ? "clinic" : "general";
    }

    // 2. AI Model & Prompts
    if (body.systemPrompt !== undefined) {
      updateValues.systemPrompt = body.systemPrompt ?? null;
    }
    if (body.securityPrompt !== undefined) {
      updateValues.securityPrompt = body.securityPrompt ?? null;
    }
    if (body.aiProvider !== undefined) {
      updateValues.aiProvider = body.aiProvider || null;
    }
    if (body.aiModel !== undefined) {
      updateValues.aiModel = body.aiModel || null;
    }
    if (body.aiExecutionMode !== undefined) {
      updateValues.aiExecutionMode = body.aiExecutionMode === "tokens" ? "tokens" : "quota";
    }
    if (body.aiAgentApiKey !== undefined) {
      updateValues.aiAgentApiKey = preserveMaskedSecret(body.aiAgentApiKey, existing.aiAgentApiKey);
    }
    if (body.aiAgentUrl !== undefined) {
      updateValues.aiAgentUrl = body.aiAgentUrl ? String(body.aiAgentUrl).trim() : null;
    }

    // 3. Status & Quota & Subscription
    if (body.isActive !== undefined) {
      updateValues.isActive = Boolean(body.isActive);
    }
    if (body.monthlyTokenQuota !== undefined) {
      updateValues.monthlyTokenQuota = body.monthlyTokenQuota === null || body.monthlyTokenQuota === "" ? null : Number(body.monthlyTokenQuota);
    }
    if (body.chatLogRetentionDays !== undefined) {
      updateValues.chatLogRetentionDays = body.chatLogRetentionDays === null || body.chatLogRetentionDays === "" ? null : Number(body.chatLogRetentionDays);
    }
    if (body.activationStart !== undefined) {
      updateValues.activationStart = body.activationStart ? new Date(body.activationStart) : null;
    }
    if (body.activationEnd !== undefined) {
      updateValues.activationEnd = body.activationEnd ? new Date(body.activationEnd) : null;
    }

    // 4. Telegram
    if (body.telegramEnabled !== undefined) {
      updateValues.telegramEnabled = Boolean(body.telegramEnabled);
    }
    if (body.telegramBotApiKey !== undefined) {
      updateValues.telegramBotApiKey = preserveMaskedSecret(body.telegramBotApiKey, existing.telegramBotApiKey);
    }
    if (body.telegramBotUsername !== undefined) {
      updateValues.telegramBotUsername = body.telegramBotUsername ? String(body.telegramBotUsername).trim() : null;
    }

    // 5. WhatsApp
    if (body.whatsappEnabled !== undefined) {
      updateValues.whatsappEnabled = Boolean(body.whatsappEnabled);
    }
    if (body.whatsappApiToken !== undefined) {
      updateValues.whatsappApiToken = preserveMaskedSecret(body.whatsappApiToken, existing.whatsappApiToken);
    }
    if (body.whatsappPhoneNumberId !== undefined) {
      updateValues.whatsappPhoneNumberId = body.whatsappPhoneNumberId ? String(body.whatsappPhoneNumberId).trim() : null;
    }
    if (body.whatsappBusinessAccountId !== undefined) {
      updateValues.whatsappBusinessAccountId = body.whatsappBusinessAccountId ? String(body.whatsappBusinessAccountId).trim() : null;
    }
    if (body.whatsappNumber !== undefined) {
      updateValues.whatsappNumber = body.whatsappNumber ? String(body.whatsappNumber).trim() : null;
    }

    // 6. Messenger
    if (body.messengerEnabled !== undefined) {
      updateValues.messengerEnabled = Boolean(body.messengerEnabled);
    }
    if (body.messengerApiKey !== undefined) {
      updateValues.messengerApiKey = preserveMaskedSecret(body.messengerApiKey, existing.messengerApiKey);
    }
    if (body.messengerPageId !== undefined) {
      updateValues.messengerPageId = body.messengerPageId ? String(body.messengerPageId).trim() : null;
    }

    // 7. Web Widget
    if (body.widgetEnabled !== undefined) {
      updateValues.widgetEnabled = Boolean(body.widgetEnabled);
    }
    if (body.websiteChatbotKey !== undefined) {
      updateValues.websiteChatbotKey = body.websiteChatbotKey ? String(body.websiteChatbotKey).trim() : null;
    }
    if (body.widgetAllowedDomains !== undefined) {
      updateValues.widgetAllowedDomains = body.widgetAllowedDomains ? String(body.widgetAllowedDomains).trim() : null;
    }

    // 8. Google Sheets
    if (body.googleSheetsEnabled !== undefined) {
      updateValues.googleSheetsEnabled = Boolean(body.googleSheetsEnabled);
    }
    if (body.googleSheetsLink !== undefined) {
      updateValues.googleSheetsLink = body.googleSheetsLink ? String(body.googleSheetsLink).trim() : null;
    }
    if (body.googleSheetsName !== undefined) {
      updateValues.googleSheetsName = body.googleSheetsName ? String(body.googleSheetsName).trim() : null;
    }
    if (body.googleSheetsPage !== undefined) {
      updateValues.googleSheetsPage = body.googleSheetsPage ? String(body.googleSheetsPage).trim() : null;
    }
    if (body.serviceAccountKey !== undefined) {
      updateValues.serviceAccountKey = preserveMaskedSecret(body.serviceAccountKey, existing.serviceAccountKey);
    }

    // 9. Google Calendar
    if (body.googleCalendarEnabled !== undefined) {
      updateValues.googleCalendarEnabled = Boolean(body.googleCalendarEnabled);
    }
    if (body.googleCalendarId !== undefined) {
      updateValues.googleCalendarId = body.googleCalendarId ? String(body.googleCalendarId).trim() : null;
    }
    if (body.googleCalendarTimezone !== undefined) {
      updateValues.googleCalendarTimezone = body.googleCalendarTimezone ? String(body.googleCalendarTimezone).trim() : "UTC";
    }
    if (body.googleCalendarDuration !== undefined) {
      updateValues.googleCalendarDuration = body.googleCalendarDuration ? Number(body.googleCalendarDuration) : 30;
    }
    if (body.googleCalendarBookingRules !== undefined) {
      updateValues.googleCalendarBookingRules = body.googleCalendarBookingRules ?? null;
    }
    if (body.googleCalendarServiceAccountKey !== undefined) {
      updateValues.googleCalendarServiceAccountKey = preserveMaskedSecret(body.googleCalendarServiceAccountKey, existing.googleCalendarServiceAccountKey);
    }

    // Data Source Permissions
    if (body.allowSourceWebsite !== undefined) updateValues.allowSourceWebsite = Boolean(body.allowSourceWebsite);
    if (body.allowSourceFiles !== undefined) updateValues.allowSourceFiles = Boolean(body.allowSourceFiles);
    if (body.allowSourceWordpress !== undefined) updateValues.allowSourceWordpress = Boolean(body.allowSourceWordpress);
    if (body.allowSourceRestApi !== undefined) updateValues.allowSourceRestApi = Boolean(body.allowSourceRestApi);
    if (body.allowSourceShopify !== undefined) updateValues.allowSourceShopify = Boolean(body.allowSourceShopify);

    // 10. Sidebar Menu Pages Permissions (Dual-save)
    let savedPagesJson: string | null = null;
    let savedPagesArray: string[] | null = null;
    if (body.enabledClientPages !== undefined) {
      if (Array.isArray(body.enabledClientPages)) {
        savedPagesArray = body.enabledClientPages;
        savedPagesJson = JSON.stringify(body.enabledClientPages);
        updateValues.enabledClientPages = savedPagesJson;
      } else if (body.enabledClientPages === null) {
        savedPagesArray = null;
        savedPagesJson = null;
        updateValues.enabledClientPages = null;
      }

      if (savedPagesJson !== null) {
        await db
          .insert(adminConfigTable)
          .values({ key: `enabled_client_pages_${id}`, value: savedPagesJson })
          .onConflictDoUpdate({
            target: adminConfigTable.key,
            set: { value: savedPagesJson, updatedAt: new Date() },
          })
          .catch(() => {});
      } else if (body.enabledClientPages === null) {
        await db.delete(adminConfigTable).where(eq(adminConfigTable.key, `enabled_client_pages_${id}`)).catch(() => {});
      }
    }

    if (Object.keys(updateValues).length > 0) {
      updateValues.updatedAt = new Date();
    }

    let updatedRow: any;
    try {
      const [row] = await db
        .update(companiesTable)
        .set(updateValues)
        .where(eq(companiesTable.id, id))
        .returning();
      updatedRow = row;
    } catch (updateErr: any) {
      logger.warn({ updateErr }, "Update companiesTable with enabledClientPages failed, retrying without it");
      delete updateValues.enabledClientPages;
      const [fallbackRow] = await db
        .update(companiesTable)
        .set(updateValues)
        .where(eq(companiesTable.id, id))
        .returning();
      updatedRow = fallbackRow;
    }

    if (!updatedRow) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Log admin activity
    try {
      const [adminUser] = await db
        .select({ username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, req.session.userId!));
      const performedBy = adminUser?.username ?? "admin";
      const notes: string[] = [];
      if (body.enabledClientPages !== undefined) notes.push("sidebar menu pages");
      if (body.businessType !== undefined) notes.push(`business type (${updatedRow.businessType})`);
      if (body.systemPrompt !== undefined || body.securityPrompt !== undefined) notes.push("system/security prompts");
      if (body.isActive !== undefined) notes.push(`active: ${updatedRow.isActive}`);
      if (body.monthlyTokenQuota !== undefined) notes.push(`quota: ${updatedRow.monthlyTokenQuota}`);
      if (body.telegramEnabled !== undefined || body.whatsappEnabled !== undefined || body.messengerEnabled !== undefined || body.widgetEnabled !== undefined) notes.push("channels");
      if (body.googleSheetsEnabled !== undefined || body.googleCalendarEnabled !== undefined) notes.push("tools");

      await db.insert(companyActivityLogsTable).values({
        companyId: id,
        action: "company_content_updated",
        performedBy,
        note: `Admin updated company content: ${notes.length ? notes.join(", ") : "general settings"}`,
      });
    } catch (logErr) {
      logger.warn({ logErr }, "Failed to log activity for company update");
    }

    const [clientRow] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, updatedRow.clientId));
    res.json({
      id: updatedRow.id,
      clientId: updatedRow.clientId,
      clientName: clientRow?.name ?? null,
      myId: updatedRow.myId ?? null,
      name: updatedRow.name,
      notificationEmail: updatedRow.notificationEmail ?? null,
      resendApiKey: maskApiKey(updatedRow.resendApiKey),
      generalInfo: updatedRow.generalInfo,
      isActive: updatedRow.isActive,
      activationStart: toIsoOrNull(updatedRow.activationStart),
      activationEnd: toIsoOrNull(updatedRow.activationEnd),
      quotaStartDate: toIsoOrNull(updatedRow.quotaStartDate),
      quotaEndDate: toIsoOrNull(updatedRow.quotaEndDate),
      systemPrompt: updatedRow.systemPrompt,
      securityPrompt: updatedRow.securityPrompt,
      googleSheetsEnabled: updatedRow.googleSheetsEnabled,
      googleSheetsLink: updatedRow.googleSheetsLink,
      googleSheetsName: updatedRow.googleSheetsName,
      googleSheetsPage: updatedRow.googleSheetsPage,
      serviceAccountKey: maskApiKey(updatedRow.serviceAccountKey),
      googleCalendarEnabled: updatedRow.googleCalendarEnabled ?? false,
      googleCalendarId: updatedRow.googleCalendarId ?? null,
      googleCalendarTimezone: updatedRow.googleCalendarTimezone ?? "UTC",
      googleCalendarDuration: updatedRow.googleCalendarDuration ?? 30,
      googleCalendarBookingRules: updatedRow.googleCalendarBookingRules ?? null,
      googleCalendarServiceAccountKey: maskApiKey(updatedRow.googleCalendarServiceAccountKey),
      aiProvider: updatedRow.aiProvider ?? null,
      aiModel: updatedRow.aiModel ?? null,
      aiExecutionMode: updatedRow.aiExecutionMode || "quota",
      aiAgentApiKey: maskApiKey(updatedRow.aiAgentApiKey),
      aiAgentUrl: updatedRow.aiAgentUrl,
      monthlyTokenQuota: updatedRow.monthlyTokenQuota ?? null,
      chatLogRetentionDays: updatedRow.chatLogRetentionDays ?? null,
      telegramBotApiKey: maskApiKey(updatedRow.telegramBotApiKey),
      telegramBotUsername: updatedRow.telegramBotUsername,
      telegramEnabled: updatedRow.telegramEnabled ?? false,
      whatsappApiToken: maskApiKey(updatedRow.whatsappApiToken),
      whatsappPhoneNumberId: updatedRow.whatsappPhoneNumberId,
      whatsappBusinessAccountId: updatedRow.whatsappBusinessAccountId,
      whatsappNumber: updatedRow.whatsappNumber,
      whatsappEnabled: updatedRow.whatsappEnabled ?? false,
      messengerApiKey: maskApiKey(updatedRow.messengerApiKey),
      messengerPageId: updatedRow.messengerPageId,
      messengerEnabled: updatedRow.messengerEnabled ?? false,
      websiteChatbotKey: updatedRow.websiteChatbotKey,
      widgetAllowedDomains: updatedRow.widgetAllowedDomains ?? null,
      widgetEnabled: updatedRow.widgetEnabled ?? false,
      websiteDataUrl: updatedRow.websiteDataUrl,
      websiteAutoSync: updatedRow.websiteAutoSync,
      websiteLastSynced: updatedRow.websiteLastSynced?.toISOString() ?? null,
      allowSourceWebsite: updatedRow.allowSourceWebsite === false ? false : true,
      allowSourceFiles: updatedRow.allowSourceFiles === false ? false : true,
      allowSourceWordpress: updatedRow.allowSourceWordpress === false ? false : true,
      allowSourceRestApi: updatedRow.allowSourceRestApi === false ? false : true,
      allowSourceShopify: updatedRow.allowSourceShopify === false ? false : true,
      businessType: updatedRow.businessType || "general",
      enabledClientPages: savedPagesArray !== null
        ? savedPagesArray
        : (body.enabledClientPages === null
            ? null
            : (parseEnabledPages((updatedRow as any)?.enabledClientPages) ?? null)),
      createdAt: updatedRow.createdAt.toISOString(),
      updatedAt: updatedRow.updatedAt.toISOString(),
    });
  } catch (err: any) {
    logger.error({ err }, "Update company error");
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
}

router.patch("/admin/companies/:id", handleUpdateCompany);
router.put("/admin/companies/:id", handleUpdateCompany);

// Dedicated route to update sidebar menu pages permissions (dual persistence)
router.put("/admin/companies/:id/pages", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid company id" });
      return;
    }
    const { enabledClientPages } = req.body || {};
    const pages = Array.isArray(enabledClientPages) ? enabledClientPages : [];
    const jsonStr = JSON.stringify(pages);

    // 1. Save in adminConfigTable (guaranteed storage)
    await db
      .insert(adminConfigTable)
      .values({ key: `enabled_client_pages_${id}`, value: jsonStr })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: jsonStr, updatedAt: new Date() },
      })
      .catch(() => {});

    // 2. Save in companiesTable column if possible
    try {
      if (pool) {
        await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_client_pages TEXT;`).catch(() => {});
        await pool.query(`UPDATE companies SET enabled_client_pages = $1 WHERE id = $2;`, [jsonStr, id]).catch(() => {});
      } else {
        await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_client_pages TEXT;`).catch(() => {});
        await db.execute(sql`UPDATE companies SET enabled_client_pages = ${jsonStr} WHERE id = ${id};`).catch(() => {});
      }
    } catch {}

    res.json({ ok: true, enabledClientPages: pages });
  } catch (err: any) {
    logger.error({ err }, "Update company pages error");
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});
router.patch("/admin/companies/:id/pages", async (req, res) => {
  const id = Number(req.params.id);
  const { enabledClientPages } = req.body || {};
  const pages = Array.isArray(enabledClientPages) ? enabledClientPages : [];
  const jsonStr = JSON.stringify(pages);

  await db
    .insert(adminConfigTable)
    .values({ key: `enabled_client_pages_${id}`, value: jsonStr })
    .onConflictDoUpdate({
      target: adminConfigTable.key,
      set: { value: jsonStr, updatedAt: new Date() },
    })
    .catch(() => {});

  try {
    if (pool) {
      await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_client_pages TEXT;`).catch(() => {});
      await pool.query(`UPDATE companies SET enabled_client_pages = $1 WHERE id = $2;`, [jsonStr, id]).catch(() => {});
    } else {
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_client_pages TEXT;`).catch(() => {});
      await db.execute(sql`UPDATE companies SET enabled_client_pages = ${jsonStr} WHERE id = ${id};`).catch(() => {});
    }
  } catch {}

  res.json({ ok: true, enabledClientPages: pages });
});

// PUT /admin/companies/:id/business-type
router.put("/admin/companies/:id/business-type", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid company id" });
      return;
    }
    await ensureBusinessTypeSchema();

    const rawType = (req.body as any)?.businessType;
    const businessType = rawType === "clinic" ? "clinic" : "general";

    const { pool } = await import("@workspace/db");
    if (pool) {
      await pool.query(
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'general';`
      ).catch(() => {});
      await pool.query(
        `UPDATE companies SET business_type = $1 WHERE id = $2;`,
        [businessType, id]
      );
    } else {
      await db
        .update(companiesTable)
        .set({ businessType })
        .where(eq(companiesTable.id, id));
    }

    try {
      const [adminUser] = await db
        .select({ username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, req.session.userId!));
      const performedBy = adminUser?.username ?? "admin";
      await db.insert(companyActivityLogsTable).values({
        companyId: id,
        action: "business_type_updated",
        performedBy,
        note: `Admin set company business type to: ${businessType === "clinic" ? "Clinic & Appointments CRM (عيادة طبية)" : "General Leads CRM (شركة عامة)"}`,
      });
    } catch (logErr) {
      logger.warn({ logErr }, "Failed to insert activity log for business type update");
    }

    res.json({ ok: true, businessType });
  } catch (err: any) {
    logger.error({ err }, "Set company business type error");
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// DELETE /admin/companies/:id
router.delete("/admin/companies/:id", async (req, res) => {
  try {
    const params = DeleteCompanyParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(companiesTable).where(eq(companiesTable.id, params.data.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Delete company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/companies/:id/status
router.patch("/admin/companies/:id/status", async (req, res) => {
  try {
    const params = ToggleCompanyStatusParams.safeParse({ id: Number(req.params.id) });
    const body = ToggleCompanyStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const [existing] = await db
      .select({ isActive: companiesTable.isActive })
      .from(companiesTable)
      .where(eq(companiesTable.id, params.data.id));

    const updates: Record<string, unknown> = { isActive: body.data.isActive };
    if ("activationStart" in body.data) {
      updates.activationStart = body.data.activationStart ? new Date(body.data.activationStart) : null;
    }
    if ("activationEnd" in body.data) {
      updates.activationEnd = body.data.activationEnd ? new Date(body.data.activationEnd) : null;
    }

    const [row] = await db
      .update(companiesTable)
      .set(updates)
      .where(eq(companiesTable.id, params.data.id))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [[clientRow], [adminUser]] = await Promise.all([
      db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.clientId)),
      db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, req.session.userId!)),
    ]);
    const performedBy = adminUser?.username ?? "admin";

    const logEntries: { companyId: number; action: string; performedBy: string; note?: string }[] = [];

    if (existing && existing.isActive !== body.data.isActive) {
      logEntries.push({
        companyId: row.id,
        action: body.data.isActive ? "activated" : "deactivated",
        performedBy,
      });

      if (body.data.isActive) {
        notifySubscriptionActivated(
          { id: row.id, name: row.name, clientId: row.clientId },
          {
            activationStart: row.activationStart,
            activationEnd: row.activationEnd,
          }
        ).catch((err) => logger.error({ err, companyId: row.id }, "Failed to send subscription activated email"));
      }
    }

    const startStr = body.data.activationStart
      ? new Date(body.data.activationStart).toLocaleDateString()
      : null;
    const endStr = body.data.activationEnd
      ? new Date(body.data.activationEnd).toLocaleDateString()
      : null;

    if ("activationStart" in body.data || "activationEnd" in body.data) {
      let note: string;
      if (startStr || endStr) {
        note = `Set activation window: ${startStr ?? "—"} → ${endStr ?? "—"}`;
      } else {
        note = "Cleared activation window";
      }
      logEntries.push({ companyId: row.id, action: "dates_set", performedBy, note });
    }

    if (logEntries.length > 0) {
      await db.insert(companyActivityLogsTable).values(logEntries);
    }

    res.json({
      id: row.id,
      clientId: row.clientId,
      clientName: clientRow?.name ?? null,
      myId: row.myId ?? null,
      name: row.name,
      notificationEmail: row.notificationEmail ?? null,
      resendApiKey: maskApiKey(row.resendApiKey),
      generalInfo: row.generalInfo,
      isActive: row.isActive,
      activationStart: row.activationStart?.toISOString() ?? null,
      activationEnd: row.activationEnd?.toISOString() ?? null,
      systemPrompt: row.systemPrompt,
        securityPrompt: row.securityPrompt,
      googleSheetsEnabled: row.googleSheetsEnabled,
      googleSheetsLink: row.googleSheetsLink,
      googleSheetsName: row.googleSheetsName,
      googleSheetsPage: row.googleSheetsPage,
      serviceAccountKey: maskApiKey(row.serviceAccountKey),
      aiAgentApiKey: maskApiKey(row.aiAgentApiKey),
      aiAgentUrl: row.aiAgentUrl,
      telegramBotApiKey: maskApiKey(row.telegramBotApiKey),
      telegramBotUsername: row.telegramBotUsername,
      whatsappApiToken: maskApiKey(row.whatsappApiToken),
      whatsappPhoneNumberId: row.whatsappPhoneNumberId,
      whatsappBusinessAccountId: row.whatsappBusinessAccountId,
      whatsappNumber: row.whatsappNumber,
      messengerApiKey: maskApiKey(row.messengerApiKey),
      messengerPageId: row.messengerPageId,
      websiteChatbotKey: row.websiteChatbotKey,
      websiteDataUrl: row.websiteDataUrl,
      websiteAutoSync: row.websiteAutoSync,
      websiteLastSynced: row.websiteLastSynced?.toISOString() ?? null,
      allowSourceWebsite: row.allowSourceWebsite ?? true,
      allowSourceFiles: row.allowSourceFiles ?? true,
      allowSourceWordpress: row.allowSourceWordpress ?? true,
      allowSourceRestApi: row.allowSourceRestApi ?? true,
      allowSourceShopify: row.allowSourceShopify ?? true,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Toggle company status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/companies/:id/logs
// PUT /admin/companies/:id/quota
router.put("/admin/companies/:id/quota", async (req, res) => {
  await ensureQuotaColumns();
  try {
    const id = Number(req.params.id);
    const { monthlyTokenQuota, quotaStartDate, quotaEndDate, startDate, endDate, aiModel, aiProvider } = req.body as {
      monthlyTokenQuota: number | null;
      quotaStartDate?: string | null;
      quotaEndDate?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      aiModel?: string | null;
      aiProvider?: string | null;
    };
    const quota = monthlyTokenQuota == null ? null : Number(monthlyTokenQuota);
    if (quota !== null && (isNaN(quota) || quota < 0)) {
      res.status(400).json({ error: "Invalid quota value" });
      return;
    }

    const updates: Partial<typeof companiesTable.$inferInsert> = {
      monthlyTokenQuota: quota,
    };

    if (aiProvider !== undefined) {
      updates.aiProvider = (aiProvider && typeof aiProvider === "string" && aiProvider.trim())
        ? (aiProvider.trim() as any)
        : null;
    }
    if (aiModel !== undefined) {
      updates.aiModel = (aiModel && typeof aiModel === "string" && aiModel.trim())
        ? aiModel.trim()
        : null;
    }

    // Quota Validity Period updates strictly quotaStartDate and quotaEndDate.
    // It must NEVER touch or overwrite subscription activationStart or activationEnd!
    const qStart = quotaStartDate !== undefined ? quotaStartDate : startDate;
    const qEnd = quotaEndDate !== undefined ? quotaEndDate : endDate;

    if (qStart !== undefined) {
      if (!qStart || qStart === "" || qStart === "null") {
        updates.quotaStartDate = null;
      } else {
        const d = new Date(qStart);
        updates.quotaStartDate = isNaN(d.getTime()) ? null : d;
      }
    }
    if (qEnd !== undefined) {
      if (!qEnd || qEnd === "" || qEnd === "null") {
        updates.quotaEndDate = null;
      } else {
        const d = new Date(qEnd);
        updates.quotaEndDate = isNaN(d.getTime()) ? null : d;
      }
    }

    let updated;
    try {
      [updated] = await db
        .update(companiesTable)
        .set(updates)
        .where(eq(companiesTable.id, id))
        .returning();
    } catch (dbErr: any) {
      if (dbErr?.message?.includes("quota_start_date") || dbErr?.message?.includes("quota_end_date")) {
        logger.warn({ dbErr }, "Column missing during quota update, running ALTER TABLE and retrying...");
        await db.execute(sql`
          ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_start_date TIMESTAMP WITH TIME ZONE;
          ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_end_date TIMESTAMP WITH TIME ZONE;
        `);
        [updated] = await db
          .update(companiesTable)
          .set(updates)
          .where(eq(companiesTable.id, id))
          .returning();
      } else {
        throw dbErr;
      }
    }
    if (!updated) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({
      ok: true,
      monthlyTokenQuota: updated.monthlyTokenQuota ?? null,
      quotaStartDate: toIsoOrNull(updated.quotaStartDate),
      quotaEndDate: toIsoOrNull(updated.quotaEndDate),
      activationStart: toIsoOrNull(updated.activationStart),
      activationEnd: toIsoOrNull(updated.activationEnd),
      aiProvider: updated.aiProvider ?? null,
      aiModel: updated.aiModel ?? null,
    });
  } catch (err: any) {
    logger.error({ err, message: err?.message, stack: err?.stack }, "Set company quota error");
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

function buildBillEmailHtml(data: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  rangeLabel: string;
  effectiveModel: string;
  quotaFormatted: string;
  validityPeriod: string;
  totalMessages: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  quotaPercent: string;
  remainingTokens: string;
  totalCost: string;
  hasImageAttachment: boolean;
}) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة استهلاك الحصة</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
      <div style="font-size: 32px; margin-bottom: 6px;">🧾</div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">فاتورة استهلاك الحصة (Quota Usage Bill)</h1>
      <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9; font-family: monospace;">رقم الفاتورة: ${escapeHtml(data.invoiceNumber)}</p>
      <div style="margin-top: 10px; display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;">
        الفترة: ${escapeHtml(data.rangeLabel)}
      </div>
    </div>

    <div style="padding: 24px;">
      <!-- Meta Information Grid -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 20px;">
        <tr>
          <td style="background: #f9fafb; padding: 12px 14px; border-radius: 10px; border: 1px solid #f3f4f6; width: 50%;">
            <span style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 2px;">الشركة:</span>
            <strong style="font-size: 14px; color: #111827;">${escapeHtml(data.companyName)}</strong>
          </td>
          <td style="background: #f9fafb; padding: 12px 14px; border-radius: 10px; border: 1px solid #f3f4f6; width: 50%;">
            <span style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 2px;">العميل:</span>
            <strong style="font-size: 14px; color: #111827;">${escapeHtml(data.clientName)}</strong>
          </td>
        </tr>
        <tr>
          <td style="background: #f9fafb; padding: 12px 14px; border-radius: 10px; border: 1px solid #f3f4f6;">
            <span style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 2px;">النموذج النشط:</span>
            <span style="font-size: 12px; font-family: monospace; color: #d97706; font-weight: 600;">${escapeHtml(data.effectiveModel)}</span>
          </td>
          <td style="background: #f9fafb; padding: 12px 14px; border-radius: 10px; border: 1px solid #f3f4f6;">
            <span style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 2px;">الحصة المخصصة:</span>
            <strong style="font-size: 13px; color: #2563eb;">${escapeHtml(data.quotaFormatted)}</strong>
          </td>
        </tr>
        ${data.validityPeriod ? `
        <tr>
          <td colspan="2" style="background: #f0fdf4; padding: 10px 14px; border-radius: 10px; border: 1px solid #dcfce7; text-align: center; font-size: 12px;">
            <span style="color: #166534;">📅 فترة صلاحية الحصة: <strong>${escapeHtml(data.validityPeriod)}</strong></span>
          </td>
        </tr>` : ""}
      </table>

      <!-- Progress Section -->
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px;">
          <span style="color: #4b5563; font-weight: 500;">مستوى استهلاك الحصة:</span>
          <strong style="color: #059669;">${escapeHtml(data.quotaPercent)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; margin-top: 8px;">
          <span>المستهلك: <strong style="color: #111827;">${data.totalTokens.toLocaleString()}</strong> tokens</span>
          <span>المتبقي: <strong style="color: #111827;">${escapeHtml(data.remainingTokens)}</strong></span>
        </div>
      </div>

      <!-- Itemized Table -->
      <h3 style="font-size: 14px; margin: 0 0 10px; color: #374151;">تفاصيل الاستهلاك للفترة:</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb; text-align: right;">
            <th style="padding: 10px 12px; color: #4b5563;">البند</th>
            <th style="padding: 10px 12px; color: #4b5563; text-align: center;">الكمية / الاستهلاك</th>
            <th style="padding: 10px 12px; color: #4b5563; text-align: left;">التكلفة التقديرية</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px;">إجمالي رسائل المحادثة</td>
            <td style="padding: 10px 12px; text-align: center; font-family: monospace;">${data.totalMessages.toLocaleString()} msgs</td>
            <td style="padding: 10px 12px; text-align: left; color: #9ca3af;">—</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px;">رموز المدخلات (Input)</td>
            <td style="padding: 10px 12px; text-align: center; font-family: monospace;">${data.inputTokens.toLocaleString()} tokens</td>
            <td style="padding: 10px 12px; text-align: left; font-family: monospace;">$${(data.inputTokens * 0.00000015).toFixed(4)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px;">رموز المخرجات (Output)</td>
            <td style="padding: 10px 12px; text-align: center; font-family: monospace;">${data.outputTokens.toLocaleString()} tokens</td>
            <td style="padding: 10px 12px; text-align: left; font-family: monospace;">$${(data.outputTokens * 0.0000006).toFixed(4)}</td>
          </tr>
          <tr style="background: #f0fdf4; font-weight: bold; border-top: 2px solid #bbf7d0;">
            <td style="padding: 12px; color: #166534;">إجمالي الاستهلاك والتكلفة</td>
            <td style="padding: 12px; text-align: center; color: #166534; font-family: monospace;">${data.totalTokens.toLocaleString()} tokens</td>
            <td style="padding: 12px; text-align: left; color: #166534; font-size: 15px; font-family: monospace;">$${escapeHtml(data.totalCost)} USD</td>
          </tr>
        </tbody>
      </table>

      ${data.hasImageAttachment ? `
      <!-- Embedded Visual Bill Image -->
      <div style="margin: 24px 0; text-align: center;">
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">📷 نسخة طبق الأصل من بطاقة الفاتورة:</p>
        <img src="cid:bill-image" alt="Bill Screenshot" style="max-width: 100%; height: auto; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0,0,0,0.08);" />
      </div>` : ""}

      <!-- Footer Info -->
      <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
        <p style="margin: 0;">تم إرسال هذه الفاتورة تلقائياً من نظام <strong>Bot Manager</strong> إلى بريد الإشعارات المسجل لديك.</p>
        <p style="margin: 4px 0 0;">إذا كانت لديك أي استفسارات بخصوص هذه الفاتورة، يرجى التواصل مع إدارة النظام.</p>
      </div>

    </div>
  </div>
</body>
</html>
  `;
}

function buildTopupBillEmailHtml(data: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  addedTokens: number;
  previousQuota: number;
  newTotalQuota: number;
  newEndDate?: string | null;
  price: number;
  notes?: string;
  hasImageAttachment: boolean;
}) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة شحن باقة إضافية</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
      <div style="font-size: 32px; margin-bottom: 6px;">⚡</div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">فاتورة شحن باقة إضافية (Top-up Quota Invoice)</h1>
      <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9; font-family: monospace;">رقم الفاتورة: ${escapeHtml(data.invoiceNumber)}</p>
      <div style="margin-top: 10px; display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;">
        الحالة: تم الشحن والتفعيل بنجاح ✅
      </div>
    </div>

    <div style="padding: 24px;">
      <!-- Meta Information Grid -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 20px;">
        <tr>
          <td style="background: #f9fafb; padding: 12px 14px; border-radius: 10px; border: 1px solid #f3f4f6; width: 50%;">
            <span style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 2px;">الشركة:</span>
            <strong style="font-size: 14px; color: #111827;">${escapeHtml(data.companyName)}</strong>
          </td>
          <td style="background: #f9fafb; padding: 12px 14px; border-radius: 10px; border: 1px solid #f3f4f6; width: 50%;">
            <span style="display: block; font-size: 11px; color: #6b7280; margin-bottom: 2px;">العميل:</span>
            <strong style="font-size: 14px; color: #111827;">${escapeHtml(data.clientName)}</strong>
          </td>
        </tr>
      </table>

      <!-- Itemized Table -->
      <h3 style="font-size: 14px; margin: 0 0 10px; color: #374151;">تفاصيل شحن الباقة:</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb; text-align: right;">
            <th style="padding: 10px 12px; color: #4b5563;">البند</th>
            <th style="padding: 10px 12px; color: #4b5563; text-align: left;">القيمة</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px; font-weight: 600; color: #0d9488;">⚡ الباقة المضافة (Top-up Tokens)</td>
            <td style="padding: 10px 12px; text-align: left; font-family: monospace; font-weight: bold; color: #0d9488;">+${data.addedTokens.toLocaleString()} tokens</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px;">الحصة الشهرية السابقة</td>
            <td style="padding: 10px 12px; text-align: left; font-family: monospace;">${data.previousQuota.toLocaleString()} tokens</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px; font-weight: 600;">الحصة الإجمالية الجديدة بعد الشحن</td>
            <td style="padding: 10px 12px; text-align: left; font-family: monospace; font-weight: bold; color: #2563eb;">${data.newTotalQuota.toLocaleString()} tokens</td>
          </tr>
          ${data.newEndDate ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 10px 12px;">📅 تاريخ انتهاء الصلاحية المحدث</td>
            <td style="padding: 10px 12px; text-align: left; font-family: monospace;">${escapeHtml(data.newEndDate)}</td>
          </tr>` : ""}
          <tr style="background: #f0fdf4; font-weight: bold; border-top: 2px solid #bbf7d0;">
            <td style="padding: 12px; color: #166534;">المبلغ الإجمالي المدفوع</td>
            <td style="padding: 12px; text-align: left; color: #166534; font-size: 16px; font-family: monospace;">$${data.price.toFixed(2)} USD</td>
          </tr>
        </tbody>
      </table>

      ${data.notes ? `
      <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 12px; color: #92400e;">
        <strong>ملاحظات:</strong> ${escapeHtml(data.notes)}
      </div>` : ""}

      ${data.hasImageAttachment ? `
      <!-- Embedded Visual Bill Image -->
      <div style="margin: 24px 0; text-align: center;">
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">📷 نسخة طبق الأصل من بطاقة الفاتورة:</p>
        <img src="cid:bill-image" alt="Bill Screenshot" style="max-width: 100%; height: auto; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0,0,0,0.08);" />
      </div>` : ""}

      <!-- Footer Info -->
      <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center; font-size: 12px; color: #9ca3af;">
        <p style="margin: 0;">تم إرسال هذه الفاتورة تلقائياً من نظام <strong>Bot Manager</strong> لتأكيد إضافة الباقة وتحديث الحصة بنجاح.</p>
      </div>

    </div>
  </div>
</body>
</html>
  `;
}

// POST /admin/companies/:id/send-bill-email — Send bill invoice with image to notification email
router.post("/admin/companies/:id/send-bill-email", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid company id" });
      return;
    }

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [clientUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, company.clientId))
      .limit(1);

    const emailConfig = await getEmailConfig();

    const recipient =
      (typeof req.body?.recipientEmail === "string" && req.body.recipientEmail.trim()) ||
      company.notificationEmail?.trim() ||
      clientUser?.notificationEmail?.trim() ||
      (emailConfig && typeof (emailConfig as any).recipientEmail === "string" ? (emailConfig as any).recipientEmail.trim() : undefined);

    if (!recipient) {
      res.status(400).json({
        error: "لم يتم العثور على بريد إلكتروني للإشعارات. يرجى إدخال بريد Gmail في حقل Notification Email (Gmail) في صفحة الإعدادات أو كتابته في نافذة المشاركة.",
      });
      return;
    }

    // Auto-save the email as company notificationEmail if specified
    if (req.body?.saveAsNotificationEmail && req.body?.recipientEmail) {
      const emailToSave = req.body.recipientEmail.trim();
      await db.update(companiesTable).set({ notificationEmail: emailToSave }).where(eq(companiesTable.id, id)).catch(() => {});
      if (company.clientId) {
        await db.update(usersTable).set({ notificationEmail: emailToSave }).where(eq(usersTable.id, company.clientId)).catch(() => {});
      }
    }

    const { imageDataUrl, billData } = req.body as {
      imageDataUrl?: string;
      recipientEmail?: string;
      saveAsNotificationEmail?: boolean;
      billData?: any;
    };

    const isTopup = Boolean(billData?.isTopup);
    const invoiceNumber = billData?.invoiceNumber || (isTopup ? `INV-TOPUP-${company.id}-${Date.now().toString().slice(-6)}` : `INV-Q-${company.id}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`);
    const rangeLabel = billData?.rangeLabel || "الشهر الحالي";
    const effectiveModel = billData?.effectiveModel || company.aiModel || "gpt-4o-mini";
    const quotaVal = billData?.quota ?? company.monthlyTokenQuota;
    const quotaFormatted = quotaVal ? (quotaVal >= 1000000 ? `${(quotaVal / 1000000).toFixed(1)}M` : quotaVal >= 1000 ? `${(quotaVal / 1000).toFixed(0)}K` : String(quotaVal)) : "غير محدود";
    const validityPeriod =
      company.quotaStartDate || company.quotaEndDate
        ? `${company.quotaStartDate ? new Date(company.quotaStartDate).toLocaleDateString() : "—"} → ${company.quotaEndDate ? new Date(company.quotaEndDate).toLocaleDateString() : "—"}`
        : (company.activationStart || company.activationEnd
          ? `${company.activationStart ? new Date(company.activationStart).toLocaleDateString() : "—"} → ${company.activationEnd ? new Date(company.activationEnd).toLocaleDateString() : "—"}`
          : "");

    const emailSubject = isTopup
      ? (billData?.subject || `[فاتورة شحن باقة إضافية] ${company.name} - #${invoiceNumber}`)
      : `[فاتورة استهلاك الحصة] ${company.name} - #${invoiceNumber}`;

    const emailHtml = isTopup
      ? buildTopupBillEmailHtml({
          companyName: company.name,
          clientName: clientUser?.name || "—",
          invoiceNumber,
          addedTokens: Number(billData?.addedTokens || 0),
          previousQuota: Number(billData?.previousQuota || 0),
          newTotalQuota: Number(billData?.newTotalQuota || 0),
          newEndDate: billData?.newEndDate || null,
          price: Number(billData?.price || 0),
          notes: billData?.notes || undefined,
          hasImageAttachment: !!imageDataUrl,
        })
      : buildBillEmailHtml({
          companyName: company.name,
          clientName: clientUser?.name || "—",
          invoiceNumber,
          rangeLabel,
          effectiveModel,
          quotaFormatted,
          validityPeriod,
          totalMessages: billData?.messages ?? 0,
          inputTokens: billData?.inputTokens ?? 0,
          outputTokens: billData?.outputTokens ?? 0,
          totalTokens: billData?.totalTokens ?? 0,
          quotaPercent: billData?.percent != null ? `${Number(billData.percent).toFixed(1)}%` : "0%",
          remainingTokens: billData?.remaining != null ? `${Number(billData.remaining).toLocaleString()} tokens` : "غير محدود",
          totalCost: billData?.cost != null ? (Number(billData.cost) > 0 && Number(billData.cost) < 0.0001 ? Number(billData.cost).toFixed(6) : Number(billData.cost).toFixed(4)) : "0.0000",
          hasImageAttachment: !!imageDataUrl,
        });

    let sentVia = "";
    let sendError: string | null = null;

    // 1. Try Resend first if available
    const { apiKey: resendApiKey, fromEmail } = await getResendConfig(company.resendApiKey || clientUser?.resendApiKey);

    if (resendApiKey) {
      try {
        const resendAttachments: any[] = [];
        if (imageDataUrl && imageDataUrl.includes(",")) {
          const base64Data = imageDataUrl.split(",")[1];
          resendAttachments.push({
            filename: `Invoice-${invoiceNumber}.png`,
            content: base64Data,
          });
        }

        const resendPayload: any = {
          from: fromEmail,
          to: [recipient],
          subject: emailSubject,
          html: emailHtml,
        };
        if (resendAttachments.length > 0) {
          resendPayload.attachments = resendAttachments;
        }

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(resendPayload),
        });

        if (resendRes.ok) {
          sentVia = "resend";
        } else {
          const errText = await resendRes.text();
          sendError = `Resend failed: ${errText}`;
          logger.warn({ errText }, "Resend failed for bill share, trying SMTP fallback");
        }
      } catch (err: any) {
        sendError = `Resend exception: ${err?.message}`;
        logger.warn({ err }, "Resend exception for bill share, trying SMTP fallback");
      }
    }

    // 2. Fallback to SMTP (Nodemailer)
    if (!sentVia && isSmtpConfigured(emailConfig)) {
      try {
        const transporter = buildTransporter(emailConfig);
        const mailAttachments: any[] = [];
        if (imageDataUrl && imageDataUrl.includes(",")) {
          const base64Data = imageDataUrl.split(",")[1];
          mailAttachments.push({
            filename: `Invoice-${invoiceNumber}.png`,
            content: Buffer.from(base64Data, "base64"),
            cid: "bill-image",
          });
        }

        await transporter.sendMail({
          from: `"Bot Manager" <${emailConfig.smtpUser}>`,
          to: recipient,
          subject: emailSubject,
          html: emailHtml,
          attachments: mailAttachments,
        });
        sentVia = "smtp";
      } catch (smtpErr: any) {
        logger.error({ smtpErr }, "SMTP failed for bill share");
        sendError = `SMTP error: ${smtpErr?.message}`;
      }
    }

    if (!sentVia) {
      res.status(400).json({
        error: sendError || "لم يتم العثور على خدمة بريد مهيأة (Resend أو SMTP). يرجى التحقق من إعدادات البريد في صفحة الإعدادات.",
      });
      return;
    }

    await logAdminActivity(
      req.session.userId!,
      "Share Bill Email",
      `Sent quota bill invoice image for "${company.name}" to "${recipient}" via ${sentVia}.`,
      req.ip || null
    );

    res.json({
      ok: true,
      recipient,
      sentVia,
      message: `تم إرسال صورة وبيانات الفاتورة بنجاح إلى: ${recipient}`,
    });
  } catch (err: any) {
    logger.error({ err }, "Error sending bill email");
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

// PUT /admin/companies/:id/retention
router.put("/admin/companies/:id/retention", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid company id" });
      return;
    }
    const { retentionDays } = req.body as { retentionDays: number | null | undefined };
    const days = retentionDays === null || retentionDays === undefined || retentionDays === 0 ? null : Number(retentionDays);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
      res.status(400).json({ error: "retentionDays must be an integer between 1 and 365, or null for default" });
      return;
    }
    const [updated] = await db
      .update(companiesTable)
      .set({ chatLogRetentionDays: days })
      .where(eq(companiesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [adminUser] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));
    const performedBy = adminUser?.username ?? "admin";

    await db.insert(companyActivityLogsTable).values({
      companyId: id,
      action: "retention_policy_set",
      performedBy,
      note: days ? `Set auto-delete retention policy to ${days} days` : "Reset auto-delete retention policy to global default",
    });

    res.json({ ok: true, retentionDays: updated.chatLogRetentionDays ?? null });
  } catch (err) {
    logger.error({ err }, "Set company retention error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/companies/:id/data-source-permissions
router.put("/admin/companies/:id/data-source-permissions", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid company id" });
      return;
    }
    const {
      allowSourceWebsite,
      allowSourceFiles,
      allowSourceWordpress,
      allowSourceRestApi,
      allowSourceShopify,
    } = req.body as {
      allowSourceWebsite?: boolean;
      allowSourceFiles?: boolean;
      allowSourceWordpress?: boolean;
      allowSourceRestApi?: boolean;
      allowSourceShopify?: boolean;
    };

    const updates: Record<string, boolean> = {};
    if (allowSourceWebsite !== undefined) updates.allowSourceWebsite = Boolean(allowSourceWebsite);
    if (allowSourceFiles !== undefined) updates.allowSourceFiles = Boolean(allowSourceFiles);
    if (allowSourceWordpress !== undefined) updates.allowSourceWordpress = Boolean(allowSourceWordpress);
    if (allowSourceRestApi !== undefined) updates.allowSourceRestApi = Boolean(allowSourceRestApi);
    if (allowSourceShopify !== undefined) updates.allowSourceShopify = Boolean(allowSourceShopify);

    const [updated] = await db
      .update(companiesTable)
      .set(updates)
      .where(eq(companiesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [adminUser] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));
    const performedBy = adminUser?.username ?? "admin";

    await db.insert(companyActivityLogsTable).values({
      companyId: id,
      action: "data_source_permissions_updated",
      performedBy,
      note: `Updated data source permissions: Website=${updated.allowSourceWebsite}, Files=${updated.allowSourceFiles}, WordPress=${updated.allowSourceWordpress}, REST API=${updated.allowSourceRestApi}, Shopify=${updated.allowSourceShopify}`,
    });

    logger.info(
      {
        companyId: id,
        updates,
        result: {
          allowSourceWebsite: updated.allowSourceWebsite,
          allowSourceFiles: updated.allowSourceFiles,
          allowSourceWordpress: updated.allowSourceWordpress,
          allowSourceRestApi: updated.allowSourceRestApi,
          allowSourceShopify: updated.allowSourceShopify,
        },
      },
      "Data source permissions updated successfully"
    );

    res.json({
      ok: true,
      permissions: {
        allowSourceWebsite: updated.allowSourceWebsite,
        allowSourceFiles: updated.allowSourceFiles,
        allowSourceWordpress: updated.allowSourceWordpress,
        allowSourceRestApi: updated.allowSourceRestApi,
        allowSourceShopify: updated.allowSourceShopify,
      },
    });
  } catch (err) {
    logger.error({ err }, "Set company data source permissions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/companies/:id/logs", async (req, res) => {
  try {
    const params = GetCompanyParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const logs = await db
      .select()
      .from(companyActivityLogsTable)
      .where(eq(companyActivityLogsTable.companyId, params.data.id))
      .orderBy(desc(companyActivityLogsTable.createdAt))
      .limit(50);

    res.json(
      logs.map((log) => ({
        id: log.id,
        companyId: log.companyId,
        action: log.action,
        performedBy: log.performedBy,
        note: log.note ?? null,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "Get company activity logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/chat-logs
router.get("/admin/chat-logs", async (req, res) => {
  // Prevent aggressive browser caching that causes 304 Not Modified and overwrites optimistic UI
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  try {
    const queryParams = ListAllChatLogsQueryParams.safeParse(req.query);
    const companyIdFilter = queryParams.success && queryParams.data.companyId ? Number(queryParams.data.companyId) : null;
    const channelFilter = queryParams.success && queryParams.data.channel ? String(queryParams.data.channel) : null;
    const fromDateParam = queryParams.success && queryParams.data.fromDate ? String(queryParams.data.fromDate) : null;
    const toDateParam = queryParams.success && queryParams.data.toDate ? String(queryParams.data.toDate) : null;
    const fromDate = fromDateParam ? new Date(`${fromDateParam}T00:00:00.000Z`) : null;
    const toDate = toDateParam ? new Date(`${toDateParam}T23:59:59.999Z`) : null;

    let query = db
      .select({
        log: chatLogsTable,
        companyName: companiesTable.name,
      })
      .from(chatLogsTable)
      .leftJoin(companiesTable, eq(chatLogsTable.companyId, companiesTable.id))
      .$dynamic();

    const conditions = [];
    if (companyIdFilter) conditions.push(eq(chatLogsTable.companyId, companyIdFilter));
    if (channelFilter) conditions.push(eq(chatLogsTable.channel, channelFilter as "telegram" | "whatsapp" | "messenger" | "website"));
    if (fromDate) conditions.push(gte(chatLogsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(chatLogsTable.createdAt, toDate));
    if (conditions.length > 0) query = query.where(and(...conditions));

    const rows = await query.orderBy(sql`${chatLogsTable.createdAt} DESC`).limit(200);

    const mappedRows: any[] = rows.map(({ log, companyName }) => ({
      id: log.id,
      companyId: log.companyId,
      companyName: companyName ?? null,
      channel: log.channel,
      sessionId: log.sessionId,
      customerMessage: log.customerMessage,
      botResponse: log.botResponse,
      isRead: log.isRead,
      isHandoff: log.isHandoff,
      createdAt: log.createdAt.toISOString(),
    }));

    // If not filtered to telegram/whatsapp/messenger, also merge tickets so customer problems appear in Inbox
    if (!channelFilter || channelFilter === "website" || channelFilter === "tickets") {
      let ticketQuery = db
        .select({
          ticket: ticketsTable,
          companyName: companiesTable.name,
          companyId: companiesTable.id,
        })
        .from(ticketsTable)
        .leftJoin(companiesTable, eq(ticketsTable.clientId, companiesTable.clientId))
        .$dynamic();

      const ticketConditions = [];
      if (companyIdFilter) ticketConditions.push(eq(companiesTable.id, companyIdFilter));
      if (fromDate) ticketConditions.push(gte(ticketsTable.createdAt, fromDate));
      if (toDate) ticketConditions.push(lte(ticketsTable.createdAt, toDate));
      if (ticketConditions.length > 0) ticketQuery = ticketQuery.where(and(...ticketConditions));

      const tickets = await ticketQuery.orderBy(sql`${ticketsTable.createdAt} DESC`).limit(100);

      const existingSessionIds = new Set(mappedRows.map((r) => r.sessionId));
      for (const { ticket, companyName, companyId } of tickets) {
        const sessId = `ticket_${ticket.id}`;
        if (!existingSessionIds.has(sessId)) {
          mappedRows.push({
            id: 9000000 + ticket.id,
            companyId: companyId ?? 0,
            companyName: companyName ?? "عميل",
            channel: "website",
            sessionId: sessId,
            customerMessage: `[تذكرة مشكلة #${ticket.id}: ${ticket.title}]\n\n${ticket.description}`,
            botResponse: ticket.aiResponse
              ? `[حل الذكاء الاصطناعي]:\n${ticket.aiResponse}`
              : ticket.adminNote
              ? `[حل المشرف]:\n${ticket.adminNote}`
              : null,
            isRead: ticket.status === "resolved",
            isHandoff: ticket.status === "open",
            createdAt: ticket.createdAt.toISOString(),
          });
        }
      }
      mappedRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    res.json(mappedRows);
  } catch (err) {
    logger.error({ err }, "List chat logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/chat-logs/:id/read
router.patch("/admin/chat-logs/:id/read", async (req, res) => {
  try {
    logger.info({ id: req.params.id }, "RECEIVED REQUEST TO MARK AS READ");
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      logger.warn({ id: req.params.id }, "INVALID ID PROVIDED");
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const result = await db
      .update(chatLogsTable)
      .set({ isRead: true })
      .where(eq(chatLogsTable.id, id))
      .returning();
      
    logger.info({ id, rowsUpdated: result.length }, "DB UPDATE EXECUTED");
    res.json({ ok: true, updated: result.length });
  } catch (err) {
    logger.error({ err }, "Mark admin chat log as read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/chat-logs/:id
router.delete("/admin/chat-logs/:id", async (req, res) => {
  try {
    const params = DeleteChatLogParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const deleted = await db.delete(chatLogsTable).where(eq(chatLogsTable.id, params.data.id)).returning({ id: chatLogsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Chat log not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Delete chat log error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/chat-log-retention
router.get("/admin/chat-log-retention", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "chat_log_retention_days"))
      .limit(1);
    const retentionDays = row?.value ? parseInt(row.value, 10) : 7;
    res.json({ retentionDays });
  } catch (err) {
    logger.error({ err }, "Get chat log retention error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/chat-log-retention
router.put("/admin/chat-log-retention", async (req, res) => {
  try {
    const days = Number((req.body as Record<string, unknown>).retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      res.status(400).json({ error: "retentionDays must be an integer between 1 and 365" });
      return;
    }
    await db
      .insert(adminConfigTable)
      .values({ key: "chat_log_retention_days", value: String(days) })
      .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: String(days) } });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Update chat log retention error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/tickets
// GET /admin/ticket-analytics
router.get("/admin/ticket-analytics", async (req, res) => {
  try {
    const { from, to, range } = req.query as { from?: string; to?: string; range?: string };
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from) {
      fromDate = from.includes("T") ? new Date(from) : new Date(`${from}T00:00:00.000Z`);
      if (isNaN(fromDate.getTime())) fromDate = undefined;
    }
    if (to) {
      toDate = to.includes("T") ? new Date(to) : new Date(`${to}T23:59:59.999Z`);
      if (isNaN(toDate.getTime())) toDate = undefined;
    }

    if (!fromDate && range && range !== "all") {
      const now = new Date();
      if (range === "month") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (range === "today") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (range === "7d") {
        fromDate = new Date(now.getTime() - 7 * 864e5);
      } else if (range === "30d") {
        fromDate = new Date(now.getTime() - 30 * 864e5);
      }
    }

    const conditions = [];
    if (fromDate) conditions.push(gte(ticketsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(ticketsTable.createdAt, toDate));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id:        ticketsTable.id,
        status:    ticketsTable.status,
        aiResponse: ticketsTable.aiResponse,
        aiProvider: ticketsTable.aiProvider,
        aiModel:    ticketsTable.aiModel,
        createdAt:  ticketsTable.createdAt,
        updatedAt:  ticketsTable.updatedAt,
      })
      .from(ticketsTable)
      .where(whereClause);

    const total    = rows.length;
    const open     = rows.filter((r) => r.status === "open").length;
    const resolved = rows.filter((r) => r.status === "resolved").length;
    const aiSolved = rows.filter((r) => !!r.aiResponse).length;
    const aiSolveRate = total > 0 ? Math.round((aiSolved / total) * 100) : 0;

    // Average resolution time (ms) for resolved tickets
    const resolvedRows = rows.filter((r) => r.status === "resolved");
    const avgResolutionMs = resolvedRows.length > 0
      ? Math.round(resolvedRows.reduce((sum, r) => sum + (r.updatedAt.getTime() - r.createdAt.getTime()), 0) / resolvedRows.length)
      : 0;

    // Model breakdown â€” only tickets that were AI-solved
    const modelMap: Record<string, { model: string; provider: string; count: number }> = {};
    for (const r of rows) {
      if (!r.aiModel) continue;
      const key = `${r.aiProvider}::${r.aiModel}`;
      if (!modelMap[key]) modelMap[key] = { model: r.aiModel, provider: r.aiProvider ?? "unknown", count: 0 };
      modelMap[key].count++;
    }
    const byModel = Object.values(modelMap)
      .sort((a, b) => b.count - a.count)
      .map((m) => ({ ...m, share: aiSolved > 0 ? Math.round((m.count / aiSolved) * 100) : 0 }));

    res.json({ total, open, resolved, aiSolved, aiSolveRate, avgResolutionMs, byModel });
  } catch (err) {
    logger.error({ err }, "Ticket analytics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/tickets", async (req, res) => {
  try {
    const rows = await db
      .select({
        ticket: ticketsTable,
        clientName: usersTable.name,
        clientUsername: usersTable.username,
      })
      .from(ticketsTable)
      .leftJoin(usersTable, eq(ticketsTable.clientId, usersTable.id))
      .orderBy(desc(ticketsTable.createdAt));

    // For each client, if they submitted multiple plan switch/upgrade requests,
    // automatically cancel and purge any older superseded requests so that ONLY the
    // latest switch request is forwarded and visible to the admin.
    const clientPlanTickets = new Map<number, typeof rows>();
    for (const r of rows) {
      const title = r.ticket.title || "";
      const lower = title.toLowerCase();
      const isPlan =
        title.includes("طلب تغيير باقة") ||
        title.includes("طلب اشتراك") ||
        title.includes("باقة") ||
        lower.includes("plan") ||
        lower.includes("upgrade") ||
        lower.includes("starter") ||
        lower.includes("professional") ||
        lower.includes("enterprise");

      if (isPlan && r.ticket.clientId) {
        const cId = r.ticket.clientId;
        if (!clientPlanTickets.has(cId)) {
          clientPlanTickets.set(cId, []);
        }
        clientPlanTickets.get(cId)!.push(r);
      }
    }

    const supersededIds: number[] = [];
    for (const [, pRows] of clientPlanTickets.entries()) {
      if (pRows.length > 1) {
        // Rows are ordered by createdAt DESC, so index 0 is the newest active switch request
        for (let i = 1; i < pRows.length; i++) {
          supersededIds.push(pRows[i].ticket.id);
        }
      }
    }

    if (supersededIds.length > 0) {
      // Purge superseded plan tickets completely from database
      await db.delete(ticketsTable).where(inArray(ticketsTable.id, supersededIds)).catch(() => {});
      for (const sId of supersededIds) {
        await db.delete(chatLogsTable).where(eq(chatLogsTable.sessionId, `ticket_${sId}`)).catch(() => {});
        await db.delete(notificationsTable).where(sql`(${notificationsTable.title} LIKE '%#' || ${sId} || '%')`).catch(() => {});
      }
      logger.info({ supersededIds }, "Purged superseded plan switch tickets for admin tickets view");
    }

    const supersededSet = new Set(supersededIds);
    const validRows = rows.filter((r) => !supersededSet.has(r.ticket.id));

    res.json(
      validRows.map(({ ticket, clientName, clientUsername }) => ({
        id: ticket.id,
        clientId: ticket.clientId,
        clientName: clientName ?? "Unknown",
        clientUsername: clientUsername ?? "",
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        aiResponse: ticket.aiResponse,
        aiProvider: ticket.aiProvider,
        aiModel: ticket.aiModel,
        adminNote: ticket.adminNote,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "List admin tickets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper to sync ticket resolution or notes back into chat logs and push real-time notification
async function syncTicketSolutionToChatAndNotify(
  ticketId: number,
  status: "open" | "resolved",
  solutionText?: string | null
) {
  try {
    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId)).limit(1);
    if (!ticket) return;

    const sol = solutionText !== undefined ? solutionText : (ticket.aiResponse || ticket.adminNote);
    const isResolved = status === "resolved";
    const sessionId = `ticket_${ticket.id}`;

    const [existingLog] = await db.select().from(chatLogsTable).where(eq(chatLogsTable.sessionId, sessionId)).limit(1);

    if (existingLog) {
      await db
        .update(chatLogsTable)
        .set({
          isHandoff: !isResolved,
          isRead: isResolved,
          botResponse: sol ? `[حل المشكلة]:\n${sol}` : existingLog.botResponse,
        })
        .where(eq(chatLogsTable.id, existingLog.id));
    }

    if (isResolved && sol) {
      await db.insert(notificationsTable).values({
        userId: ticket.clientId,
        type: "ticket",
        title: `✅ [تم حل المشكلة #${ticket.id}] ${ticket.title}`,
        message: `قام الدعم الفني بحل مشكلتك: "${sol.slice(0, 120)}...". اضغط للاطلاع على التفاصيل في صندوق الوارد.`,
        isRead: false,
      }).catch(() => {});
    }
  } catch (e) {
    logger.warn({ err: e, ticketId }, "Failed to sync ticket solution to chat or notify");
  }
}

// PUT /admin/tickets/:id/resolve
router.put("/admin/tickets/:id/resolve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body as { status: "open" | "resolved" };
    if (!["open", "resolved"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    const [ticket] = await db
      .update(ticketsTable)
      .set({ status })
      .where(eq(ticketsTable.id, id))
      .returning();
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    await syncTicketSolutionToChatAndNotify(id, status);
    res.json({ ok: true, status: ticket.status });
  } catch (err) {
    logger.error({ err }, "Resolve ticket error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/tickets/:id/admin-note  — admin manually solves the ticket
router.put("/admin/tickets/:id/admin-note", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { adminNote } = req.body as { adminNote: string };
    if (!adminNote || typeof adminNote !== "string" || !adminNote.trim()) {
      res.status(400).json({ error: "adminNote is required" });
      return;
    }
    const [ticket] = await db
      .update(ticketsTable)
      .set({ adminNote: adminNote.trim(), status: "resolved" })
      .where(eq(ticketsTable.id, id))
      .returning();
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    await syncTicketSolutionToChatAndNotify(id, "resolved", adminNote.trim());
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Admin note error");
    res.status(500).json({ error: "Internal server error" });
  }
});


// ── INVOICES & BILLS MANAGEMENT ──────────────────────────────────────────

// GET /admin/invoices - Unified Bills & Invoices across subscriptions, top-ups, and quota usage
router.get("/admin/invoices", async (req, res) => {
  try {
    const ratesData = await getExchangeRates();
    const exchangeRate = ratesData.rates.EGP || 50.0;
    const currencySymbol = "EGP";

    // 1. Fetch all companies with client user info
    const companies = await db
      .select({
        company: companiesTable,
        client: usersTable,
      })
      .from(companiesTable)
      .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id));

    const companyMap = new Map<number, { company: typeof companiesTable.$inferSelect; client: typeof usersTable.$inferSelect | null }>();
    for (const c of companies) {
      companyMap.set(c.company.id, c);
    }

    // 2. Fetch all plan / topup tickets
    const allTickets = await db
      .select({
        ticket: ticketsTable,
        client: usersTable,
      })
      .from(ticketsTable)
      .leftJoin(usersTable, eq(ticketsTable.clientId, usersTable.id))
      .orderBy(desc(ticketsTable.createdAt));

    const invoiceList: any[] = [];

    // Filter and process plan tickets
    for (const item of allTickets) {
      const t = item.ticket;
      const client = item.client;
      const titleLower = (t.title || "").toLowerCase();
      const descLower = (t.description || "").toLowerCase();

      const isPlan =
        titleLower.includes("باقة") ||
        titleLower.includes("plan") ||
        titleLower.includes("شحن") ||
        titleLower.includes("topup") ||
        titleLower.includes("اشتراك") ||
        descLower.includes("معرف الباقة") ||
        descLower.includes("طلب شحن");

      if (!isPlan) continue;

      const parsed = parseTicketPlanDetails(t);
      const isTopup = parsed.isTopup;
      const matchedCompanyItem = Array.from(companyMap.values()).find((c) => c.company.clientId === t.clientId);
      const company = matchedCompanyItem?.company;

      const invoiceNumber = `INV-${new Date(t.createdAt).getFullYear()}${String(new Date(t.createdAt).getMonth() + 1).padStart(2, "0")}-${t.id}`;
      const priceUsd = isTopup
        ? (parsed.topupPack?.priceUsd || 10)
        : Math.round(parsed.billingCycle === "yearly" ? (parsed.plan?.monthlyPriceUsd || 79) * 12 * 0.8 : (parsed.plan?.monthlyPriceUsd || 79));
      const priceLocal = Math.round(priceUsd * exchangeRate);

      invoiceList.push({
        id: `ticket-${t.id}`,
        invoiceNumber,
        ticketId: t.id,
        companyId: company?.id ?? null,
        companyName: company?.name || client?.name || "شركة غير محددة",
        clientId: client?.id ?? t.clientId,
        clientName: client?.name || "العميل",
        clientEmail: client?.email || company?.notificationEmail || "",
        clientPhone: parsed.phone || company?.whatsappNumber || "",
        itemType: isTopup ? "topup" : "plan",
        titleAr: isTopup ? (parsed.topupPack ? `شحن ${parsed.topupPack.formatted} رموز` : t.title) : (parsed.plan?.nameAr || t.title),
        titleEn: isTopup ? (parsed.topupPack ? `Top-up ${parsed.topupPack.formatted}` : "Top-up Pack") : (parsed.plan?.nameEn || "Subscription Plan"),
        billingCycleAr: isTopup ? "دفعة واحدة" : (parsed.billingCycle === "yearly" ? "سنوي" : "شهري"),
        billingCycleEn: isTopup ? "One-Time" : (parsed.billingCycle === "yearly" ? "Yearly" : "Monthly"),
        tokenQuota: parsed.tokens,
        priceUsd,
        priceLocal,
        currencySymbol,
        retentionDays: parsed.retentionDays,
        channels: parsed.channels || [],
        tools: parsed.tools || [],
        status: t.status === "resolved" ? "paid" : "pending",
        issueDate: t.createdAt.toISOString(),
        notes: t.adminNote || t.aiResponse || undefined,
      });
    }

    // 3. Add monthly Quota Usage Bills for all companies with token quota
    for (const c of companies) {
      const comp = c.company;
      const client = c.client;
      if (!comp.monthlyTokenQuota && !comp.isActive) continue;

      const invoiceNumber = `INV-Q-${comp.id}-${new Date().toISOString().slice(0, 7).replace("-", "")}`;
      const quota = comp.monthlyTokenQuota || 50000;
      let estPriceUsd = 29;
      if (quota >= 1000000) estPriceUsd = 199;
      else if (quota >= 250000) estPriceUsd = 79;
      const estPriceLocal = Math.round(estPriceUsd * exchangeRate);

      invoiceList.push({
        id: `quota-${comp.id}`,
        invoiceNumber,
        ticketId: null,
        companyId: comp.id,
        companyName: comp.name,
        clientId: client?.id ?? comp.clientId,
        clientName: client?.name || comp.name,
        clientEmail: client?.email || comp.notificationEmail || "",
        clientPhone: comp.whatsappNumber || "",
        itemType: "quota_usage",
        titleAr: `كشف استهلاك حصة الرموز الشهرية (${(comp.monthlyTokenQuota || 0).toLocaleString()} رمز)`,
        titleEn: `Monthly Token Quota Usage Bill (${(comp.monthlyTokenQuota || 0).toLocaleString()} Tokens)`,
        billingCycleAr: "شهري",
        billingCycleEn: "Monthly",
        tokenQuota: comp.monthlyTokenQuota || 0,
        priceUsd: estPriceUsd,
        priceLocal: estPriceLocal,
        currencySymbol,
        periodStart: comp.quotaStartDate ? comp.quotaStartDate.toISOString() : undefined,
        periodEnd: comp.quotaEndDate ? comp.quotaEndDate.toISOString() : undefined,
        retentionDays: comp.chatLogRetentionDays,
        status: comp.isActive ? "activated" : "pending",
        issueDate: comp.quotaStartDate ? comp.quotaStartDate.toISOString() : comp.createdAt.toISOString(),
      });
    }

    // Sort by issueDate descending
    invoiceList.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());

    res.json({
      ok: true,
      invoices: invoiceList,
      totalCount: invoiceList.length,
      rates: ratesData.rates,
    });
  } catch (err: any) {
    logger.error({ err }, "Get admin invoices error");
    res.status(500).json({ error: err?.message || "Failed to fetch invoices" });
  }
});

// POST /admin/invoices/send-copy - Admin sends a copy of ANY invoice to ANY email and/or WhatsApp
router.post("/admin/invoices/send-copy", async (req, res) => {
  try {
    const {
      invoiceNumber,
      itemType,
      title,
      recipientEmail,
      recipientPhone,
      sendViaEmail,
      sendViaWhatsApp,
      customNotes,
      priceUsd,
      priceLocal,
      currencySymbol,
      clientName,
      companyName,
      tokenQuota,
      retentionDays,
      channels,
      billingCycle,
      imageDataUrl,
      htmlContent,
    } = req.body as {
      invoiceNumber: string;
      itemType?: string;
      title?: string;
      recipientEmail?: string;
      recipientPhone?: string;
      sendViaEmail?: boolean;
      sendViaWhatsApp?: boolean;
      customNotes?: string;
      priceUsd?: number;
      priceLocal?: number;
      currencySymbol?: string;
      clientName?: string;
      companyName?: string;
      tokenQuota?: number;
      retentionDays?: number | null;
      channels?: string[];
      billingCycle?: string;
      imageDataUrl?: string;
      htmlContent?: string;
    };

    if (!invoiceNumber) {
      res.status(400).json({ error: "invoiceNumber is required" });
      return;
    }

    let emailSent = false;
    let whatsappSent = false;
    let whatsappUrl = "";
    let emailError: string | null = null;

    const sym = currencySymbol || "EGP";
    const pUsd = Number(priceUsd || 0);
    const pLocal = Number(priceLocal || 0);

    // 1. Send via Email if requested
    if (sendViaEmail && recipientEmail && recipientEmail.trim()) {
      const targetEmail = recipientEmail.trim();
      const cfg = await getEmailConfig();

      if (isSmtpConfigured(cfg)) {
        try {
          const transporter = buildTransporter(cfg);

          const finalHtml = htmlContent || `
            <div dir="rtl" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:640px;margin:0 auto;background:#f8fafc;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;color:#1e293b;">
              <div style="background:linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);padding:32px 28px;color:#ffffff;text-align:center;">
                <div style="display:inline-block;padding:4px 14px;background:rgba(59,130,246,0.3);border:1px solid rgba(147,197,253,0.3);border-radius:20px;font-size:12px;font-weight:700;color:#bfdbfe;margin-bottom:10px;">
                  BOT MANAGER • INVOICE COPY / نسخة رسمية من الفاتورة
                </div>
                <h2 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">فاتورة #${escapeHtml(invoiceNumber)}</h2>
                <p style="margin:6px 0 0;font-size:13px;color:#93c5fd;">مرسلة من إدارة منصة Bot Manager</p>
              </div>

              <div style="padding:28px 24px;">
                ${
                  customNotes
                    ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;margin-bottom:20px;font-size:13px;color:#1e40af;line-height:1.6;">
                        <strong style="display:block;margin-bottom:4px;color:#1d4ed8;">ملاحظة من الإدارة:</strong>
                        ${escapeHtml(customNotes)}
                      </div>`
                    : ""
                }

                <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">
                  <table style="width:100%;font-size:13px;border-collapse:collapse;line-height:1.8;">
                    <tr>
                      <td style="color:#64748b;width:35%;">رقم الفاتورة:</td>
                      <td style="font-weight:700;color:#0f172a;">#${escapeHtml(invoiceNumber)}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;">العميل / الشركة:</td>
                      <td style="font-weight:600;color:#1e293b;">${escapeHtml(clientName || "العميل")} - ${escapeHtml(companyName || "")}</td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;">البند / الباقة:</td>
                      <td style="font-weight:700;color:#2563eb;">${escapeHtml(title || "اشتراك ذكاء اصطناعي")}</td>
                    </tr>
                    ${
                      tokenQuota
                        ? `<tr>
                            <td style="color:#64748b;">رصيد الرموز:</td>
                            <td style="font-weight:700;color:#0f172a;">${tokenQuota.toLocaleString()} Tokens</td>
                          </tr>`
                        : ""
                    }
                    <tr>
                      <td style="color:#64748b;">المبلغ الإجمالي:</td>
                      <td style="font-weight:800;font-size:16px;color:#059669;direction:ltr;text-align:right;">
                        ${pUsd} USD ${pLocal > 0 ? `(~ ${pLocal.toLocaleString()} ${escapeHtml(sym)})` : ""}
                      </td>
                    </tr>
                    <tr>
                      <td style="color:#64748b;">الحالة:</td>
                      <td style="font-weight:700;color:#16a34a;">✅ معتمدة ومسددة</td>
                    </tr>
                  </table>
                </div>

                ${
                  imageDataUrl
                    ? `<div style="text-align:center;margin:24px 0;">
                        <p style="font-size:12px;color:#64748b;margin-bottom:8px;">صورة بطاقة الفاتورة المعتمدة:</p>
                        <img src="cid:invoice-copy-image" alt="Invoice Card" style="max-width:100%;height:auto;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.06);" />
                      </div>`
                    : ""
                }

                <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">
                  تم إرسال هذه النسخة الرسمية من لوحة تحكم الإدارة.<br/>
                  شكراً لاختياركم Bot Manager لأنظمة الذكاء الاصطناعي.
                </p>
              </div>
            </div>
          `;

          const mailOptions: any = {
            from: `"Bot Manager Billing" <${cfg.smtpUser}>`,
            to: targetEmail,
            subject: `🧾 نسخة من فاتورة #${invoiceNumber} - ${title || companyName || "Bot Manager"}`,
            html: finalHtml,
          };

          if (imageDataUrl && imageDataUrl.includes(",")) {
            const base64Data = imageDataUrl.split(",")[1];
            mailOptions.attachments = [
              {
                filename: `invoice-${invoiceNumber}.png`,
                content: Buffer.from(base64Data, "base64"),
                cid: "invoice-copy-image",
              },
            ];
          }

          await transporter.sendMail(mailOptions);
          emailSent = true;

          // Log in email_logs
          await db.insert(emailLogsTable).values({
            companyId: 1,
            recipientEmail: targetEmail,
            subject: `نسخة من فاتورة #${invoiceNumber}`,
            eventType: "invoice_copy",
            status: "sent",
          }).catch(() => {});
        } catch (err: any) {
          logger.error({ err, targetEmail }, "Failed to send invoice copy email");
          emailError = err?.message || "Email send failure";
        }
      } else {
        emailError = "SMTP settings are not configured in Admin Email Settings";
      }
    }

    // 2. Prepare WhatsApp message & direct link
    const cleanPhone = normalizePhoneNumber(recipientPhone || "");
    const waText = [
      `🧾 *نسخة من فاتورة رسمية - Bot Manager*`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🔹 *رقم الفاتورة:* #${invoiceNumber}`,
      clientName ? `👤 *العميل:* ${clientName}` : null,
      companyName ? `🏢 *الشركة:* ${companyName}` : null,
      `📦 *البند / الباقة:* ${title || "اشتراك ذكاء اصطناعي"}`,
      tokenQuota ? `• *رصيد الرموز:* ${tokenQuota.toLocaleString()} Tokens` : null,
      `💰 *المبلغ:* ${pUsd} USD ${pLocal > 0 ? `(~ ${pLocal.toLocaleString()} ${sym})` : ""}`,
      `⚡ *الحالة:* ✅ *معتمدة ومسددة*`,
      customNotes ? `\n📝 *ملاحظة من الإدارة:*\n${customNotes}` : null,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `شكراً لتعاملكم معنا! لأي استفسار نحن دائماً في خدمتكم.`,
    ]
      .filter(Boolean)
      .join("\n");

    if (cleanPhone) {
      whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waText)}`;

      if (sendViaWhatsApp) {
        try {
          const adminRows = await db.select().from(adminConfigTable);
          const adminMap = new Map(adminRows.map((r) => [r.key, r.value ?? ""]));
          const sysPhoneId = adminMap.get("whatsapp_phone_number_id");
          const sysApiToken = adminMap.get("whatsapp_api_token");

          if (sysPhoneId && sysApiToken) {
            await sendWhatsAppMessage(sysPhoneId, sysApiToken, cleanPhone, waText);
            whatsappSent = true;
          }
        } catch (err: any) {
          logger.warn({ err, cleanPhone }, "Failed to dispatch WhatsApp message via Cloud API");
        }
      }
    }

    // 3. Log Admin Activity
    await logAdminActivity(
      req.session.userId!,
      "Send Invoice Copy",
      `Admin sent a copy of invoice #${invoiceNumber} to ${recipientEmail || cleanPhone || "client"}`,
      req.ip || null
    );

    res.json({
      ok: true,
      message: "Invoice copy processed successfully",
      emailSent,
      whatsappSent,
      whatsappUrl,
      emailError,
    });
  } catch (err: any) {
    logger.error({ err }, "Send invoice copy error");
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});


// POST /admin/plan-requests/:ticketId/approve - admin manually approves plan request from UI
router.post("/admin/plan-requests/:ticketId/approve", async (req, res) => {
  try {
    const ticketId = Number(req.params.ticketId);
    if (!ticketId) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }
    const adminUser = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
    const adminName = adminUser[0]?.name || "Admin";

    const result = await processApprovedPlanRequest(ticketId, {
      approvedBy: adminName,
      channel: "admin_ui",
    });

    await logAdminActivity(
      req.session.userId!,
      "Approve Plan Request",
      `Admin approved plan request #${ticketId} and dispatched invoice #${result.invoice.invoiceNumber}`,
      req.ip || null
    );

    res.json({ ok: true, result });
  } catch (err: any) {
    logger.error({ err }, "Admin manual approve plan request error");
    res.status(500).json({ error: err?.message || "Failed to process plan request" });
  }
});

// Helper for solving a ticket with AI
async function solveTicketWithAiCore(
  ticket: { id: number; title: string; description: string },
  apiKey: string,
  provider: string,
  model: string
): Promise<string> {
  const SYSTEM_PROMPT =
    "You are a professional, polite, and helpful customer support technical assistant. " +
    "Carefully analyze the customer's problem and provide a clear, structured, actionable, and friendly solution. " +
    "Always detect the language of the problem (Arabic or English) and reply in the same language. " +
    "Use step-by-step instructions and bullet points where helpful. " +
    "Keep the response well-formatted and easy to read in plain text.";

  const USER_PROMPT = `Problem Title: ${ticket.title}\n\nProblem Description:\n${ticket.description}`;

  let aiResponse = "";

  if (provider === "anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const effectiveModel = sanitizeAnthropicModel(model);
    try {
      const message = await client.messages.create({
        model: effectiveModel,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: USER_PROMPT }],
      });
      aiResponse = extractAnthropicText(message.content);
    } catch (err: any) {
      const fallbackModel = isAnthropicFreeModel(effectiveModel)
        ? (effectiveModel !== "claude-3-5-haiku-20241022" ? "claude-3-5-haiku-20241022" : null)
        : (effectiveModel !== "claude-3-5-sonnet-20241022" ? "claude-3-5-sonnet-20241022" : "claude-3-5-haiku-20241022");
      if (fallbackModel) {
        const fallbackMsg = await client.messages.create({
          model: fallbackModel,
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: USER_PROMPT }],
        });
        aiResponse = extractAnthropicText(fallbackMsg.content);
      } else {
        throw err;
      }
    }
  } else if (provider === "google") {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const effectiveModel = sanitizeGoogleModel(model);
    const gemini = genAI.getGenerativeModel({ model: effectiveModel, systemInstruction: SYSTEM_PROMPT });
    const result = await gemini.generateContent(USER_PROMPT);
    aiResponse = result.response.text();
  } else if (provider === "openrouter") {
    const openai = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: getOpenRouterHeaders(),
    });
    const effectiveModel = sanitizeOpenRouterModel(model);
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: effectiveModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_PROMPT },
        ],
        max_tokens: 800,
      });
    } catch (err: any) {
      const errMsg = err?.message || "";
      const isUnavailable = err?.status === 404 || errMsg.includes("no longer available") || errMsg.includes("no provider serves this model");
      if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
        completion = await openai.chat.completions.create({
          model: "openrouter/free",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: USER_PROMPT },
          ],
          max_tokens: 800,
        });
      } else if (isUnavailable) {
        const fallbackModel = effectiveModel.includes("anthropic") ? "anthropic/claude-sonnet-4.5" : "openrouter/free";
        completion = await openai.chat.completions.create({
          model: fallbackModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: USER_PROMPT },
          ],
          max_tokens: 800,
        });
      } else {
        throw err;
      }
    }
    aiResponse = stripThinkingTags(completion.choices[0]?.message?.content ?? "");
  } else {
    // openai (default)
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create(
      buildOpenAiChatParams(model, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT },
      ], { maxTokens: 800 })
    );
    aiResponse = completion.choices[0]?.message?.content ?? "";
  }

  return aiResponse;
}

// POST /admin/tickets/:id/ai-solve
router.post("/admin/tickets/:id/ai-solve", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const configRows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value ?? ""]));

    const apiKey   = cfg["support_ai_api_key"]  ?? "";
    const provider = cfg["support_ai_provider"] ?? "openai";
    const model    = cfg["support_ai_model"]    ?? "gpt-4o-mini";

    if (!apiKey) {
      res.status(400).json({ error: "No AI API key configured. Set it in Admin Settings > Support AI." });
      return;
    }

    const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const aiResponse = await solveTicketWithAiCore(ticket, apiKey, provider, model);

    const [updated] = await db
      .update(ticketsTable)
      .set({ aiResponse, aiProvider: provider, aiModel: model, status: "resolved" })
      .where(eq(ticketsTable.id, id))
      .returning();

    await syncTicketSolutionToChatAndNotify(id, "resolved", aiResponse);

    res.json({ ok: true, aiResponse: updated.aiResponse, provider, model });
  } catch (err: any) {
    logger.error({ err }, "AI solve ticket error");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// POST /admin/tickets/ai-solve-batch — solve multiple or all open tickets with Support AI
router.post("/admin/tickets/ai-solve-batch", async (req, res) => {
  try {
    const { ids } = (req.body || {}) as { ids?: number[] };

    const configRows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value ?? ""]));

    const apiKey   = cfg["support_ai_api_key"]  ?? "";
    const provider = cfg["support_ai_provider"] ?? "openai";
    const model    = cfg["support_ai_model"]    ?? "gpt-4o-mini";

    if (!apiKey) {
      res.status(400).json({ error: "No AI API key configured. Set it in Support AI settings." });
      return;
    }

    let ticketsToSolve: (typeof ticketsTable.$inferSelect)[] = [];
    if (Array.isArray(ids) && ids.length > 0) {
      const numericIds = ids.map(Number).filter((n) => !isNaN(n));
      ticketsToSolve = await db
        .select()
        .from(ticketsTable)
        .where(inArray(ticketsTable.id, numericIds));
    } else {
      ticketsToSolve = await db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.status, "open"));
    }

    if (ticketsToSolve.length === 0) {
      res.json({ ok: true, solvedCount: 0, message: "No open tickets to solve." });
      return;
    }

    let solvedCount = 0;
    const errors: { id: number; error: string }[] = [];

    for (const ticket of ticketsToSolve) {
      try {
        const aiResponse = await solveTicketWithAiCore(ticket, apiKey, provider, model);
        await db
          .update(ticketsTable)
          .set({ aiResponse, aiProvider: provider, aiModel: model, status: "resolved" })
          .where(eq(ticketsTable.id, ticket.id));
        await syncTicketSolutionToChatAndNotify(ticket.id, "resolved", aiResponse);
        solvedCount++;
      } catch (err: any) {
        logger.error({ err, ticketId: ticket.id }, "Batch solve error for ticket");
        errors.push({ id: ticket.id, error: err?.message ?? "Error" });
      }
    }

    res.json({
      ok: true,
      solvedCount,
      totalRequested: ticketsToSolve.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    logger.error({ err }, "AI solve batch error");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// PUT /admin/tickets/:id/solution — allows admin to edit AI response or Admin note directly
router.put("/admin/tickets/:id/solution", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { aiResponse, adminNote, status } = req.body as {
      aiResponse?: string;
      adminNote?: string;
      status?: "open" | "resolved";
    };

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (aiResponse !== undefined) updates.aiResponse = aiResponse ? aiResponse.trim() : null;
    if (adminNote !== undefined) updates.adminNote = adminNote ? adminNote.trim() : null;
    if (status !== undefined && ["open", "resolved"].includes(status)) updates.status = status;

    const [ticket] = await db
      .update(ticketsTable)
      .set(updates)
      .where(eq(ticketsTable.id, id))
      .returning();

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    await syncTicketSolutionToChatAndNotify(id, ticket.status as any, ticket.aiResponse || ticket.adminNote);

    res.json({ ok: true, ticket });
  } catch (err) {
    logger.error({ err }, "Update ticket solution error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/tickets/:id — admin permanently deletes a ticket
router.delete(["/admin/tickets/:id", "/tickets/:id"], async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(ticketsTable)
      .where(eq(ticketsTable.id, id))
      .returning();

    if (!deleted) {
      res.json({ ok: true, id, message: "Ticket already removed" });
      return;
    }

    await db.delete(chatLogsTable).where(eq(chatLogsTable.sessionId, "ticket_" + id)).catch(() => {});
    await db.delete(notificationsTable).where(sql`(${notificationsTable.title} LIKE '%#' || ${id} || '%')`).catch(() => {});

    res.json({ ok: true, id });
  } catch (err) {
    logger.error({ err }, "Delete ticket error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/support-settings
router.get("/admin/support-settings", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    const key = cfg["support_ai_api_key"] ?? "";
    const masked = maskApiKey(key);
    res.json({
      hasKey: !!key,
      maskedKey: masked,
      aiProvider: cfg["support_ai_provider"] ?? "openai",
      aiModel: cfg["support_ai_model"] ?? "gpt-4o-mini",
    });
  } catch (err) {
    logger.error({ err }, "Get support settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/support-settings
router.put("/admin/support-settings", async (req, res) => {
  try {
    const { aiApiKey, aiProvider, aiModel } = req.body as { aiApiKey?: string; aiProvider?: string; aiModel?: string };

    const upserts: { key: string; value: string }[] = [];
    if (aiApiKey && typeof aiApiKey === "string") upserts.push({ key: "support_ai_api_key", value: aiApiKey });
    if (aiProvider && typeof aiProvider === "string") upserts.push({ key: "support_ai_provider", value: aiProvider });
    if (aiModel && typeof aiModel === "string") upserts.push({ key: "support_ai_model", value: aiModel });

    if (upserts.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    for (const item of upserts) {
      await db
        .insert(adminConfigTable)
        .values(item)
        .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: item.value } });
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Update support settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/support-ai-status  â€” live ping of the configured Support AI
router.get("/admin/support-ai-status", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    const cfg      = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    const apiKey   = cfg["support_ai_api_key"]  ?? "";
    const provider = cfg["support_ai_provider"] ?? "openai";
    const model    = cfg["support_ai_model"]    ?? "gpt-4o-mini";

    if (!apiKey) {
      res.json({ status: "no_key", provider, model });
      return;
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI connection check timed out (15s limit)")), 15000)
      );

      const checkPromise = (async () => {
        if (provider === "anthropic") {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic({ apiKey });
          const effectiveModel = sanitizeAnthropicModel(model);
          try {
            await client.messages.create({ model: effectiveModel, max_tokens: 10, messages: [{ role: "user", content: "hi" }] });
          } catch (err: any) {
            if (isAnthropicFreeModel(effectiveModel) && effectiveModel !== "claude-3-5-haiku-20241022") {
              await client.messages.create({ model: "claude-3-5-haiku-20241022", max_tokens: 10, messages: [{ role: "user", content: "hi" }] });
            } else {
              throw err;
            }
          }
        } else if (provider === "google") {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI    = new GoogleGenerativeAI(apiKey);
          const effectiveModel = sanitizeGoogleModel(model);
          const genModel = genAI.getGenerativeModel({ model: effectiveModel });
          await genModel.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
        } else if (provider === "openrouter") {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({
            apiKey,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: getOpenRouterHeaders(),
          });
          const effectiveModel = sanitizeOpenRouterModel(model);
          try {
            await openai.chat.completions.create(
              buildOpenRouterChatParams(effectiveModel, [{ role: "user", content: "hi" }], { maxTokens: 10 })
            );
          } catch (err: any) {
            const errMsg = err?.message || "";
            const isUnavailable = err?.status === 404 || errMsg.includes("no longer available") || errMsg.includes("no provider serves this model");
            if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
              await openai.chat.completions.create(
                buildOpenRouterChatParams("openrouter/free", [{ role: "user", content: "hi" }], { maxTokens: 10 })
              );
            } else if (isUnavailable) {
              const fallbackModel = effectiveModel.includes("anthropic") ? "anthropic/claude-sonnet-4.5" : "openrouter/free";
              await openai.chat.completions.create(
                buildOpenRouterChatParams(fallbackModel, [{ role: "user", content: "hi" }], { maxTokens: 10 })
              );
            } else {
              throw err;
            }
          }
        } else {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({ apiKey });
          await openai.chat.completions.create(
            buildOpenAiChatParams(model, [{ role: "user", content: "hi" }], { maxTokens: 1 })
          );
        }
      })();

      await Promise.race([checkPromise, timeoutPromise]);
      res.json({ status: "ok", provider, model });
    } catch (aiErr: unknown) {
      const msg      = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isQuota  = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");
      const isAuth   = msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("invalid");
      const isCredit = msg.includes("402") || msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("balance") || msg.toLowerCase().includes("payment");
      res.json({
        status: isCredit ? "insufficient_credits" : isQuota ? "quota_exceeded" : isAuth ? "invalid_key" : "error",
        provider,
        model,
        detail: isCredit ? "رصيد OpenRouter غير كافٍ لتشغيل هذا النموذج المدفوع. يرجى شحن الرصيد في openrouter.ai/credits." : msg.slice(0, 200),
      });
    }
  } catch (err) {
    logger.error({ err }, "Support AI status check error");
    res.status(500).json({ status: "error", detail: "Internal server error" });
  }
});

// GET /admin/quota-ai-settings
router.get("/admin/quota-ai-settings", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('quota_ai_api_key', 'quota_ai_provider', 'quota_ai_model', 'support_ai_api_key')`);
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    const key = cfg["quota_ai_api_key"] || cfg["support_ai_api_key"] || "";
    const masked = maskApiKey(key);
    const provider = cfg["quota_ai_provider"] || "openai";
    const defaultModel =
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini";
    const rawModel = cfg["quota_ai_model"] || defaultModel;
    const model = provider === "openrouter" ? sanitizeOpenRouterModel(rawModel) : rawModel;

    res.json({
      hasKey: !!key,
      maskedKey: masked,
      aiProvider: provider,
      aiModel: model,
    });
  } catch (err) {
    logger.error({ err }, "Get quota AI settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/quota-ai-settings
router.put("/admin/quota-ai-settings", async (req, res) => {
  try {
    const { aiApiKey, aiProvider, aiModel } = req.body as { aiApiKey?: string; aiProvider?: string; aiModel?: string };

    const upserts: { key: string; value: string }[] = [];
    if (aiApiKey && typeof aiApiKey === "string") upserts.push({ key: "quota_ai_api_key", value: aiApiKey });
    if (aiProvider && typeof aiProvider === "string") upserts.push({ key: "quota_ai_provider", value: aiProvider });
    if (aiModel && typeof aiModel === "string") {
      const sanitizedModel = (aiProvider || "openai") === "openrouter" ? sanitizeOpenRouterModel(aiModel) : aiModel;
      upserts.push({ key: "quota_ai_model", value: sanitizedModel });
    }

    if (upserts.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    for (const item of upserts) {
      await db
        .insert(adminConfigTable)
        .values(item)
        .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: item.value } });
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Update quota AI settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/quota-ai-status — live ping of the configured Quota AI
router.get("/admin/quota-ai-status", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('quota_ai_api_key', 'quota_ai_provider', 'quota_ai_model', 'support_ai_api_key')`);
    const cfg      = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    const provider = cfg["quota_ai_provider"] || "openai";
    const defaultModel =
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini";
    const rawModel = cfg["quota_ai_model"]    || defaultModel;
    const model    = provider === "openrouter" ? sanitizeOpenRouterModel(rawModel) : rawModel;

    let apiKey = cfg["quota_ai_api_key"]?.trim();
    if (!apiKey) {
      if (provider === "openai" && process.env.OPENAI_API_KEY) apiKey = process.env.OPENAI_API_KEY;
      else if (provider === "google" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      else if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) apiKey = process.env.ANTHROPIC_API_KEY;
      else if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) apiKey = process.env.OPENROUTER_API_KEY;
      else if (cfg["support_ai_api_key"]?.trim()) apiKey = cfg["support_ai_api_key"]?.trim();
    }

    if (!apiKey) {
      res.json({ status: "no_key", provider, model });
      return;
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI connection check timed out (15s limit)")), 15000)
      );

      const checkPromise = (async () => {
        if (provider === "anthropic") {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic({ apiKey });
          const effectiveModel = sanitizeAnthropicModel(model);
          try {
            await client.messages.create({ model: effectiveModel, max_tokens: 10, messages: [{ role: "user", content: "hi" }] });
          } catch (err: any) {
            if (isAnthropicFreeModel(effectiveModel) && effectiveModel !== "claude-3-5-haiku-20241022") {
              await client.messages.create({ model: "claude-3-5-haiku-20241022", max_tokens: 10, messages: [{ role: "user", content: "hi" }] });
            } else {
              throw err;
            }
          }
        } else if (provider === "google") {
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI    = new GoogleGenerativeAI(apiKey);
          const effectiveModel = sanitizeGoogleModel(model);
          const genModel = genAI.getGenerativeModel({ model: effectiveModel });
          await genModel.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
        } else if (provider === "openrouter") {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({
            apiKey,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: getOpenRouterHeaders(),
          });
          const effectiveModel = sanitizeOpenRouterModel(model);
          try {
            await openai.chat.completions.create(
              buildOpenRouterChatParams(effectiveModel, [{ role: "user", content: "hi" }], { maxTokens: 10 })
            );
          } catch (err: any) {
            const errMsg = err?.message || "";
            const isUnavailable = err?.status === 404 || errMsg.includes("no longer available") || errMsg.includes("no provider serves this model");
            if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
              await openai.chat.completions.create(
                buildOpenRouterChatParams("openrouter/free", [{ role: "user", content: "hi" }], { maxTokens: 10 })
              );
            } else if (isUnavailable) {
              const fallbackModel = effectiveModel.includes("anthropic") ? "anthropic/claude-sonnet-4.5" : "openrouter/free";
              await openai.chat.completions.create(
                buildOpenRouterChatParams(fallbackModel, [{ role: "user", content: "hi" }], { maxTokens: 10 })
              );
            } else {
              throw err;
            }
          }
        } else {
          const OpenAI = (await import("openai")).default;
          const openai = new OpenAI({ apiKey });
          await openai.chat.completions.create(
            buildOpenAiChatParams(model, [{ role: "user", content: "hi" }], { maxTokens: 1 })
          );
        }
      })();

      await Promise.race([checkPromise, timeoutPromise]);
      res.json({ status: "ok", provider, model });
    } catch (aiErr: unknown) {
      const msg      = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isQuota  = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");
      const isAuth   = msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("invalid");
      const isCredit = msg.includes("402") || msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("balance") || msg.toLowerCase().includes("payment");
      res.json({
        status: isCredit ? "insufficient_credits" : isQuota ? "quota_exceeded" : isAuth ? "invalid_key" : "error",
        provider,
        model,
        detail: isCredit ? "رصيد OpenRouter غير كافٍ لتشغيل هذا النموذج المدفوع. يرجى شحن الرصيد في openrouter.ai/credits." : msg.slice(0, 200),
      });
    }
  } catch (err) {
    logger.error({ err }, "Quota AI status check error");
    res.status(500).json({ status: "error", detail: "Internal server error" });
  }
});

// GET /admin/email-settings
router.get("/admin/email-settings", async (req, res) => {
  try {
    const { getEmailConfig, isEmailConfigured } = await import("../lib/email");
    const cfg = await getEmailConfig();
    res.json({
      recipientEmail: cfg.recipientEmail,
      smtpHost: cfg.smtpHost,
      smtpPort: String(cfg.smtpPort || 587),
      smtpUser: cfg.smtpUser,
      smtpEncryption: cfg.smtpEncryption,
      hasPass: !!cfg.smtpPass,
      configured: isEmailConfigured(cfg),
    });
  } catch (err) {
    logger.error({ err }, "Get email settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/email-settings
router.put("/admin/email-settings", async (req, res) => {
  try {
    const { recipientEmail, smtpHost, smtpPort, smtpUser, smtpPass, smtpEncryption } = req.body as {
      recipientEmail?: string;
      smtpHost?: string;
      smtpPort?: string;
      smtpUser?: string;
      smtpPass?: string;
      smtpEncryption?: string;
    };

    const updates: Array<{ key: string; value: string }> = [];
    if (recipientEmail !== undefined) updates.push({ key: "notif_recipient_email", value: recipientEmail });
    if (smtpHost !== undefined) updates.push({ key: "notif_smtp_host", value: smtpHost });
    if (smtpPort !== undefined) updates.push({ key: "notif_smtp_port", value: smtpPort });
    if (smtpUser !== undefined) updates.push({ key: "notif_smtp_user", value: smtpUser });
    if (smtpPass) updates.push({ key: "notif_smtp_pass", value: smtpPass });
    if (smtpEncryption && ["tls", "ssl", "none"].includes(smtpEncryption))
      updates.push({ key: "notif_smtp_encryption", value: smtpEncryption });

    for (const { key, value } of updates) {
      await db
        .insert(adminConfigTable)
        .values({ key, value })
        .onConflictDoUpdate({ target: adminConfigTable.key, set: { value } });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Update email settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/email-settings/test
router.post("/admin/email-settings/test", async (req, res) => {
  try {
    const { sendTestEmail } = await import("../lib/email");
    await sendTestEmail();
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err }, "Test email error");
    res.status(400).json({ error: err?.message ?? "Failed to send test email" });
  }
});

// GET /admin/settings
router.get("/admin/settings", async (req, res) => {
  try {
    const [userWithName] = await db
      .select({ name: usersTable.name, username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));
    res.json({ name: userWithName?.name ?? "", username: userWithName?.username ?? "" });
  } catch (err) {
    logger.error({ err }, "Get admin settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/settings
router.put("/admin/settings", async (req, res) => {
  try {
    const parsed = UpdateAdminSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { currentPassword, newPassword, username, name } = parsed.data;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ error: "Current password is required to set a new password" });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        res.status(400).json({ error: "Current password is incorrect" });
        return;
      }
      const pwError = validatePassword(newPassword);
      if (pwError) {
        res.status(400).json({ error: pwError });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (name?.trim()) updates.name = name.trim();
    if (username) updates.username = username;
    if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 12);

    if (Object.keys(updates).length > 0) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, req.session.userId!));
      if (typeof updates.name === "string") req.session.name = updates.name;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Update admin settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/broadcast
router.post("/admin/broadcast", async (req, res) => {
  try {
    const { title, message, target, companyId } = req.body as {
      title?: string;
      message?: string;
      target?: "all" | "active" | "inactive" | "specific";
      companyId?: number;
    };

    if (!title?.trim() || !message?.trim()) {
      res.status(400).json({ error: "Title and message are required" });
      return;
    }

    const validTarget = ["all", "active", "inactive", "specific"].includes(target ?? "") ? target! : "all";

    if (validTarget === "specific" && !companyId) {
      res.status(400).json({ error: "Company ID is required for specific target" });
      return;
    }

    // Get companies matching the target
    let companies = await db.select({
      id: companiesTable.id,
      clientId: companiesTable.clientId,
      name: companiesTable.name,
      isActive: companiesTable.isActive,
      notificationEmail: usersTable.notificationEmail,
    }).from(companiesTable)
    .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id));

    if (validTarget === "active") companies = companies.filter((c) => c.isActive);
    else if (validTarget === "inactive") companies = companies.filter((c) => !c.isActive);
    else if (validTarget === "specific") companies = companies.filter((c) => c.id === companyId);

    if (companies.length === 0) {
      res.json({ sent: 0, message: "No matching companies found." });
      return;
    }

    // Insert one notification per client
    await db.insert(notificationsTable).values(
      companies.map((c) => ({
        userId: c.clientId,
        type: "broadcast",
        title: title.trim(),
        message: message.trim(),
        companyId: c.id,
        isRead: false,
      }))
    );

    // Send emails
    for (const c of companies) {
      if (c.notificationEmail) {
        // We shouldn't block the request, fire and forget
        sendClientNotification(c.notificationEmail, title.trim(), message.trim()).catch(e => {
          logger.error({ err: e, email: c.notificationEmail }, "Failed to send client notification email");
        });
      }
    }

    logger.info({ count: companies.length, target: validTarget }, "Broadcast sent");
    res.json({ sent: companies.length });
  } catch (err) {
    logger.error({ err }, "Admin broadcast error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/broadcast/preview
router.get("/admin/broadcast/preview", async (req, res) => {
  try {
    const target = (req.query.target as string) ?? "all";
    const companyId = req.query.companyId ? parseInt(req.query.companyId as string, 10) : undefined;

    let companies = await db.select({
      id: companiesTable.id,
      name: companiesTable.name,
      isActive: companiesTable.isActive,
    }).from(companiesTable);

    if (target === "active") companies = companies.filter((c) => c.isActive);
    else if (target === "inactive") companies = companies.filter((c) => !c.isActive);
    else if (target === "specific" && companyId) companies = companies.filter((c) => c.id === companyId);

    res.json({ count: companies.length, companies: companies.slice(0, 10) });
  } catch (err) {
    logger.error({ err }, "Broadcast preview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/companies/:id/test-ai
router.post("/admin/companies/:id/test-ai", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid company id" }); return; }

    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }

    if (!company.aiAgentApiKey) {
      res.json({ status: "no_key", message: "No AI API key configured for this company." });
      return;
    }

    const provider = company.aiProvider ?? "openai";
    const model = company.aiModel ?? (
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google"    ? "gemini-2.0-flash" :
      provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini"
    );

    const testPrompt = "Reply with exactly: 'AI is working correctly.'";

    try {
      let reply = "";

      if (provider === "google") {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(company.aiAgentApiKey);
        const effectiveModel = sanitizeGoogleModel(model);
        const genModel = genAI.getGenerativeModel({ model: effectiveModel });
        const result = await genModel.generateContent({ contents: [{ role: "user", parts: [{ text: testPrompt }] }] });
        reply = result.response.text();
      } else if (provider === "anthropic") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: company.aiAgentApiKey });
        const effectiveModel = sanitizeAnthropicModel(model);
        let msg;
        try {
          msg = await client.messages.create({ model: effectiveModel, max_tokens: 64, messages: [{ role: "user", content: testPrompt }] });
        } catch (err: any) {
          if (isAnthropicFreeModel(effectiveModel) && effectiveModel !== "claude-3-5-haiku-20241022") {
            msg = await client.messages.create({ model: "claude-3-5-haiku-20241022", max_tokens: 64, messages: [{ role: "user", content: testPrompt }] });
          } else {
            throw err;
          }
        }
        reply = extractAnthropicText(msg?.content);
      } else if (provider === "openrouter") {
        const OpenAI = (await import("openai")).default;
        const openrouter = new OpenAI({
          apiKey: company.aiAgentApiKey,
          baseURL: "https://openrouter.ai/api/v1",
          defaultHeaders: getOpenRouterHeaders(),
        });
        const effectiveModel = sanitizeOpenRouterModel(model);
        let completion;
        try {
          completion = await openrouter.chat.completions.create(
            buildOpenRouterChatParams(effectiveModel, [{ role: "user", content: testPrompt }], { maxTokens: 64 })
          );
        } catch (err: any) {
          const errMsg = err?.message || "";
          const isUnavailable = err?.status === 404 || errMsg.includes("no longer available") || errMsg.includes("no provider serves this model");
          if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
            completion = await openrouter.chat.completions.create(
              buildOpenRouterChatParams("openrouter/free", [{ role: "user", content: testPrompt }], { maxTokens: 64 })
            );
          } else if (isUnavailable) {
            logger.warn({ effectiveModel, err: errMsg }, "OpenRouter model unavailable in test-all; retrying with fallback active model");
            const fallbackModel = effectiveModel.includes("anthropic")
              ? "anthropic/claude-sonnet-4.5"
              : effectiveModel.includes("gemini")
              ? "google/gemini-2.5-pro"
              : "openrouter/free";
            try {
              completion = await openrouter.chat.completions.create({
                model: fallbackModel,
                messages: [{ role: "user", content: testPrompt }],
                max_tokens: 64,
              });
            } catch {
              throw err;
            }
          } else {
            throw err;
          }
        }
        reply = stripThinkingTags(completion.choices[0]?.message?.content ?? "");
      } else {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: company.aiAgentApiKey });
        const completion = await openai.chat.completions.create(
          buildOpenAiChatParams(model, [{ role: "user", content: testPrompt }], { maxTokens: 64 })
        );
        reply = completion.choices[0]?.message?.content ?? "";
      }

      res.json({ status: "ok", provider, model, reply });
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isQuota = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");
      const isAuth  = msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("invalid");
      res.json({
        status: isQuota ? "quota_exceeded" : isAuth ? "invalid_key" : "error",
        provider, model,
        message: msg.slice(0, 300),
      });
    }
  } catch (err) {
    logger.error({ err }, "Admin test-ai error");
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// GET /admin/notifications
router.get("/admin/notifications", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
    const items = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, req.session.userId!))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);

    // Deduplicate plan switch notifications: for any client/company with multiple switch notifications,
    // only the latest one is forwarded/kept, older ones are deleted.
    const seenPlanKeys = new Set<string>();
    const supersededNotifIds: number[] = [];
    const validItems: typeof items = [];

    for (const n of items) {
      const title = n.title || "";
      const lower = title.toLowerCase();
      const isPlanNotif =
        n.type === "plan_request" ||
        n.type.includes("plan") ||
        title.includes("طلب تغيير / ترقية باقة") ||
        title.includes("طلب تغيير باقة") ||
        title.includes("طلب باقة") ||
        lower.includes("plan");

      if (isPlanNotif) {
        // Group by companyId if present, or company/client name extracted from title
        const key = n.companyId
          ? `company_${n.companyId}`
          : title.replace(/#\d+/, "").trim();

        if (seenPlanKeys.has(key)) {
          supersededNotifIds.push(n.id);
          continue;
        }
        seenPlanKeys.add(key);
      }
      validItems.push(n);
    }

    if (supersededNotifIds.length > 0) {
      await db.delete(notificationsTable).where(inArray(notificationsTable.id, supersededNotifIds)).catch(() => {});
      logger.info({ supersededNotifIds }, "Purged superseded plan switch notifications for admin view");
    }

    res.json(validItems.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      companyId: n.companyId ?? null,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Get admin notifications error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// â”€â”€ AI Model Tester â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /admin/ai-test â€” fire a test message at any provider/model
router.post("/admin/ai-test", async (req, res) => {
  try {
    const { provider, model, apiKey: customKey, message } = req.body as {
      provider: string; model: string; apiKey?: string; message?: string;
    };
    if (!provider || !model) {
      res.status(400).json({ error: "provider and model are required" });
      return;
    }
    const testMessage = message?.trim() || "Hello! Please respond with one short sentence.";

    // Resolve key: custom input > saved test key for this provider
    let apiKey = customKey?.trim() ?? "";
    if (!apiKey) {
      const rows = await db.select().from(adminConfigTable)
        .where(eq(adminConfigTable.key, `ai_test_key_${provider}`));
      apiKey = rows[0]?.value ?? "";
    }
    if (!apiKey) {
      res.status(400).json({ error: "No API key. Enter one above or save it for this provider." });
      return;
    }

    const SYSTEM = "You are a helpful assistant. Reply in one short sentence.";
    const start = Date.now();
    let response = "";

    if (provider === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });
      const effectiveModel = sanitizeAnthropicModel(model);
      let msg;
      try {
        msg = await client.messages.create({
          model: effectiveModel, max_tokens: 100, system: SYSTEM,
          messages: [{ role: "user", content: testMessage }],
        });
      } catch (err: any) {
        if (isAnthropicFreeModel(effectiveModel) && effectiveModel !== "claude-3-5-haiku-20241022") {
          msg = await client.messages.create({
            model: "claude-3-5-haiku-20241022", max_tokens: 100, system: SYSTEM,
            messages: [{ role: "user", content: testMessage }],
          });
        } else {
          throw err;
        }
      }
      response = extractAnthropicText(msg?.content);
    } else if (provider === "google") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const effectiveModel = sanitizeGoogleModel(model);
      const genModel = genAI.getGenerativeModel({ model: effectiveModel, systemInstruction: SYSTEM });
      const result = await genModel.generateContent(testMessage);
      response = result.response.text();
    } else if (provider === "openrouter") {
      const openai = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: getOpenRouterHeaders(),
      });
      const effectiveModel = sanitizeOpenRouterModel(model);
      let completion;
      try {
        const chatParams = buildOpenRouterChatParams(
          effectiveModel,
          [{ role: "system", content: SYSTEM }, { role: "user", content: testMessage }],
          { maxTokens: 800 }
        );
        completion = await openai.chat.completions.create(chatParams);
      } catch (err: any) {
        const errMsg = err?.message || "";
        const isUnavailable =
          err?.status === 404 ||
          err?.status === 400 ||
          errMsg.includes("no longer available") ||
          errMsg.includes("no provider serves this model") ||
          errMsg.includes("Provider returned error") ||
          errMsg.includes("not a valid model ID");

        if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
          const fallbackParams = buildOpenRouterChatParams(
            "openrouter/free",
            [{ role: "system", content: SYSTEM }, { role: "user", content: testMessage }],
            { maxTokens: 800 }
          );
          completion = await openai.chat.completions.create(fallbackParams);
        } else if (isUnavailable) {
          logger.warn({ effectiveModel, err: errMsg }, "OpenRouter model unavailable in test-model; retrying with fallback active model");
          const fallbackModel = effectiveModel.includes("anthropic")
            ? "anthropic/claude-sonnet-4.5"
            : effectiveModel.includes("gemini")
            ? "google/gemini-2.5-pro"
            : effectiveModel.includes("deepseek")
            ? "deepseek/deepseek-chat"
            : effectiveModel.includes("openai")
            ? "openai/gpt-4o-mini"
            : "openrouter/free";
          try {
            const fallbackParams = buildOpenRouterChatParams(
              fallbackModel,
              [{ role: "system", content: SYSTEM }, { role: "user", content: testMessage }],
              { maxTokens: 800 }
            );
            completion = await openai.chat.completions.create(fallbackParams);
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }
      response = stripThinkingTags(completion.choices[0]?.message?.content ?? "");
    } else {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create(
        buildOpenAiChatParams(model, [
          { role: "system", content: SYSTEM },
          { role: "user", content: testMessage }
        ], { maxTokens: 100 })
      );
      response = completion.choices[0]?.message?.content ?? "";
    }

    res.json({ ok: true, response, provider, model, latencyMs: Date.now() - start });
  } catch (err: any) {
    logger.error({ err }, "AI test error");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// GET /admin/ai-keys â€” masked per-provider saved keys
router.get("/admin/ai-keys", async (req, res) => {
  try {
    const providers = ["openai", "anthropic", "google", "openrouter"];
    const rows = await db.select().from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('ai_test_key_openai','ai_test_key_anthropic','ai_test_key_google','ai_test_key_openrouter')`);
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    const result: Record<string, { hasKey: boolean; maskedKey: string }> = {};
    for (const p of providers) {
      const key = cfg[`ai_test_key_${p}`] ?? "";
      const masked = maskApiKey(key);
      result[p] = { hasKey: !!key, maskedKey: masked };
    }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Get AI keys error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/ai-keys â€” save a per-provider key
router.put("/admin/ai-keys", async (req, res) => {
  try {
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };
    if (!provider || !apiKey?.trim()) {
      res.status(400).json({ error: "provider and apiKey are required" });
      return;
    }
    await db.insert(adminConfigTable)
      .values({ key: `ai_test_key_${provider}`, value: apiKey.trim() })
      .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: apiKey.trim() } });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Save AI key error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/notifications/mark-read
router.patch("/admin/notifications/mark-read", async (req, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.userId, req.session.userId!), eq(notificationsTable.isRead, false)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Mark admin notifications read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/notifications/:id/read
router.patch("/admin/notifications/:id/read", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.session.userId!)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Mark single admin notification read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/notifications/:id
router.delete("/admin/notifications/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    await db
      .delete(notificationsTable)
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.session.userId!)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Delete admin notification error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/notifications
router.delete("/admin/notifications", async (req, res) => {
  try {
    await db
      .delete(notificationsTable)
      .where(eq(notificationsTable.userId, req.session.userId!));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Clear admin notifications error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/telegram-webhook â€” return platform Telegram webhook base URL
router.get("/admin/telegram-webhook", async (req, res) => {
  try {
    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    const host = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
    const webhookUrl = `${proto}://${host}/api/telegram/webhook`;
    res.json({ webhookUrl });
  } catch (err) {
    logger.error({ err }, "Get telegram webhook config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/whatsapp-webhook â€” return stored platform verify token + webhook URL
router.get("/admin/whatsapp-webhook", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "whatsapp_verify_token"));

    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    const host = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
    const webhookUrl = `${proto}://${host}/api/whatsapp/webhook`;

    res.json({
      webhookUrl,
      verifyToken: row?.value ?? null,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Get whatsapp webhook config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/security/2fa
router.get("/admin/security/2fa", async (req, res) => {
  try {
    const userId = req.session.userId!;
    const isEnabled = !!getTotpSecret(userId);
    res.json({ isEnabled });
  } catch (err) {
    logger.error({ err }, "Get 2FA status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/security/2fa/generate
router.post("/admin/security/2fa/generate", async (req, res) => {
  try {
    const userId = req.session.userId!;
    if (getTotpSecret(userId)) {
      res.status(400).json({ error: "2FA is already enabled" });
      return;
    }
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(req.session.name || "Admin", "Bot Manager", secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    
    res.json({ secret, qrCodeDataUrl });
  } catch (err) {
    logger.error({ err }, "Generate 2FA error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/security/2fa/enable
router.post("/admin/security/2fa/enable", async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { secret, code } = req.body;
    if (!secret || !code) {
      res.status(400).json({ error: "Secret and code are required" });
      return;
    }
    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }
    setTotpSecret(userId, secret);
    await logAdminActivity(userId, "2FA Enabled", "Two-factor authentication was enabled", req.ip || null);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Enable 2FA error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/security/2fa/disable
router.post("/admin/security/2fa/disable", async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: "Password is required" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    removeTotpSecret(userId);
    await logAdminActivity(userId, "2FA Disabled", "Two-factor authentication was disabled", req.ip || null);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Disable 2FA error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/security/jwt-secret â€” return masked JWT secret + last rotated timestamp
router.get("/admin/security/jwt-secret", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "jwt_secret"));

    if (!row?.value) {
      res.json({ exists: false, maskedSecret: null, lastRotated: null });
      return;
    }

    const v = row.value;
    const maskedSecret = v.slice(0, 6) + "•".repeat(Math.min(Math.max(0, v.length - 10), 16)) + v.slice(-4);
    res.json({ exists: true, maskedSecret, lastRotated: row.updatedAt?.toISOString() ?? null });
  } catch (err) {
    logger.error({ err }, "Get JWT secret error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/security/jwt-secret/rotate â€” generate a new JWT secret and persist it
router.post("/admin/security/jwt-secret/rotate", async (req, res) => {
  try {
    const { randomBytes } = await import("crypto");
    const secret = randomBytes(48).toString("hex"); // 96-char hex

    await db
      .insert(adminConfigTable)
      .values({ key: "jwt_secret", value: secret })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: secret },
      });

    const maskedSecret = secret.slice(0, 6) + "•".repeat(Math.min(Math.max(0, secret.length - 10), 16)) + secret.slice(-4);
    res.json({ success: true, maskedSecret, lastRotated: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, "Rotate JWT secret error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/whatsapp-webhook/generate â€” generate & persist a new WhatsApp verify token
router.post("/admin/whatsapp-webhook/generate", async (req, res) => {
  try {
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");

    await db
      .insert(adminConfigTable)
      .values({ key: "whatsapp_verify_token", value: token })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: token },
      });

    res.json({ verifyToken: token });
  } catch (err) {
    logger.error({ err }, "Generate whatsapp verify token error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/messenger-webhook â€” return stored platform verify token + webhook URL
router.get("/admin/messenger-webhook", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "messenger_verify_token"));

    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    const host = req.headers["x-forwarded-host"] ?? req.get("host") ?? "";
    const webhookUrl = `${proto}://${host}/api/messenger/webhook`;

    res.json({
      webhookUrl,
      verifyToken: row?.value ?? null,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Get messenger webhook config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/messenger-webhook/generate â€” generate & persist a new verify token
router.post("/admin/messenger-webhook/generate", async (req, res) => {
  try {
    const { randomBytes } = await import("crypto");
    const token = randomBytes(32).toString("hex");

    await db
      .insert(adminConfigTable)
      .values({ key: "messenger_verify_token", value: token })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: token },
      });

    res.json({ verifyToken: token });
  } catch (err) {
    logger.error({ err }, "Generate messenger verify token error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/meta-app-secret — return whether Meta App Secret is configured and masked preview
router.get("/admin/meta-app-secret", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "meta_app_secret"))
      .limit(1);

    const envSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.MESSENGER_APP_SECRET;
    const isConfigured = !!(row?.value || envSecret);
    const secret = row?.value || envSecret || "";

    const maskedSecret = secret
      ? (secret.length > 6 ? "•".repeat(Math.min(secret.length - 4, 16)) + secret.slice(-4) : "••••••")
      : null;

    res.json({
      configured: isConfigured,
      source: row?.value ? "database" : (envSecret ? "environment" : "none"),
      maskedSecret,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Get meta app secret config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/meta-app-secret — save Meta App Secret
router.post("/admin/meta-app-secret", async (req, res) => {
  try {
    const { appSecret } = req.body;
    if (typeof appSecret !== "string" || !appSecret.trim()) {
      res.status(400).json({ error: "Meta App Secret is required" });
      return;
    }

    const trimmed = appSecret.trim();
    await db
      .insert(adminConfigTable)
      .values({ key: "meta_app_secret", value: trimmed })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: trimmed },
      });

    clearMetaAppSecretCache();
    await logAdminActivity(
      req.session.userId!,
      "Meta App Secret Updated",
      "Updated cryptographic Meta App Secret for WhatsApp/Messenger webhook verification",
      req.ip || null
    );

    res.json({ success: true, message: "Meta App Secret saved successfully" });
  } catch (err) {
    logger.error({ err }, "Save meta app secret config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/meta-app-secret — remove Meta App Secret
router.delete("/admin/meta-app-secret", async (req, res) => {
  try {
    await db
      .delete(adminConfigTable)
      .where(eq(adminConfigTable.key, "meta_app_secret"));

    clearMetaAppSecretCache();
    await logAdminActivity(
      req.session.userId!,
      "Meta App Secret Removed",
      "Removed Meta App Secret",
      req.ip || null
    );

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Delete meta app secret error");
    res.status(500).json({ error: "Internal server error" });
  }
});



// GET /admin/audit-logs
router.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  try {
    const logs = await db
      .select()
      .from(adminActivityLogsTable)
      .orderBy(desc(adminActivityLogsTable.createdAt))
      .limit(100);

    res.json(logs);
  } catch (err) {
    logger.error({ err }, "Get audit logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /admin/audit-logs/:id
router.delete("/admin/audit-logs/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const deleted = await db
      .delete(adminActivityLogsTable)
      .where(eq(adminActivityLogsTable.id, id))
      .returning({ id: adminActivityLogsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Audit log not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Delete audit log error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// â”€â”€ Malfunctions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/admin/malfunctions", async (req, res) => {
  try {
    const list = await db.select({
      id: malfunctionsTable.id,
      title: malfunctionsTable.title,
      description: malfunctionsTable.description,
      source: malfunctionsTable.source,
      isActive: malfunctionsTable.isActive,
      aiAnalysis: malfunctionsTable.aiAnalysis,
      aiProvider: malfunctionsTable.aiProvider,
      aiModel: malfunctionsTable.aiModel,
      createdAt: malfunctionsTable.createdAt,
      resolvedAt: malfunctionsTable.resolvedAt,
      companyName: companiesTable.name
    })
    .from(malfunctionsTable)
    .leftJoin(companiesTable, eq(malfunctionsTable.companyId, companiesTable.id))
    .orderBy(desc(malfunctionsTable.createdAt));
    res.json(list);
  } catch (err) {
    logger.error({ err }, "Failed to fetch malfunctions");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/admin/malfunctions", async (req, res) => {
  try {
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title || !description) {
      res.status(400).json({ error: "Missing title or description" });
      return;
    }
    const result = await db.insert(malfunctionsTable).values({
      title,
      description,
      source: "admin",
      isActive: true,
    }).returning();

    // Trigger notification icon alert + email notification
    sendMalfunctionNotification({
      id: result[0].id,
      title,
      description,
      source: "admin",
    }).catch((err) => logger.error({ err }, "Failed to send malfunction notification"));

    res.json(result[0]);
  } catch (err) {
    logger.error({ err }, "Failed to create malfunction");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.patch("/admin/malfunctions/:id/resolve", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const result = await db.update(malfunctionsTable)
      .set({ isActive: false, resolvedAt: new Date() })
      .where(eq(malfunctionsTable.id, id))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result[0]);
  } catch (err) {
    logger.error({ err }, "Failed to resolve malfunction");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/admin/malfunctions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const result = await db.delete(malfunctionsTable)
      .where(eq(malfunctionsTable.id, id))
      .returning();
    if (result.length === 0) {
      res.status(404).json({ error: "Malfunction not found" });
      return;
    }
    res.json({ success: true, deleted: result[0] });
  } catch (err) {
    logger.error({ err }, "Failed to delete malfunction");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── Malfunctions AI Integration (Google Gemini & OpenAI) ───────────────────────

// GET /admin/malfunctions/ai-config
router.get("/admin/malfunctions/ai-config", async (_req, res) => {
  try {
    const configRows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('malfunctions_ai_provider', 'malfunctions_ai_api_key', 'malfunctions_ai_model', 'support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value ?? ""]));

    const provider = (cfg["malfunctions_ai_provider"] as "google" | "openai") || (cfg["support_ai_provider"] === "openai" ? "openai" : "google");
    const directKey = cfg["malfunctions_ai_api_key"] || "";
    
    let fallbackKey = "";
    if (provider === "openai") {
      fallbackKey = (cfg["support_ai_provider"] === "openai" ? cfg["support_ai_api_key"] : "") || process.env.OPENAI_API_KEY || "";
    } else {
      fallbackKey = (cfg["support_ai_provider"] === "google" ? cfg["support_ai_api_key"] : "") || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    }

    const activeKey = directKey || fallbackKey;
    const defaultModel = provider === "openai" ? "gpt-4o" : "gemini-1.5-pro";
    const model = cfg["malfunctions_ai_model"] || defaultModel;

    res.json({
      provider,
      hasKey: Boolean(activeKey),
      maskedKey: activeKey ? maskApiKey(activeKey) : "",
      model,
      isInherited: !directKey && Boolean(fallbackKey),
    });
  } catch (err) {
    logger.error({ err }, "Failed to get malfunctions AI config");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/malfunctions/ai-config
router.post("/admin/malfunctions/ai-config", async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body as { provider?: "google" | "openai"; apiKey?: string; model?: string };
    const updates: Array<{ key: string; value: string }> = [];

    if (provider && (provider === "google" || provider === "openai")) {
      updates.push({ key: "malfunctions_ai_provider", value: provider });
    }
    if (apiKey !== undefined && apiKey !== "") {
      updates.push({ key: "malfunctions_ai_api_key", value: apiKey.trim() });
    }
    if (model && typeof model === "string") {
      updates.push({ key: "malfunctions_ai_model", value: model.trim() });
    }

    for (const u of updates) {
      const [existing] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, u.key));
      if (existing) {
        await db.update(adminConfigTable).set({ value: u.value }).where(eq(adminConfigTable.key, u.key));
      } else {
        await db.insert(adminConfigTable).values(u);
      }
    }

    await logAdminActivity(req.session.userId!, "Updated Malfunctions AI Config", `Provider: ${provider || "default"}, Model: ${model || "default"}`, req.ip || null);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to save malfunctions AI config");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST /admin/malfunctions/ai-test
router.post("/admin/malfunctions/ai-test", async (req, res) => {
  try {
    const { provider = "google", apiKey: customKey, model: customModel } = req.body as {
      provider?: "google" | "openai";
      apiKey?: string;
      model?: string;
    };

    let key = customKey?.trim();
    if (!key) {
      const configRows = await db
        .select()
        .from(adminConfigTable)
        .where(sql`${adminConfigTable.key} IN ('malfunctions_ai_provider', 'malfunctions_ai_api_key', 'support_ai_api_key', 'support_ai_provider')`);
      const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value ?? ""]));

      if (provider === "openai") {
        key = cfg["malfunctions_ai_api_key"] || (cfg["support_ai_provider"] === "openai" ? cfg["support_ai_api_key"] : "") || process.env.OPENAI_API_KEY || "";
      } else {
        key = cfg["malfunctions_ai_api_key"] || (cfg["support_ai_provider"] === "google" ? cfg["support_ai_api_key"] : "") || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
      }
    }

    if (!key) {
      res.status(400).json({ error: `لم يتم العثور على مفتاح ${provider === "openai" ? "OpenAI" : "Gemini"} API Key. يرجى إدخال المفتاح أولاً.` });
      return;
    }

    let responseText = "";

    if (provider === "openai") {
      const selectedModel = sanitizeOpenAiModel(customModel || "gpt-4o-mini");
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: key });
      const comp = await openai.chat.completions.create(
        buildOpenAiChatParams(selectedModel, [
          { role: "user", content: "مرحباً! يرجى الرد بجملة واحدة قصيرة تؤكد أن اتصال OpenAI يعمل بنجاح." }
        ], { maxTokens: 100 })
      );
      responseText = comp.choices[0]?.message?.content || "OpenAI Connected successfully";
    } else {
      const selectedModel = sanitizeGoogleModel(customModel || "gemini-2.0-flash");
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(key);
      const gemini = genAI.getGenerativeModel({ model: selectedModel });
      const result = await gemini.generateContent("مرحباً! يرجى الرد بجملة واحدة قصيرة تؤكد أن اتصال Gemini Pro يعمل بنجاح.");
      responseText = result.response.text();
    }

    res.json({ ok: true, response: responseText });
  } catch (err: any) {
    logger.error({ err }, "AI test connection failed");
    res.status(400).json({ error: err.message || "فشل الاتصال بالذكاء الاصطناعي. تأكد من صحة المفتاح." });
  }
});

// POST /admin/malfunctions/:id/ai-analyze
router.post("/admin/malfunctions/:id/ai-analyze", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid malfunction ID" });
      return;
    }

    const [malfunction] = await db
      .select({
        id: malfunctionsTable.id,
        title: malfunctionsTable.title,
        description: malfunctionsTable.description,
        source: malfunctionsTable.source,
        createdAt: malfunctionsTable.createdAt,
        companyName: companiesTable.name,
      })
      .from(malfunctionsTable)
      .leftJoin(companiesTable, eq(malfunctionsTable.companyId, companiesTable.id))
      .where(eq(malfunctionsTable.id, id))
      .limit(1);

    if (!malfunction) {
      res.status(404).json({ error: "Malfunction not found" });
      return;
    }

    // Resolve Support AI credentials and provider (unified with Customer Problems Support AI)
    const configRows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('support_ai_api_key', 'support_ai_provider', 'support_ai_model', 'malfunctions_ai_api_key', 'malfunctions_ai_provider', 'malfunctions_ai_model')`);
    const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value ?? ""]));

    const provider = cfg["support_ai_provider"] || cfg["malfunctions_ai_provider"] || "openai";

    let apiKey = cfg["support_ai_api_key"] || cfg["malfunctions_ai_api_key"] || "";
    if (!apiKey) {
      if (provider === "openai" && process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY;
      } else if (provider === "google" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
        apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
      } else if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        apiKey = process.env.ANTHROPIC_API_KEY;
      } else if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
        apiKey = process.env.OPENROUTER_API_KEY;
      }
    }

    const defaultModel =
      provider === "google"
        ? "gemini-1.5-pro"
        : provider === "anthropic"
        ? "claude-3-5-sonnet-20241022"
        : provider === "openrouter"
        ? "openrouter/free"
        : "gpt-4o-mini";
    const model = cfg["support_ai_model"] || cfg["malfunctions_ai_model"] || defaultModel;

    if (!apiKey) {
      res.status(400).json({
        error: "لم يتم ربط مفتاح الـ API لوكيل الدعم الذكي (Support AI). يرجى ضبطه من قسم Support AI في أسفل الصفحة أو من صفحة Customer Problems.",
      });
      return;
    }

    const SYSTEM_INSTRUCTION = `أنت مهندس دعم فني أول وخبير موثوقية النظم (Senior Site Reliability Engineer & AI Systems Architect) لمنصة إدارة البوتات الذكية Bot Manager.
مهمتك: تحليل بلاغ العطل أو المشكلة الفنية بعناية فائقة، وتقديم تشخيص مهني دقيق وخطوات حل عملية.

قم بصياغة الإجابة باللغة العربية بطريقة منظمة جداً باستخدام Markdown بالشكل التالي:

### 🔍 1. تشخيص السبب المحتمل (Root Cause Analysis)
- تحليل منطقي لسبب حدوث العطل بناءً على الأنظمة ذات الصلة (مثل: صلاحيات مفاتيح API، ويب هوك المنصات، قيود الخوادم، انتهاء التوكنات، أو أخطاء الشبكة).

### 🛠️ 2. خطوات الإصلاح والحل المقترح (Actionable Steps)
1. الخطوة الأولى المحددة.
2. الخطوة الثانية المحددة.
3. الخطوة الثالثة للتأكد من زوال العطل.

### 💬 3. صيغة رسالة موجهة للعملاء (Client Communication)
(صيغة مهنية ومطمئنة باللغة العربية يمكن للمسؤول نسخها مباشرة وإرسالها للعميل المتأثر لإشعاره بأنه جاري التعامل مع المشكلة أو تم علاجها).`;

    const USER_PROMPT = `عنوان العطل: ${malfunction.title}
وصف وتفاصيل العطل:
${malfunction.description}

مصدر البلاغ: ${malfunction.source === "client" ? "عميل" : malfunction.source === "system" ? "نظام آلي" : "مسؤول النظام"}
الجهة / الشركة المتأثرة: ${malfunction.companyName || "النظام العام (جميع الشركات)"}
تاريخ وتوقيت الحدوث: ${new Date(malfunction.createdAt).toLocaleString("ar-EG")}`;

    let aiAnalysis = "";

    if (provider === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });
      const effectiveModel = sanitizeAnthropicModel(model);
      const message = await client.messages.create({
        model: effectiveModel,
        max_tokens: 1500,
        system: SYSTEM_INSTRUCTION,
        messages: [{ role: "user", content: USER_PROMPT }],
      });
      aiAnalysis = extractAnthropicText(message.content);
    } else if (provider === "google") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const effectiveModel = sanitizeGoogleModel(model);
      const gemini = genAI.getGenerativeModel({
        model: effectiveModel,
        systemInstruction: SYSTEM_INSTRUCTION,
      });
      const result = await gemini.generateContent(USER_PROMPT);
      aiAnalysis = result.response.text();
    } else if (provider === "openrouter") {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: getOpenRouterHeaders(),
      });
      const effectiveModel = sanitizeOpenRouterModel(model);
      const completion = await openai.chat.completions.create({
        model: effectiveModel,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: USER_PROMPT },
        ],
        max_tokens: 1500,
      });
      aiAnalysis = stripThinkingTags(completion.choices[0]?.message?.content ?? "");
    } else {
      // openai (default)
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });
      const comp = await openai.chat.completions.create(
        buildOpenAiChatParams(model, [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: USER_PROMPT },
        ], { maxTokens: 1500 })
      );
      aiAnalysis = comp.choices[0]?.message?.content || "";
    }

    // Save to database
    await db
      .update(malfunctionsTable)
      .set({
        aiAnalysis,
        aiProvider: provider,
        aiModel: model,
      })
      .where(eq(malfunctionsTable.id, id));

    await logAdminActivity(req.session.userId!, "AI Malfunction Diagnosis", `Diagnosed malfunction #${id} using ${provider} (${model})`, req.ip || null);

    res.json({
      ok: true,
      aiAnalysis,
      aiProvider: provider,
      aiModel: model,
    });
  } catch (err: any) {
    logger.error({ err }, "Malfunction AI analysis error");
    res.status(500).json({ error: err.message || "Failed to analyze malfunction with AI" });
  }
});

// ── Packages & Plans Management ──────────────────────────────────────────────
async function handleGetPackages(req: any, res: any) {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "packages_catalog"));

    if (!row || !row.value) {
      res.json(DEFAULT_PACKAGES_CATALOG);
      return;
    }

    try {
      const parsed = JSON.parse(row.value);
      res.json({
        packages: Array.isArray(parsed.packages) ? parsed.packages : DEFAULT_PACKAGES_CATALOG.packages,
        topupPacks: Array.isArray(parsed.topupPacks) ? parsed.topupPacks : DEFAULT_PACKAGES_CATALOG.topupPacks,
        updatedAt: row.updatedAt?.toISOString() || new Date().toISOString(),
      });
    } catch {
      res.json(DEFAULT_PACKAGES_CATALOG);
    }
  } catch (err: any) {
    logger.error({ err }, "Get admin packages error");
    res.status(500).json({ error: "Failed to load packages catalog" });
  }
}

async function handleUpdatePackages(req: any, res: any) {
  try {
    const { packages, topupPacks } = req.body as {
      packages?: PackageItem[];
      topupPacks?: TopupPackItem[];
    };

    if (!Array.isArray(packages)) {
      res.status(400).json({ error: "Packages list must be an array" });
      return;
    }

    const cleanedPackages: PackageItem[] = packages.map((p, index) => ({
      id: p.id ? String(p.id).trim() : `plan-${index + 1}`,
      nameAr: String(p.nameAr || "").trim() || "باقة جديدة",
      nameEn: String(p.nameEn || "").trim() || "New Plan",
      descriptionAr: String(p.descriptionAr || "").trim(),
      descriptionEn: String(p.descriptionEn || "").trim(),
      monthlyPriceUsd: Number(p.monthlyPriceUsd) >= 0 ? Number(p.monthlyPriceUsd) : 0,
      tokensMonthly: Number(p.tokensMonthly) >= 0 ? Number(p.tokensMonthly) : 0,
      tokensFormatted: p.tokensFormatted || Number(p.tokensMonthly || 0).toLocaleString(),
      popular: Boolean(p.popular),
      color: p.color || "#2D5BE3",
      badgeAr: p.badgeAr ? String(p.badgeAr).trim() : undefined,
      badgeEn: p.badgeEn ? String(p.badgeEn).trim() : undefined,
      featuresAr: Array.isArray(p.featuresAr) ? p.featuresAr.filter(Boolean) : [],
      featuresEn: Array.isArray(p.featuresEn) ? p.featuresEn.filter(Boolean) : [],
      allowedPages: Array.isArray((p as any).allowedPages) ? (p as any).allowedPages : undefined,
      retentionDays: (p as any).retentionDays !== undefined ? ((p as any).retentionDays === null || (p as any).retentionDays === 0 ? 0 : Number((p as any).retentionDays)) : undefined,
      channels: Array.isArray((p as any).channels) ? (p as any).channels : undefined,
      tools: Array.isArray((p as any).tools) ? (p as any).tools : undefined,
      dataSources: Array.isArray((p as any).dataSources) ? (p as any).dataSources : undefined,
      isActive: p.isActive !== false,
      sortOrder: Number(p.sortOrder) || index + 1,
    }));

    const cleanedTopups: TopupPackItem[] = Array.isArray(topupPacks)
      ? topupPacks.map((tp, idx) => ({
          id: tp.id ? String(tp.id).trim() : `topup-${idx + 1}`,
          tokens: Number(tp.tokens) >= 0 ? Number(tp.tokens) : 10000,
          formatted: tp.formatted ? String(tp.formatted).trim() : `+${Math.round((Number(tp.tokens) || 0) / 1000)}K`,
          priceUsd: Number(tp.priceUsd) >= 0 ? Number(tp.priceUsd) : 5,
          isActive: tp.isActive !== false,
        }))
      : DEFAULT_PACKAGES_CATALOG.topupPacks;

    const payload: PackagesCatalog = {
      packages: cleanedPackages,
      topupPacks: cleanedTopups,
      updatedAt: new Date().toISOString(),
    };

    const [existing] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "packages_catalog"));

    if (existing) {
      await db
        .update(adminConfigTable)
        .set({ value: JSON.stringify(payload) })
        .where(eq(adminConfigTable.key, "packages_catalog"));
    } else {
      await db.insert(adminConfigTable).values({
        key: "packages_catalog",
        value: JSON.stringify(payload),
      });
    }

    await logAdminActivity(
      req.session.userId!,
      "Update Packages Catalog",
      `Admin updated ${cleanedPackages.length} subscription packages and ${cleanedTopups.length} top-up packs`,
      req.ip || null
    );

    res.json(payload);
  } catch (err: any) {
    logger.error({ err }, "Update admin packages error");
    res.status(500).json({ error: "Failed to update packages catalog" });
  }
}

async function handleResetPackages(req: any, res: any) {
  try {
    const payload = {
      ...DEFAULT_PACKAGES_CATALOG,
      updatedAt: new Date().toISOString(),
    };

    const [existing] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "packages_catalog"));

    if (existing) {
      await db
        .update(adminConfigTable)
        .set({ value: JSON.stringify(payload) })
        .where(eq(adminConfigTable.key, "packages_catalog"));
    } else {
      await db.insert(adminConfigTable).values({
        key: "packages_catalog",
        value: JSON.stringify(payload),
      });
    }

    await logAdminActivity(
      req.session.userId!,
      "Reset Packages Catalog",
      "Admin reset subscription packages and top-up packs to system defaults",
      req.ip || null
    );

    res.json(payload);
  } catch (err: any) {
    logger.error({ err }, "Reset admin packages error");
    res.status(500).json({ error: "Failed to reset packages catalog" });
  }
}

router.get(["/admin/packages", "/packages/catalog", "/packages"], handleGetPackages);
router.put(["/admin/packages", "/packages"], handleUpdatePackages);
router.post(["/admin/packages", "/packages"], handleUpdatePackages);
router.post(["/admin/packages/reset", "/packages/reset"], handleResetPackages);

// ── Currency Exchange Rates Management ───────────────────────────────────────
router.get("/admin/currency-rates", async (_req, res) => {
  try {
    const data = await getExchangeRates();
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "Get admin currency rates error");
    res.status(500).json({ error: "Failed to load currency rates" });
  }
});

router.post("/admin/currency-rates/sync", async (req, res) => {
  try {
    const data = await getExchangeRates(true);
    await logAdminActivity(
      req.session.userId!,
      "Sync Currency Rates",
      `Manually synced daily live exchange rates (SAR: ${data.rates.SAR}, AED: ${data.rates.AED}, EGP: ${data.rates.EGP})`,
      req.ip || null
    );
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "Sync currency rates error");
    res.status(500).json({ error: "Failed to sync exchange rates" });
  }
});

router.put("/admin/currency-rates", async (req, res) => {
  try {
    const { rates, autoSync } = req.body as {
      rates?: Record<string, number>;
      autoSync?: boolean;
    };

    const current = await getExchangeRates();
    const updated: CurrencyRatesData = {
      base: "USD",
      rates: {
        ...current.rates,
        ...(rates || {}),
        USD: 1.0,
      },
      lastUpdated: new Date().toISOString(),
      source: autoSync === false ? "cache" : current.source,
      autoSync: autoSync !== false,
    };

    await saveExchangeRates(updated);
    await logAdminActivity(
      req.session.userId!,
      "Update Currency Rates",
      `Admin updated exchange rates configuration (autoSync: ${updated.autoSync})`,
      req.ip || null
    );

    res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Update currency rates error");
    res.status(500).json({ error: "Failed to update currency rates" });
  }
});

export default router;


