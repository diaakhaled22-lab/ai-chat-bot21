import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable, chatLogsTable, ticketsTable, adminConfigTable, companyActivityLogsTable, notificationsTable } from "@workspace/db";
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
import { getAiModelCatalog } from "../lib/aiModels";

const router = Router();
// Only enforce admin auth on /admin/* paths — other paths pass through this router unguarded
router.use("/admin", requireAdmin);

// GET /admin/ai-models — provider catalogs are refreshed automatically every hour
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
    const totalClients = clientsRow?.count ?? 0;
    const totalChatLogs = totalLogsRow?.count ?? 0;
    const todayChatLogs = todayLogsRow?.count ?? 0;
    const openTicketCount = openTicketsRow?.count ?? 0;

    res.json({ totalCompanies, activeCompanies, inactiveCompanies, totalClients, totalChatLogs, todayChatLogs, openTicketCount });
  } catch (err) {
    logger.error({ err }, "Get admin stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/usage-cost
router.get("/admin/usage-cost", async (req, res) => {
  try {
    const CHARS_PER_TOKEN = 4;

    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-4o":                     { input: 2.50,  output: 10.00 },
      "gpt-4o-mini":                { input: 0.15,  output: 0.60  },
      "gpt-4-turbo":                { input: 10.00, output: 30.00 },
      "gpt-3.5-turbo":              { input: 0.50,  output: 1.50  },
      "claude-3-5-sonnet-20241022": { input: 3.00,  output: 15.00 },
      "claude-3-5-haiku-20241022":  { input: 0.80,  output: 4.00  },
      "claude-3-opus-20240229":     { input: 15.00, output: 75.00 },
      "claude-3-haiku-20240307":    { input: 0.25,  output: 1.25  },
      "gemini-1.5-pro":             { input: 1.25,  output: 5.00  },
      "gemini-1.5-flash":           { input: 0.075, output: 0.30  },
      "gemini-2.0-flash":           { input: 0.10,  output: 0.40  },
    };

    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : undefined;
    const toDate   = to   ? new Date(to)   : undefined;

    const companies = await db
      .select({ id: companiesTable.id, name: companiesTable.name, aiProvider: companiesTable.aiProvider, aiModel: companiesTable.aiModel })
      .from(companiesTable);

    const whereClause = and(
      fromDate ? sql`${chatLogsTable.createdAt} >= ${fromDate}` : undefined,
      toDate   ? sql`${chatLogsTable.createdAt} <= ${toDate}`   : undefined,
    );

    const logs = await db
      .select({ companyId: chatLogsTable.companyId, customerMessage: chatLogsTable.customerMessage, botResponse: chatLogsTable.botResponse })
      .from(chatLogsTable)
      .where(whereClause);

    const companyMap = new Map(companies.map((c) => [c.id, c]));

    const byModel: Record<string, { provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }> = {};
    const byCompany: Record<number, { companyId: number; companyName: string; provider: string; model: string; messages: number; inputTokens: number; outputTokens: number; costUsd: number }> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;

    for (const log of logs) {
      const company = companyMap.get(log.companyId);
      if (!company) continue;

      const modelKey = company.aiModel ?? "unknown";
      const provider = company.aiProvider ?? "unknown";
      const inputTokens = Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
      const outputTokens = Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
      const mp = pricing[modelKey] ?? { input: 0, output: 0 };
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

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username));

    if (existing) {
      res.status(409).json({ error: `Username "${username}" is already taken. Please choose a different username.` });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(usersTable)
      .values({ name, username, passwordHash, role: "client" })
      .returning();
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
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (username) updates.username = username;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);

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
  try {
    const rows = await db
      .select({
        company: companiesTable,
        clientName: usersTable.name,
      })
      .from(companiesTable)
      .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id))
      .orderBy(companiesTable.createdAt);

    res.json(
      rows.map(({ company, clientName }) => ({
        id: company.id,
        clientId: company.clientId,
        clientName: clientName ?? null,
        myId: company.myId ?? null,
        name: company.name,
        generalInfo: company.generalInfo,
        isActive: company.isActive,
        activationStart: company.activationStart?.toISOString() ?? null,
        activationEnd: company.activationEnd?.toISOString() ?? null,
        systemPrompt: company.systemPrompt,
        googleSheetsEnabled: company.googleSheetsEnabled,
        googleSheetsLink: company.googleSheetsLink,
        googleSheetsName: company.googleSheetsName,
        googleSheetsPage: company.googleSheetsPage,
        serviceAccountKey: company.serviceAccountKey,
        aiAgentApiKey: company.aiAgentApiKey,
        aiAgentUrl: company.aiAgentUrl,
        monthlyTokenQuota: company.monthlyTokenQuota ?? null,
        telegramBotApiKey: company.telegramBotApiKey,
        telegramBotUsername: company.telegramBotUsername,
        whatsappApiToken: company.whatsappApiToken,
        whatsappNumber: company.whatsappNumber,
        messengerApiKey: company.messengerApiKey,
        messengerPageId: company.messengerPageId,
        websiteChatbotKey: company.websiteChatbotKey,
        websiteDataUrl: company.websiteDataUrl,
        websiteAutoSync: company.websiteAutoSync,
        websiteLastSynced: company.websiteLastSynced?.toISOString() ?? null,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "List companies error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/companies/:id
router.get("/admin/companies/:id", async (req, res) => {
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
      generalInfo: company.generalInfo,
      isActive: company.isActive,
      activationStart: company.activationStart?.toISOString() ?? null,
      activationEnd: company.activationEnd?.toISOString() ?? null,
      systemPrompt: company.systemPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: company.serviceAccountKey,
      aiAgentApiKey: company.aiAgentApiKey,
      aiAgentUrl: company.aiAgentUrl,
      telegramBotApiKey: company.telegramBotApiKey,
      telegramBotUsername: company.telegramBotUsername,
      whatsappApiToken: company.whatsappApiToken,
      whatsappPhoneNumberId: company.whatsappPhoneNumberId,
      whatsappBusinessAccountId: company.whatsappBusinessAccountId,
      whatsappNumber: company.whatsappNumber,
      messengerApiKey: company.messengerApiKey,
      messengerPageId: company.messengerPageId,
      websiteChatbotKey: company.websiteChatbotKey,
      websiteDataUrl: company.websiteDataUrl,
      websiteAutoSync: company.websiteAutoSync,
      websiteLastSynced: company.websiteLastSynced?.toISOString() ?? null,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Get company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /admin/companies/:id  — update myId (custom reference)
router.patch("/admin/companies/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
    const { myId } = req.body as { myId?: string | null };
    const [row] = await db
      .update(companiesTable)
      .set({ myId: myId ?? null })
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
      generalInfo: row.generalInfo,
      isActive: row.isActive,
      activationStart: row.activationStart?.toISOString() ?? null,
      activationEnd: row.activationEnd?.toISOString() ?? null,
      systemPrompt: row.systemPrompt,
      googleSheetsEnabled: row.googleSheetsEnabled,
      googleSheetsLink: row.googleSheetsLink,
      googleSheetsName: row.googleSheetsName,
      googleSheetsPage: row.googleSheetsPage,
      serviceAccountKey: row.serviceAccountKey,
      aiAgentApiKey: row.aiAgentApiKey,
      aiAgentUrl: row.aiAgentUrl,
      telegramBotApiKey: row.telegramBotApiKey,
      telegramBotUsername: row.telegramBotUsername,
      whatsappApiToken: row.whatsappApiToken,
      whatsappPhoneNumberId: row.whatsappPhoneNumberId,
      whatsappBusinessAccountId: row.whatsappBusinessAccountId,
      whatsappNumber: row.whatsappNumber,
      messengerApiKey: row.messengerApiKey,
      messengerPageId: row.messengerPageId,
      websiteChatbotKey: row.websiteChatbotKey,
      websiteDataUrl: row.websiteDataUrl,
      websiteAutoSync: row.websiteAutoSync,
      websiteLastSynced: row.websiteLastSynced?.toISOString() ?? null,
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
  try {
    const id = Number(req.params.id);
    const { monthlyTokenQuota } = req.body as { monthlyTokenQuota: number | null };
    const quota = monthlyTokenQuota == null ? null : Number(monthlyTokenQuota);
    if (quota !== null && (isNaN(quota) || quota < 0)) {
      res.status(400).json({ error: "Invalid quota value" });
      return;
    }
    const [updated] = await db
      .update(companiesTable)
      .set({ monthlyTokenQuota: quota })
      .where(eq(companiesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true, monthlyTokenQuota: updated.monthlyTokenQuota ?? null });
  } catch (err) {
    logger.error({ err }, "Set company quota error");
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
        customerMessage: log.customerMessage,
        botResponse: log.botResponse,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "List chat logs error");
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
    if (!Number.isInteger(days) || days < 1 || days > 7) {
      res.status(400).json({ error: "retentionDays must be an integer between 1 and 7" });
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
      .from(ticketsTable);

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

    // Model breakdown — only tickets that were AI-solved
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
      const message = await client.messages.create({
        model,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: USER_PROMPT }],
      });
      aiResponse = (message.content[0] as any)?.text ?? "";
    } else if (provider === "google") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const gemini = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT });
      const result = await gemini.generateContent(USER_PROMPT);
      aiResponse = result.response.text();
    } else if (provider === "openrouter") {
      const openai = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: USER_PROMPT   },
        ],
        max_tokens: 600,
      });
      aiResponse = completion.choices[0]?.message?.content ?? "";
    } else {
      // openai (default)
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: USER_PROMPT   },
        ],
        max_tokens: 600,
      });
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
    const masked = key.length > 8 ? `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}` : key ? "****" : "";
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

// GET /admin/support-ai-status  — live ping of the configured Support AI
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
      if (provider === "anthropic") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey });
        await client.messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
      } else if (provider === "google") {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI    = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({ model });
        await genModel.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
      } else if (provider === "openrouter") {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
        await openai.chat.completions.create({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 5 });
      } else {
        const openai = new OpenAI({ apiKey });
        await openai.chat.completions.create({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
      }
      res.json({ status: "ok", provider, model });
    } catch (aiErr: unknown) {
      const msg     = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isQuota = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");
      const isAuth  = msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("invalid");
      res.json({
        status: isQuota ? "quota_exceeded" : isAuth ? "invalid_key" : "error",
        provider,
        model,
        detail: msg.slice(0, 200),
      });
    }
  } catch (err) {
    logger.error({ err }, "Support AI status check error");
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
    const [user] = await db
      .select({ username: usersTable.username })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));
    res.json({ username: user?.username ?? "" });
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
    const { currentPassword, newPassword, username } = parsed.data;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        res.status(400).json({ error: "Current password is incorrect" });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (username) updates.username = username;
    if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 10);

    if (Object.keys(updates).length > 0) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, req.session.userId!));
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
    const { title, message, target } = req.body as {
      title?: string;
      message?: string;
      target?: "all" | "active" | "inactive";
    };

    if (!title?.trim() || !message?.trim()) {
      res.status(400).json({ error: "Title and message are required" });
      return;
    }

    const validTarget = ["all", "active", "inactive"].includes(target ?? "") ? target! : "all";

    // Get companies matching the target
    let companies = await db.select({
      id: companiesTable.id,
      clientId: companiesTable.clientId,
      name: companiesTable.name,
      isActive: companiesTable.isActive,
    }).from(companiesTable);

    if (validTarget === "active") companies = companies.filter((c) => c.isActive);
    else if (validTarget === "inactive") companies = companies.filter((c) => !c.isActive);

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
    let companies = await db.select({
      id: companiesTable.id,
      name: companiesTable.name,
      isActive: companiesTable.isActive,
    }).from(companiesTable);

    if (target === "active") companies = companies.filter((c) => c.isActive);
    else if (target === "inactive") companies = companies.filter((c) => !c.isActive);

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
      provider === "openrouter" ? "google/gemma-4-31b-it:free" : "gpt-4o-mini"
    );

    const testPrompt = "Reply with exactly: 'AI is working correctly.'";

    try {
      let reply = "";

      if (provider === "google") {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(company.aiAgentApiKey);
        const genModel = genAI.getGenerativeModel({ model });
        const result = await genModel.generateContent({ contents: [{ role: "user", parts: [{ text: testPrompt }] }] });
        reply = result.response.text();
      } else if (provider === "anthropic") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: company.aiAgentApiKey });
        const msg = await client.messages.create({ model, max_tokens: 64, messages: [{ role: "user", content: testPrompt }] });
        reply = (msg.content[0] as { type: string; text: string })?.text ?? "";
      } else if (provider === "openrouter") {
        const OpenAI = (await import("openai")).default;
        const openrouter = new OpenAI({ apiKey: company.aiAgentApiKey, baseURL: "https://openrouter.ai/api/v1" });
        const completion = await openrouter.chat.completions.create({ model, messages: [{ role: "user", content: testPrompt }], max_tokens: 64 });
        reply = completion.choices[0]?.message?.content ?? "";
      } else {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: company.aiAgentApiKey });
        const completion = await openai.chat.completions.create({ model, messages: [{ role: "user", content: testPrompt }], max_tokens: 64 });
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

// ── AI Model Tester ──────────────────────────────────────────────────────────

// POST /admin/ai-test — fire a test message at any provider/model
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
      const msg = await client.messages.create({
        model, max_tokens: 100, system: SYSTEM,
        messages: [{ role: "user", content: testMessage }],
      });
      response = (msg.content[0] as any)?.text ?? "";
    } else if (provider === "google") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM });
      const result = await genModel.generateContent(testMessage);
      response = result.response.text();
    } else if (provider === "openrouter") {
      const openai = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
      const completion = await openai.chat.completions.create({
        model, max_tokens: 100,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: testMessage }],
      });
      response = completion.choices[0]?.message?.content ?? "";
    } else {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model, max_tokens: 100,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: testMessage }],
      });
      response = completion.choices[0]?.message?.content ?? "";
    }

    res.json({ ok: true, response, provider, model, latencyMs: Date.now() - start });
  } catch (err: any) {
    logger.error({ err }, "AI test error");
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// GET /admin/ai-keys — masked per-provider saved keys
router.get("/admin/ai-keys", async (req, res) => {
  try {
    const providers = ["openai", "anthropic", "google", "openrouter"];
    const rows = await db.select().from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('ai_test_key_openai','ai_test_key_anthropic','ai_test_key_google','ai_test_key_openrouter')`);
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    const result: Record<string, { hasKey: boolean; maskedKey: string }> = {};
    for (const p of providers) {
      const key = cfg[`ai_test_key_${p}`] ?? "";
      const masked = key.length > 8 ? `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}` : key ? "****" : "";
      result[p] = { hasKey: !!key, maskedKey: masked };
    }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Get AI keys error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /admin/ai-keys — save a per-provider key
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

// GET /admin/telegram-webhook — return platform Telegram webhook base URL
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

// GET /admin/whatsapp-webhook — return stored platform verify token + webhook URL
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

// GET /admin/security/jwt-secret — return masked JWT secret + last rotated timestamp
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
    const maskedSecret = v.slice(0, 6) + "•".repeat(Math.max(0, v.length - 10)) + v.slice(-4);
    res.json({ exists: true, maskedSecret, lastRotated: row.updatedAt?.toISOString() ?? null });
  } catch (err) {
    logger.error({ err }, "Get JWT secret error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/security/jwt-secret/rotate — generate a new JWT secret and persist it
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

    const maskedSecret = secret.slice(0, 6) + "•".repeat(secret.length - 10) + secret.slice(-4);
    res.json({ success: true, maskedSecret, secret, lastRotated: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, "Rotate JWT secret error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/whatsapp-webhook/generate — generate & persist a new WhatsApp verify token
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

// GET /admin/messenger-webhook — return stored platform verify token + webhook URL
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

// POST /admin/messenger-webhook/generate — generate & persist a new verify token
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

export default router;
