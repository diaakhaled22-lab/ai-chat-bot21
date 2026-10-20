import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, chatLogsTable, ticketsTable, adminConfigTable, companyActivityLogsTable, notificationsTable, adminActivityLogsTable, companyKnowledgeFilesTable, companyWordPressIntegrationsTable, malfunctionsTable } from "@workspace/db";
import { eq, count, and, sql, desc, gte, lte } from "drizzle-orm";
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
import { getAiModelCatalog, sanitizeOpenRouterModel, sanitizeGoogleModel, sanitizeOpenAiModel, sanitizeAnthropicModel, isAnthropicFreeModel, extractAnthropicText, buildOpenAiChatParams, AI_MODEL_PRICING, getModelPricing, isOpenRouterFreeModel, stripThinkingTags, getOpenRouterHeaders } from "../lib/aiModels";
import { getQuotaAiSettings, getQuotaAiModelInfo } from "../lib/supportAi";
import { getAttackMonitoringSnapshot, maskApiKey, preserveMaskedSecret, validatePassword, manualBlockIp, manualUnblockIp, getTotpSecret, setTotpSecret, removeTotpSecret, escapeHtml } from "../lib/security";
import { sendClientNotification, sendMalfunctionNotification, sendSecurityEventEmail, getEmailConfig, isSmtpConfigured, buildTransporter } from "../lib/email";
import { notifySubscriptionActivated, getResendConfig } from "../lib/companyNotification";
import { logAdminActivity } from "../lib/audit";
import { clearMetaAppSecretCache } from "../lib/webhookSecurity";
import { authenticator } from "otplib";
import QRCode from "qrcode";

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

    const [openTicketsRow] = await db
      .select({ count: count() })
      .from(ticketsTable)
      .where(eq(ticketsTable.status, "open"));

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
    const openTicketCount = openTicketsRow?.count ?? 0;

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
  const { ip } = req.body as { ip?: string };
  if (!ip || typeof ip !== "string") {
    res.status(400).json({ error: "Valid IP is required" });
    return;
  }
  manualBlockIp(ip);
  await logAdminActivity(req.session.userId!, "IP Blocked", `Manually blocked IP: ${ip}`, req.ip || null);
  res.json({ ok: true });
});

// POST /admin/attack-monitoring/unblock
router.post("/admin/attack-monitoring/unblock", async (req, res) => {
  const { ip } = req.body as { ip?: string };
  if (!ip || typeof ip !== "string") {
    res.status(400).json({ error: "Valid IP is required" });
    return;
  }
  manualUnblockIp(ip);
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
      // If company has quota, it executes via the Platform Quota AI Agent model!
      const modelKey = hasQuota ? quotaModel : (company.aiModel ?? "unknown");
      const provider = hasQuota ? quotaProvider : (company.aiProvider ?? "unknown");
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
      .map((c) => ({ ...c, costUsd: Math.round(c.costUsd * 10000) / 10000 }))
      .sort((a, b) => b.costUsd - a.costUsd);

    res.json({
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      byModel: Object.values(byModel).map((m) => ({ ...m, costUsd: Math.round(m.costUsd * 10000) / 10000 })),
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

    const companyCounts = await db
      .select({ clientId: companiesTable.clientId, count: count() })
      .from(companiesTable)
      .groupBy(companiesTable.clientId);

    const companyMap = new Map(companyCounts.map((r) => [r.clientId, r.count]));

    res.json(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        username: c.username,
        createdAt: c.createdAt.toISOString(),
        hasCompany: (companyMap.get(c.id) ?? 0) > 0,
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
    const { name, username, password } = parsed.data;

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

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ name, username, passwordHash, role: "client" })
      .returning();

    await logAdminActivity(
      adminId,
      "Client Created",
      `Created client "${user.name}" (${user.username})`,
      req.ip || null,
    );

    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
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
    const { name, username, password } = body.data;

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
        aiProvider: company.aiProvider ?? null,
        aiModel: company.aiModel ?? null,
        aiAgentApiKey: maskApiKey(company.aiAgentApiKey),
        aiAgentUrl: company.aiAgentUrl,
        monthlyTokenQuota: company.monthlyTokenQuota ?? null,
        chatLogRetentionDays: company.chatLogRetentionDays ?? null,
        telegramBotApiKey: maskApiKey(company.telegramBotApiKey),
        telegramBotUsername: company.telegramBotUsername,
        telegramEnabled: company.telegramEnabled,
        whatsappApiToken: maskApiKey(company.whatsappApiToken),
        whatsappNumber: company.whatsappNumber,
        whatsappEnabled: company.whatsappEnabled,
        messengerApiKey: maskApiKey(company.messengerApiKey),
        messengerPageId: company.messengerPageId,
        messengerEnabled: company.messengerEnabled,
        websiteChatbotKey: company.websiteChatbotKey,
        widgetEnabled: company.widgetEnabled,
        websiteDataUrl: company.websiteDataUrl,
        websiteAutoSync: company.websiteAutoSync,
        websiteLastSynced: company.websiteLastSynced?.toISOString() ?? null,
        allowSourceWebsite: company.allowSourceWebsite === false ? false : true,
        allowSourceFiles: company.allowSourceFiles === false ? false : true,
        allowSourceWordpress: company.allowSourceWordpress === false ? false : true,
        allowSourceRestApi: company.allowSourceRestApi === false ? false : true,
        allowSourceShopify: company.allowSourceShopify === false ? false : true,
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
      aiAgentApiKey: maskApiKey(company.aiAgentApiKey),
      aiAgentUrl: company.aiAgentUrl,
      monthlyTokenQuota: company.monthlyTokenQuota ?? null,
      chatLogRetentionDays: company.chatLogRetentionDays ?? null,
      telegramBotApiKey: maskApiKey(company.telegramBotApiKey),
      telegramBotUsername: company.telegramBotUsername,
      whatsappApiToken: maskApiKey(company.whatsappApiToken),
      whatsappPhoneNumberId: company.whatsappPhoneNumberId,
      whatsappBusinessAccountId: company.whatsappBusinessAccountId,
      whatsappNumber: company.whatsappNumber,
      messengerApiKey: maskApiKey(company.messengerApiKey),
      messengerPageId: company.messengerPageId,
      websiteChatbotKey: company.websiteChatbotKey,
      websiteDataUrl: company.websiteDataUrl,
      websiteAutoSync: company.websiteAutoSync,
      websiteLastSynced: company.websiteLastSynced?.toISOString() ?? null,
      allowSourceWebsite: company.allowSourceWebsite === false ? false : true,
      allowSourceFiles: company.allowSourceFiles === false ? false : true,
      allowSourceWordpress: company.allowSourceWordpress === false ? false : true,
      allowSourceRestApi: company.allowSourceRestApi === false ? false : true,
      allowSourceShopify: company.allowSourceShopify === false ? false : true,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Get company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/companies/:id  â€” update myId (custom reference)
router.patch("/admin/companies/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
    const { myId, securityPrompt, systemPrompt, notificationEmail, resendApiKey } = req.body as {
      myId?: string | null;
      securityPrompt?: string | null;
      systemPrompt?: string | null;
      notificationEmail?: string | null;
      resendApiKey?: string | null;
    };
    // Basic length validation
    if (myId && typeof myId === 'string' && myId.length > 255) {
      res.status(400).json({ error: "myId is too long (max 255 characters)" });
      return;
    }
    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.length > 50000) {
      res.status(400).json({ error: "systemPrompt is too long (max 50000 characters)" });
      return;
    }
    if (securityPrompt && typeof securityPrompt === 'string' && securityPrompt.length > 50000) {
      res.status(400).json({ error: "securityPrompt is too long (max 50000 characters)" });
      return;
    }
    const updateValues: Record<string, any> = {};
    if (myId !== undefined) updateValues.myId = myId;
    if (securityPrompt !== undefined) updateValues.securityPrompt = securityPrompt;
    if (systemPrompt !== undefined) updateValues.systemPrompt = systemPrompt;
    if (notificationEmail !== undefined) updateValues.notificationEmail = notificationEmail ? notificationEmail.trim() : null;
    if (resendApiKey !== undefined) {
      const [existing] = await db.select({ resendApiKey: companiesTable.resendApiKey }).from(companiesTable).where(eq(companiesTable.id, id)).limit(1);
      updateValues.resendApiKey = preserveMaskedSecret(resendApiKey, existing?.resendApiKey);
    }

    const [row] = await db
      .update(companiesTable)
      .set(updateValues)
      .where(eq(companiesTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Company not found" }); return; }
    const [clientRow] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.clientId));
    res.json({
      id: row.id,
      clientId: row.clientId,
      clientName: clientRow?.name ?? null,
      myId: row.myId ?? null,
      name: row.name,
      notificationEmail: row.notificationEmail ?? null,
      resendApiKey: maskApiKey(row.resendApiKey),
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Update company myId error");
    res.status(500).json({ error: "Internal server error" });
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
    const { monthlyTokenQuota, quotaStartDate, quotaEndDate, startDate, endDate } = req.body as {
      monthlyTokenQuota: number | null;
      quotaStartDate?: string | null;
      quotaEndDate?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    };
    const quota = monthlyTokenQuota == null ? null : Number(monthlyTokenQuota);
    if (quota !== null && (isNaN(quota) || quota < 0)) {
      res.status(400).json({ error: "Invalid quota value" });
      return;
    }

    const updates: Partial<typeof companiesTable.$inferInsert> = {
      monthlyTokenQuota: quota,
    };

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
          totalCost: billData?.cost != null ? Number(billData.cost).toFixed(4) : "0.0000",
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

    res.json(
      rows.map(({ log, companyName }) => ({
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
      }))
    );
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

    res.json(
      rows.map(({ ticket, clientName, clientUsername }) => ({
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
    res.json({ ok: true, status: ticket.status });
  } catch (err) {
    logger.error({ err }, "Resolve ticket error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/tickets/:id/admin-note  â€” admin manually solves the ticket
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
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Admin note error");
    res.status(500).json({ error: "Internal server error" });
  }
});

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

    const SYSTEM_PROMPT = "You are a helpful customer support assistant. Provide a clear, concise, and friendly solution to the customer's problem. Format your response in plain text.";
    const USER_PROMPT   = `Problem Title: ${ticket.title}\n\nProblem Description:\n${ticket.description}`;

    let aiResponse = "";

    if (provider === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });
      const effectiveModel = sanitizeAnthropicModel(model);
      try {
        const message = await client.messages.create({
          model: effectiveModel,
          max_tokens: 600,
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
            max_tokens: 600,
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
            { role: "user",   content: USER_PROMPT   },
          ],
          max_tokens: 600,
        });
      } catch (err: any) {
        if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
          completion = await openai.chat.completions.create({
            model: "openrouter/free",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user",   content: USER_PROMPT   },
            ],
            max_tokens: 600,
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
          { role: "user",   content: USER_PROMPT   },
        ], { maxTokens: 600 })
      );
      aiResponse = completion.choices[0]?.message?.content ?? "";
    }

    const [updated] = await db
      .update(ticketsTable)
      .set({ aiResponse, aiProvider: provider, aiModel: model, status: "resolved" })
      .where(eq(ticketsTable.id, id))
      .returning();

    res.json({ ok: true, aiResponse: updated.aiResponse, provider, model });
  } catch (err: any) {
    logger.error({ err }, "AI solve ticket error");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
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
            await openai.chat.completions.create({ model: effectiveModel, messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
          } catch (err: any) {
            if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
              await openai.chat.completions.create({ model: "openrouter/free", messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
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
            await openai.chat.completions.create({ model: effectiveModel, messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
          } catch (err: any) {
            if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
              await openai.chat.completions.create({ model: "openrouter/free", messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
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
          completion = await openrouter.chat.completions.create({
            model: effectiveModel,
            messages: [{ role: "user", content: testPrompt }],
            max_tokens: 64,
          });
        } catch (err: any) {
          if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
            completion = await openrouter.chat.completions.create({
              model: "openrouter/free",
              messages: [{ role: "user", content: testPrompt }],
              max_tokens: 64,
            });
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
    const items = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, req.session.userId!))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);
    res.json(items.map((n) => ({
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
        completion = await openai.chat.completions.create({
          model: effectiveModel,
          max_tokens: 100,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: testMessage }],
        });
      } catch (err: any) {
        if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
          completion = await openai.chat.completions.create({
            model: "openrouter/free",
            max_tokens: 100,
            messages: [{ role: "system", content: SYSTEM }, { role: "user", content: testMessage }],
          });
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

    // Resolve AI credentials and provider
    const configRows = await db
      .select()
      .from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('malfunctions_ai_provider', 'malfunctions_ai_api_key', 'malfunctions_ai_model', 'support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    const cfg = Object.fromEntries(configRows.map((r) => [r.key, r.value ?? ""]));

    const provider = (cfg["malfunctions_ai_provider"] as "google" | "openai") || (cfg["support_ai_provider"] === "openai" ? "openai" : "google");

    let apiKey = cfg["malfunctions_ai_api_key"] || "";
    if (!apiKey) {
      if (provider === "openai") {
        apiKey = (cfg["support_ai_provider"] === "openai" ? cfg["support_ai_api_key"] : "") || process.env.OPENAI_API_KEY || "";
      } else {
        apiKey = (cfg["support_ai_provider"] === "google" ? cfg["support_ai_api_key"] : "") || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
      }
    }

    const defaultModel = provider === "openai" ? "gpt-4o" : "gemini-1.5-pro";
    const model = cfg["malfunctions_ai_model"] || defaultModel;

    if (!apiKey) {
      res.status(400).json({
        error: `لم يتم ربط مفتاح ${provider === "openai" ? "OpenAI" : "Gemini"} API Key بعد. يرجى الضغط على زر 'إعدادات الذكاء الاصطناعي' في أعلى الصفحة وتحديد المزود وإدخال المفتاح.`,
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

    if (provider === "openai") {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });
      const comp = await openai.chat.completions.create(
        buildOpenAiChatParams(model, [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: USER_PROMPT },
        ], { maxTokens: 1500 })
      );
      aiAnalysis = comp.choices[0]?.message?.content || "";
    } else {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const effectiveModel = sanitizeGoogleModel(model);
      const gemini = genAI.getGenerativeModel({
        model: effectiveModel,
        systemInstruction: SYSTEM_INSTRUCTION,
      });
      const result = await gemini.generateContent(USER_PROMPT);
      aiAnalysis = result.response.text();
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

export default router;


