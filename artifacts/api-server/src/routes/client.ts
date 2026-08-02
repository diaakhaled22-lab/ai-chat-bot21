import { Router } from "express";
import bcrypt from "bcryptjs";
import { google } from "googleapis";
import { db, usersTable, companiesTable, chatLogsTable, ticketsTable, notificationsTable, adminConfigTable } from "@workspace/db";
import { eq, and, sql, gte, lte, desc, inArray } from "drizzle-orm";
import {
  CreateClientCompanyBody,
  UpdateClientCompanyBody,
  TestClientGoogleSheetConnectionBody,
  ListClientChatLogsQueryParams,
  DeleteClientChatLogParams,
  UpdateClientSettingsBody,
} from "@workspace/api-zod";
import { requireClient } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { enforceResponseLanguage, getLanguageInstruction } from "../lib/language";
import { syncCompanyWebsite } from "../lib/websiteSync";
import { sendNewTicketNotification } from "../lib/email";

const router = Router();
// Only enforce client auth on /client/* paths — other paths pass through unguarded
router.use("/client", requireClient);

// GET /client/company
router.get("/client/company", async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    res.json({
      id: company.id,
      clientId: company.clientId,
      clientName: null,
      myId: company.myId ?? null,
      name: company.name,
      generalInfo: company.generalInfo,
      isActive: company.isActive,
      systemPrompt: company.systemPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: company.serviceAccountKey,
      aiAgentApiKey: company.aiAgentApiKey,
      aiAgentUrl: company.aiAgentUrl,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
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
    logger.error({ err }, "Get client company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/company/quota  — current month token usage vs quota
router.get("/client/company/quota", async (req, res) => {
  try {
    const [company] = await db
      .select({ id: companiesTable.id, monthlyTokenQuota: companiesTable.monthlyTokenQuota })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const logs = await db
      .select({ customerMessage: chatLogsTable.customerMessage, botResponse: chatLogsTable.botResponse })
      .from(chatLogsTable)
      .where(and(
        eq(chatLogsTable.companyId, company.id),
        gte(chatLogsTable.createdAt, monthStart),
      ));

    const CHARS_PER_TOKEN = 4;
    let usedTokens = 0;
    for (const log of logs) {
      usedTokens += Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
      usedTokens += Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
    }

    const quota = company.monthlyTokenQuota ?? null;
    const percentUsed = quota ? Math.round((usedTokens / quota) * 100) : null;
    const warning = quota ? (usedTokens >= quota ? "exceeded" : usedTokens >= quota * 0.8 ? "near" : "ok") : "none";

    res.json({ quota, usedTokens, percentUsed, warning });
  } catch (err) {
    logger.error({ err }, "Get company quota error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function getAppBaseUrl(req: import("express").Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

async function autoRegisterWhatsAppWebhook(
  businessAccountId: string,
  accessToken: string,
): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${businessAccountId}/subscribed_apps`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const data = await res.json() as { success?: boolean; error?: { message: string } };
    if (data.success) {
      logger.info({ businessAccountId }, "WhatsApp WABA webhook subscription registered");
    } else {
      logger.warn({ businessAccountId, error: data.error }, "WhatsApp WABA subscription failed");
    }
  } catch (err) {
    logger.warn({ err }, "WhatsApp webhook auto-registration error");
  }
}

async function autoRegisterTelegramWebhook(token: string, baseUrl: string): Promise<void> {
  const webhookUrl = `${baseUrl}/api/telegram/webhook/${token}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (data.ok) {
      logger.info({ webhookUrl }, "Telegram webhook auto-registered");
    } else {
      logger.warn({ webhookUrl, description: data.description }, "Telegram webhook auto-registration failed");
    }
  } catch (err) {
    logger.warn({ err }, "Telegram webhook auto-registration error");
  }
}

// Fetches the bot's public @username via Telegram's getMe so we can build a
// shareable t.me/<username> link without asking the client to type it in.
async function fetchAndStoreTelegramUsername(companyId: number, token: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json() as { ok: boolean; result?: { username?: string } };
    if (data.ok && data.result?.username) {
      await db.update(companiesTable).set({ telegramBotUsername: data.result.username }).where(eq(companiesTable.id, companyId));
    } else {
      logger.warn({ companyId }, "Telegram getMe did not return a username");
    }
  } catch (err) {
    logger.warn({ err, companyId }, "Failed to fetch Telegram bot username");
  }
}

// Fetches the Facebook Page ID via the Graph API so we can build a shareable
// m.me/<pageId> link without asking the client to type it in.
async function fetchAndStoreMessengerPageId(companyId: number, pageAccessToken: string): Promise<void> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id&access_token=${encodeURIComponent(pageAccessToken)}`);
    const data = await res.json() as { id?: string; error?: { message?: string } };
    if (data.id) {
      await db.update(companiesTable).set({ messengerPageId: data.id }).where(eq(companiesTable.id, companyId));
    } else {
      logger.warn({ companyId, error: data.error }, "Graph API /me did not return a page id");
    }
  } catch (err) {
    logger.warn({ err, companyId }, "Failed to fetch Messenger page id");
  }
}

// POST /client/company
router.post("/client/company", async (req, res) => {
  try {
    const existing = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (existing.length > 0) {
      res.status(400).json({ error: "You already have a company. Use PUT to update it." });
      return;
    }

    const parsed = CreateClientCompanyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const data = parsed.data;
    const [company] = await db
      .insert(companiesTable)
      .values({
        clientId: req.session.userId!,
        name: data.name,
        generalInfo: data.generalInfo ?? null,
        isActive: false,
        systemPrompt: data.systemPrompt ?? null,
        googleSheetsEnabled: data.googleSheetsEnabled ?? false,
        googleSheetsLink: data.googleSheetsLink ?? null,
        googleSheetsName: data.googleSheetsName ?? null,
        googleSheetsPage: data.googleSheetsPage ?? null,
        serviceAccountKey: data.serviceAccountKey ?? null,
        aiAgentApiKey: data.aiAgentApiKey ?? null,
        aiAgentUrl: data.aiAgentUrl ?? null,
        aiProvider: (data.aiProvider as "openai" | "anthropic" | "google" | "openrouter" | null) ?? null,
        aiModel: data.aiModel ?? null,
        telegramBotApiKey: data.telegramBotApiKey ?? null,
        whatsappApiToken: data.whatsappApiToken ?? null,
        whatsappPhoneNumberId: data.whatsappPhoneNumberId ?? null,
        whatsappBusinessAccountId: data.whatsappBusinessAccountId ?? null,
        whatsappNumber: data.whatsappNumber ?? null,
        messengerApiKey: data.messengerApiKey ?? null,
        websiteChatbotKey: data.websiteChatbotKey ?? null,
        websiteDataUrl: data.websiteDataUrl ?? null,
        websiteAutoSync: data.websiteAutoSync ?? false,
      })
      .returning();

    if (company.telegramBotApiKey) {
      autoRegisterTelegramWebhook(company.telegramBotApiKey, getAppBaseUrl(req));
      fetchAndStoreTelegramUsername(company.id, company.telegramBotApiKey);
    }
    if (company.messengerApiKey) {
      fetchAndStoreMessengerPageId(company.id, company.messengerApiKey);
    }
    if (company.websiteAutoSync && company.websiteDataUrl) {
      void syncCompanyWebsite(company);
    }

    res.status(201).json({
      id: company.id,
      clientId: company.clientId,
      clientName: null,
      myId: company.myId ?? null,
      name: company.name,
      generalInfo: company.generalInfo,
      isActive: company.isActive,
      systemPrompt: company.systemPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: company.serviceAccountKey,
      aiAgentApiKey: company.aiAgentApiKey,
      aiAgentUrl: company.aiAgentUrl,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
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
    logger.error({ err }, "Create client company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /client/company
router.put("/client/company", async (req, res) => {
  try {
    const parsed = UpdateClientCompanyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.generalInfo !== undefined) updates.generalInfo = data.generalInfo;
    if (data.systemPrompt !== undefined) updates.systemPrompt = data.systemPrompt;
    if (data.googleSheetsEnabled !== undefined) updates.googleSheetsEnabled = data.googleSheetsEnabled;
    if (data.googleSheetsLink !== undefined) updates.googleSheetsLink = data.googleSheetsLink;
    if (data.googleSheetsName !== undefined) updates.googleSheetsName = data.googleSheetsName;
    if (data.googleSheetsPage !== undefined) updates.googleSheetsPage = data.googleSheetsPage;
    if (data.serviceAccountKey !== undefined) updates.serviceAccountKey = data.serviceAccountKey;
    if (data.aiAgentApiKey !== undefined) updates.aiAgentApiKey = data.aiAgentApiKey;
    if (data.aiAgentUrl !== undefined) updates.aiAgentUrl = data.aiAgentUrl;
    if (data.aiProvider !== undefined) updates.aiProvider = data.aiProvider;
    if (data.aiModel !== undefined) updates.aiModel = data.aiModel;
    if (data.telegramBotApiKey !== undefined) updates.telegramBotApiKey = data.telegramBotApiKey;
    if (data.whatsappApiToken !== undefined) updates.whatsappApiToken = data.whatsappApiToken;
    if (data.whatsappPhoneNumberId !== undefined) updates.whatsappPhoneNumberId = data.whatsappPhoneNumberId;
    if (data.whatsappBusinessAccountId !== undefined) updates.whatsappBusinessAccountId = data.whatsappBusinessAccountId;
    if (data.whatsappNumber !== undefined) updates.whatsappNumber = data.whatsappNumber;
    if (data.messengerApiKey !== undefined) updates.messengerApiKey = data.messengerApiKey;
    if (data.messengerPageId !== undefined) updates.messengerPageId = data.messengerPageId;
    if (data.websiteChatbotKey !== undefined) updates.websiteChatbotKey = data.websiteChatbotKey;
    if (data.websiteDataUrl !== undefined) updates.websiteDataUrl = data.websiteDataUrl;
    if (data.websiteAutoSync !== undefined) updates.websiteAutoSync = data.websiteAutoSync;

    const [company] = await db
      .update(companiesTable)
      .set(updates)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .returning();

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    if (company.telegramBotApiKey && data.telegramBotApiKey !== undefined) {
      autoRegisterTelegramWebhook(company.telegramBotApiKey, getAppBaseUrl(req));
      fetchAndStoreTelegramUsername(company.id, company.telegramBotApiKey);
    }
    if (company.messengerApiKey && data.messengerApiKey !== undefined) {
      fetchAndStoreMessengerPageId(company.id, company.messengerApiKey);
    }
    if (
      company.whatsappApiToken &&
      company.whatsappBusinessAccountId &&
      (data.whatsappApiToken !== undefined || data.whatsappBusinessAccountId !== undefined)
    ) {
      autoRegisterWhatsAppWebhook(company.whatsappBusinessAccountId, company.whatsappApiToken);
    }
    // Trigger an immediate sync when autoSync is turned on or URL changes
    if (
      company.websiteAutoSync &&
      company.websiteDataUrl &&
      (data.websiteAutoSync !== undefined || data.websiteDataUrl !== undefined)
    ) {
      void syncCompanyWebsite(company);
    }

    res.json({
      id: company.id,
      clientId: company.clientId,
      clientName: null,
      myId: company.myId ?? null,
      name: company.name,
      generalInfo: company.generalInfo,
      isActive: company.isActive,
      systemPrompt: company.systemPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: company.serviceAccountKey,
      aiAgentApiKey: company.aiAgentApiKey,
      aiAgentUrl: company.aiAgentUrl,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
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
    logger.error({ err }, "Update client company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/company/sync-website — manual trigger for website content sync
router.post("/client/company/sync-website", async (req, res) => {
  try {
    const [company] = await db
      .select({
        id: companiesTable.id,
        websiteDataUrl: companiesTable.websiteDataUrl,
        websiteAutoSync: companiesTable.websiteAutoSync,
      })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    if (!company.websiteDataUrl) {
      res.status(400).json({ error: "No Website Data URL configured" });
      return;
    }

    const ok = await syncCompanyWebsite(company);
    if (!ok) {
      res.status(502).json({ error: "Failed to fetch the website. Check that the URL is reachable." });
      return;
    }

    const [updated] = await db
      .select({ websiteLastSynced: companiesTable.websiteLastSynced })
      .from(companiesTable)
      .where(eq(companiesTable.id, company.id))
      .limit(1);

    res.json({ success: true, websiteLastSynced: updated?.websiteLastSynced?.toISOString() ?? null });
  } catch (err) {
    logger.error({ err }, "Sync website error");
    res.status(500).json({ error: "Internal server error" });
  }
});

function extractSpreadsheetId(link: string): string | null {
  const match = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  // Allow pasting a bare spreadsheet ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(link.trim())) return link.trim();
  return null;
}

// POST /client/company/test-google-sheet
router.post("/client/company/test-google-sheet", async (req, res) => {
  try {
    const parsed = TestClientGoogleSheetConnectionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { googleSheetsLink, googleSheetsPage } = parsed.data;

    const [company] = await db
      .select({ serviceAccountKey: companiesTable.serviceAccountKey })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    if (!company.serviceAccountKey) {
      res.json({ success: false, message: "No service account JSON is saved yet. Add one below, save, then test the connection." });
      return;
    }

    const spreadsheetId = googleSheetsLink ? extractSpreadsheetId(googleSheetsLink) : null;
    if (!spreadsheetId) {
      res.json({ success: false, message: "That doesn't look like a valid Google Sheet URL. Copy the full link from your browser's address bar." });
      return;
    }

    let credentials: { client_email?: string; private_key?: string };
    try {
      credentials = JSON.parse(company.serviceAccountKey);
    } catch {
      res.json({ success: false, message: "The saved service account JSON is not valid JSON. Please re-paste it and save before testing." });
      return;
    }

    if (!credentials.client_email || !credentials.private_key) {
      res.json({ success: false, message: "The saved service account JSON is missing client_email or private_key." });
      return;
    }

    try {
      const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const { data } = await sheets.spreadsheets.get({ spreadsheetId, fields: "properties.title,sheets.properties.title" });

      const tabTitles = (data.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => !!t);
      const trimmedName = googleSheetsPage?.trim();

      if (trimmedName) {
        const found = tabTitles.some((t) => t.toLowerCase() === trimmedName.toLowerCase());
        if (!found) {
          res.json({
            success: false,
            message: `Connected to "${data.properties?.title ?? "the spreadsheet"}", but no page/tab named "${trimmedName}" was found. Available pages: ${tabTitles.join(", ") || "none"}.`,
          });
          return;
        }
      }

      res.json({
        success: true,
        message: trimmedName
          ? `Connected successfully. Found the "${trimmedName}" page in "${data.properties?.title ?? "the spreadsheet"}".`
          : `Connected successfully to "${data.properties?.title ?? "the spreadsheet"}".`,
      });
    } catch (apiErr) {
      const status = (apiErr as { code?: number; response?: { status?: number } })?.code
        ?? (apiErr as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        res.json({ success: false, message: "Sheet not found. Double-check the URL — the spreadsheet may have been deleted or moved." });
      } else if (status === 403) {
        res.json({
          success: false,
          message: `Access denied. Share the sheet with this service account's email (${credentials.client_email}) as at least a Viewer.`,
        });
      } else {
        logger.error({ err: apiErr }, "Google Sheets test connection error");
        res.json({ success: false, message: "Could not connect to the sheet. Please verify the URL and service account credentials." });
      }
    }
  } catch (err) {
    logger.error({ err }, "Test Google Sheet connection error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/chat-logs
router.get("/client/chat-logs", async (req, res) => {
  try {
    const queryParams = ListClientChatLogsQueryParams.safeParse(req.query);
    const channelFilter = queryParams.success && queryParams.data.channel ? String(queryParams.data.channel) : null;
    const fromDateParam = queryParams.success && queryParams.data.fromDate ? String(queryParams.data.fromDate) : null;
    const toDateParam = queryParams.success && queryParams.data.toDate ? String(queryParams.data.toDate) : null;
    const fromDate = fromDateParam ? new Date(`${fromDateParam}T00:00:00.000Z`) : null;
    const toDate = toDateParam ? new Date(`${toDateParam}T23:59:59.999Z`) : null;

    const [myCompany] = await db
      .select({ id: companiesTable.id, name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!myCompany) {
      res.json([]);
      return;
    }

    const conditions = [eq(chatLogsTable.companyId, myCompany.id)];
    if (channelFilter) conditions.push(eq(chatLogsTable.channel, channelFilter as "telegram" | "whatsapp" | "messenger" | "website"));
    if (fromDate) conditions.push(gte(chatLogsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(chatLogsTable.createdAt, toDate));

    let query = db
      .select()
      .from(chatLogsTable)
      .where(and(...conditions))
      .$dynamic();

    const rows = await query.orderBy(sql`${chatLogsTable.createdAt} DESC`).limit(200);

    res.json(
      rows.map((log) => ({
        id: log.id,
        companyId: log.companyId,
        companyName: myCompany.name,
        channel: log.channel,
        customerMessage: log.customerMessage,
        botResponse: log.botResponse,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "List client chat logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /client/chat-logs/:id
router.delete("/client/chat-logs/:id", async (req, res) => {
  try {
    const params = DeleteClientChatLogParams.safeParse({ id: Number(req.params.id) });
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [myCompany] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!myCompany) {
      res.status(404).json({ error: "Chat log not found" });
      return;
    }

    const deleted = await db
      .delete(chatLogsTable)
      .where(and(eq(chatLogsTable.id, params.data.id), eq(chatLogsTable.companyId, myCompany.id)))
      .returning({ id: chatLogsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Chat log not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Delete client chat log error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/usage
router.get("/client/usage", async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    const fromParam = req.query.from as string | undefined;
    const toParam   = req.query.to   as string | undefined;

    const fromDate = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : null;
    const toDate   = toParam   ? new Date(`${toParam}T23:59:59.999Z`)   : null;

    const whereClause = and(
      eq(chatLogsTable.companyId, company.id),
      fromDate ? gte(chatLogsTable.createdAt, fromDate) : undefined,
      toDate   ? lte(chatLogsTable.createdAt, toDate)   : undefined,
    );

    const logs = await db
      .select()
      .from(chatLogsTable)
      .where(whereClause);

    const CHARS_PER_TOKEN = 4;

    type ChannelKey = "telegram" | "whatsapp" | "messenger" | "website";
    const byChannelMap: Record<string, { messages: number; inputTokens: number; outputTokens: number }> = {};

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const log of logs) {
      const inputTokens = Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
      const outputTokens = Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      const ch = log.channel as ChannelKey;
      if (!byChannelMap[ch]) byChannelMap[ch] = { messages: 0, inputTokens: 0, outputTokens: 0 };
      byChannelMap[ch].messages += 1;
      byChannelMap[ch].inputTokens += inputTokens;
      byChannelMap[ch].outputTokens += outputTokens;
    }

    const pricing: Record<string, { input: number; output: number }> = {
      // OpenAI
      "gpt-4o":                              { input: 2.50,  output: 10.00 },
      "gpt-4o-mini":                         { input: 0.15,  output: 0.60  },
      "gpt-4-turbo":                         { input: 10.00, output: 30.00 },
      "gpt-3.5-turbo":                       { input: 0.50,  output: 1.50  },
      // Anthropic
      "claude-3-5-sonnet-20241022":          { input: 3.00,  output: 15.00 },
      "claude-3-5-haiku-20241022":           { input: 0.80,  output: 4.00  },
      "claude-3-opus-20240229":              { input: 15.00, output: 75.00 },
      "claude-3-haiku-20240307":             { input: 0.25,  output: 1.25  },
      // Google
      "gemini-1.5-pro":                      { input: 1.25,  output: 5.00  },
      "gemini-1.5-flash":                    { input: 0.075, output: 0.30  },
      "gemini-2.0-flash":                    { input: 0.10,  output: 0.40  },
      // OpenRouter — free models
      "google/gemma-4-31b-it:free":          { input: 0,     output: 0     },
      "meta-llama/llama-4-scout:free":       { input: 0,     output: 0     },
      "meta-llama/llama-4-maverick:free":    { input: 0,     output: 0     },
      "deepseek/deepseek-r1:free":           { input: 0,     output: 0     },
      "deepseek/deepseek-v3-base:free":      { input: 0,     output: 0     },
      "qwen/qwen3-8b:free":                  { input: 0,     output: 0     },
      "mistralai/mistral-7b-instruct:free":  { input: 0,     output: 0     },
      "meta-llama/llama-3.1-8b-instruct:free": { input: 0,  output: 0     },
      // OpenRouter — paid models
      "deepseek/deepseek-v4-flash":          { input: 0.14,  output: 0.28  },
      "deepseek/deepseek-r1":                { input: 0.55,  output: 2.19  },
      "deepseek/deepseek-v3":                { input: 0.27,  output: 1.10  },
      "anthropic/claude-3.5-sonnet":         { input: 3.00,  output: 15.00 },
      "openai/gpt-4o":                       { input: 2.50,  output: 10.00 },
      "openai/gpt-4o-mini":                  { input: 0.15,  output: 0.60  },
      "google/gemini-pro-1.5":               { input: 1.25,  output: 5.00  },
      "mistralai/mistral-large":             { input: 2.00,  output: 6.00  },
      "meta-llama/llama-3.3-70b-instruct":   { input: 0.12,  output: 0.30  },
    };

    const modelKey = company.aiModel ?? "";
    const modelPricing = pricing[modelKey] ?? { input: 0, output: 0 };

    const estimatedCostUsd =
      (totalInputTokens / 1_000_000) * modelPricing.input +
      (totalOutputTokens / 1_000_000) * modelPricing.output;

    res.json({
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
      totalMessages: logs.length,
      estimatedInputTokens: totalInputTokens,
      estimatedOutputTokens: totalOutputTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      pricingPer1MTokens: modelPricing,
      byChannel: Object.entries(byChannelMap).map(([channel, data]) => ({
        channel,
        ...data,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get client usage error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/tickets
router.post("/client/tickets", async (req, res) => {
  try {
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title?.trim() || !description?.trim()) {
      res.status(400).json({ error: "Title and description are required" });
      return;
    }
    const [ticket] = await db
      .insert(ticketsTable)
      .values({ clientId: req.session.userId!, title: title.trim(), description: description.trim() })
      .returning();

    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));

    sendNewTicketNotification({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      clientName: user?.name ?? "Unknown",
    });

    res.status(201).json({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      aiResponse: ticket.aiResponse,
      createdAt: ticket.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Create ticket error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/tickets
router.get("/client/tickets", async (req, res) => {
  try {
    const tickets = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.clientId, req.session.userId!))
      .orderBy(sql`${ticketsTable.createdAt} DESC`);
    res.json(
      tickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        aiResponse: t.aiResponse,
        createdAt: t.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "List client tickets error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/chat-log-retention
router.get("/client/chat-log-retention", async (req, res) => {
  try {
    const [company] = await db
      .select({ chatLogRetentionDays: companiesTable.chatLogRetentionDays })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    let retentionDays = company?.chatLogRetentionDays ?? null;
    if (retentionDays === null) {
      const [adminRow] = await db
        .select()
        .from(adminConfigTable)
        .where(eq(adminConfigTable.key, "chat_log_retention_days"))
        .limit(1);
      retentionDays = adminRow?.value ? parseInt(adminRow.value, 10) : 7;
    }
    res.json({ retentionDays });
  } catch (err) {
    logger.error({ err }, "Get client chat log retention error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /client/chat-log-retention
router.put("/client/chat-log-retention", async (req, res) => {
  try {
    const days = Number((req.body as Record<string, unknown>).retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 7) {
      res.status(400).json({ error: "retentionDays must be an integer between 1 and 7" });
      return;
    }
    const [company] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);
    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }
    await db
      .update(companiesTable)
      .set({ chatLogRetentionDays: days })
      .where(eq(companiesTable.id, company.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Update client chat log retention error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /client/settings
router.put("/client/settings", async (req, res) => {
  try {
    const parsed = UpdateClientSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { currentPassword, newPassword, newUsername } = parsed.data;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
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
    const changes: string[] = [];

    if (newUsername && newUsername !== user.username) {
      const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, newUsername)).limit(1);
      if (existing) {
        res.status(400).json({ error: "Username already taken" });
        return;
      }
      updates.username = newUsername;
      changes.push(`username changed from "${user.username}" to "${newUsername}"`);
    }

    if (newPassword) {
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
      changes.push("password changed");
    }

    if (Object.keys(updates).length > 0) {
      await db.update(usersTable).set(updates).where(eq(usersTable.id, req.session.userId!));

      // Notify all admin users about the change
      if (changes.length > 0) {
        const adminUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
        const changesSummary = changes.join(" and ");
        await Promise.all(
          adminUsers.map((admin) =>
            db.insert(notificationsTable).values({
              userId: admin.id,
              type: "client_credentials_changed",
              title: "Client Credentials Updated",
              message: `Client "${user.name}" (${user.username}) has ${changesSummary}.`,
              isRead: false,
            })
          )
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Update client settings error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/notifications
router.get("/client/notifications", async (req, res) => {
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
    logger.error({ err }, "Get client notifications error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/company/ai-status
router.get("/client/company/ai-status", async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ status: "no_company" });
      return;
    }

    if (!company.aiAgentApiKey) {
      res.json({ status: "no_key", provider: company.aiProvider ?? "openai" });
      return;
    }

    const provider = company.aiProvider ?? "openai";
    const model = company.aiModel ?? (
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "google/gemma-4-31b-it:free" :
      "gpt-4o-mini"
    );

    try {
      if (provider === "google") {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(company.aiAgentApiKey);
        const genModel = genAI.getGenerativeModel({ model });
        await genModel.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
      } else if (provider === "anthropic") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: company.aiAgentApiKey });
        await client.messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
      } else if (provider === "openrouter") {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: company.aiAgentApiKey,
          baseURL: "https://openrouter.ai/api/v1",
        });
        await openai.chat.completions.create({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
      } else {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: company.aiAgentApiKey });
        await openai.chat.completions.create({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
      }
      res.json({ status: "ok", provider, model });
    } catch (aiErr: unknown) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isQuota = msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate");
      const isAuth = msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("invalid");
      res.json({
        status: isQuota ? "quota_exceeded" : isAuth ? "invalid_key" : "error",
        provider,
        model,
        detail: msg.slice(0, 200),
      });
    }
  } catch (err) {
    logger.error({ err }, "AI status check error");
    res.status(500).json({ status: "error", detail: "Internal server error" });
  }
});

router.patch("/client/notifications/mark-read", async (req, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.userId, req.session.userId!), eq(notificationsTable.isRead, false)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Mark client notifications read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/chatbot-trial — try the client's chatbot using platform AI key
router.post("/client/chatbot-trial", async (req, res) => {
  try {
    const messages: { role: string; content: string }[] = req.body?.messages ?? [];
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }
    const latestUserMessage =
      [...messages]
        .reverse()
        .find((message) => message.role === "user" && typeof message.content === "string")
        ?.content
        ?.trim() ?? "";
    if (!latestUserMessage) {
      res.status(400).json({ error: "messages must include a user message" });
      return;
    }

    // Load the client's company config
    const [company] = await db
      .select({
        name: companiesTable.name,
        generalInfo: companiesTable.generalInfo,
        systemPrompt: companiesTable.systemPrompt,
        isActive: companiesTable.isActive,
      })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: "Platform AI not configured" });
      return;
    }

    // Build system prompt from company config
    const parts: string[] = [];
    if (company.systemPrompt?.trim()) {
      parts.push(company.systemPrompt.trim());
    } else {
      parts.push(`You are a helpful assistant for ${company.name}.`);
    }
    if (company.generalInfo?.trim()) {
      parts.push(`\n\nCompany info:\n${company.generalInfo.trim()}`);
    }
    parts.push("\n\nNote: This is a preview/trial session.");
    parts.push(`\n\n${getLanguageInstruction(latestUserMessage)}`);
    const systemContent = parts.join("");

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemContent },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) fullResponse += content;
    }

    res.write(`data: ${JSON.stringify({ content: enforceResponseLanguage(fullResponse, latestUserMessage) })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "chatbot trial error");
    try {
      res.write(`data: ${JSON.stringify({ error: "AI error, please try again" })}\n\n`);
      res.end();
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Allowlist of provider → allowed model IDs for the client chat route
// This prevents authenticated clients from abusing admin API keys with arbitrary models
const ALLOWED_CLIENT_MODELS: Record<string, ReadonlySet<string>> = {
  openai: new Set([
    "gpt-4o-mini", "gpt-3.5-turbo", "gpt-4o", "gpt-4-turbo", "o3-mini", "o1-mini", "o1",
  ]),
  anthropic: new Set([
    "claude-3-haiku-20240307", "claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229", "claude-sonnet-4-5", "claude-opus-4-5",
  ]),
  google: new Set([
    "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash",
    "gemini-1.5-pro", "gemini-2.5-flash-preview", "gemini-2.5-pro-preview",
  ]),
  openrouter: new Set([
    "google/gemma-4-31b-it:free", "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-nano-9b-v2:free",
    "deepseek/deepseek-v4-flash", "deepseek/deepseek-r1", "deepseek/deepseek-v3",
    "anthropic/claude-3.5-sonnet", "openai/gpt-4o",
    "mistralai/mistral-large", "meta-llama/llama-3.3-70b-instruct",
  ]),
};

// ── Universal multi-provider streaming chat ──────────────────────────────────
// POST /client/multi-ai/chat — uses admin-saved test keys per provider
router.post("/client/multi-ai/chat", async (req, res) => {
  try {
    const { provider, model, messages: chatMessages } = req.body as {
      provider: string;
      model: string;
      messages: Array<{ role: string; content: string }>;
    };

    if (!provider || !model || !Array.isArray(chatMessages) || chatMessages.length === 0) {
      res.status(400).json({ error: "provider, model, and messages are required" });
      return;
    }

    // Validate provider + model against the curated allowlist
    const allowedModels = ALLOWED_CLIENT_MODELS[provider];
    if (!allowedModels) {
      res.status(400).json({ error: `Unknown provider: ${provider}` });
      return;
    }
    if (!allowedModels.has(model)) {
      res.status(400).json({ error: `Model '${model}' is not allowed for provider '${provider}'` });
      return;
    }

    // Look up admin-saved test key for this provider
    const rows = await db.select().from(adminConfigTable)
      .where(eq(adminConfigTable.key, `ai_test_key_${provider}`));
    const apiKey = rows[0]?.value ?? "";

    if (!apiKey) {
      res.status(400).json({
        error: `No API key configured for ${provider}. Ask your admin to add it in Settings → AI Tester.`,
      });
      return;
    }

    const SYSTEM = "You are a helpful AI assistant. Answer clearly and concisely.";
    const formatted = chatMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (provider === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });
      const stream = client.messages.stream({
        model, max_tokens: 2048, system: SYSTEM,
        messages: formatted,
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
        }
      }
    } else if (provider === "google") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI    = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model, systemInstruction: SYSTEM });
      const history  = formatted.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const lastMsg = formatted[formatted.length - 1].content;
      const chat    = genModel.startChat({ history });
      const result  = await chat.sendMessageStream(lastMsg);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    } else if (provider === "openrouter") {
      const OpenAI   = (await import("openai")).default;
      const openai   = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
      const stream   = await openai.chat.completions.create({
        model, max_tokens: 2048, stream: true,
        messages: [{ role: "system", content: SYSTEM }, ...formatted],
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    } else {
      // openai
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });
      const stream = await openai.chat.completions.create({
        model, max_tokens: 2048, stream: true,
        messages: [{ role: "system", content: SYSTEM }, ...formatted],
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    logger.error({ err }, "multi-AI chat error");
    try {
      res.write(`data: ${JSON.stringify({ error: err?.message ?? "AI error, please try again" })}\n\n`);
      res.end();
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// POST /client/test-messenger — verify the company's Messenger Page Access Token via Meta Graph API
router.post("/client/test-messenger", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Client access required" });
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId));
    if (!company?.messengerApiKey) return res.status(400).json({ ok: false, error: "No Messenger Page Access Token saved." });

    const url = `https://graph.facebook.com/me?access_token=${encodeURIComponent(company.messengerApiKey)}&fields=id,name`;
    const metaRes = await fetch(url);
    const data = await metaRes.json() as any;

    if (data.error) return res.json({ ok: false, error: data.error.message ?? "Invalid token." });
    return res.json({ ok: true, name: data.name ?? null, id: data.id ?? null });
  } catch (err) {
    logger.error({ err }, "Test messenger connection error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// POST /client/test-whatsapp — verify the company's WhatsApp API Token via Meta Graph API
router.post("/client/test-whatsapp", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Client access required" });
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId));
    if (!company?.whatsappApiToken || !company?.whatsappPhoneNumberId)
      return res.status(400).json({ ok: false, error: "No WhatsApp credentials saved." });

    const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(company.whatsappPhoneNumberId)}?access_token=${encodeURIComponent(company.whatsappApiToken)}&fields=id,display_phone_number,verified_name`;
    const metaRes = await fetch(url);
    const data = await metaRes.json() as any;

    if (data.error) return res.json({ ok: false, error: data.error.message ?? "Invalid credentials." });
    return res.json({ ok: true, phone: data.display_phone_number ?? null, name: data.verified_name ?? null, id: data.id ?? null });
  } catch (err) {
    logger.error({ err }, "Test whatsapp connection error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// GET /client/platform-webhooks — return platform-level webhook URLs + verify tokens
router.get("/client/platform-webhooks", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(
        inArray(adminConfigTable.key, ["whatsapp_verify_token", "messenger_verify_token"])
      );

    const get = (key: string) => rows.find((r) => r.key === key)?.value ?? null;
    const baseUrl = getAppBaseUrl(req);

    res.json({
      messenger: {
        webhookUrl: `${baseUrl}/api/messenger/webhook`,
        verifyToken: get("messenger_verify_token"),
      },
      whatsapp: {
        webhookUrl: `${baseUrl}/api/whatsapp/webhook`,
        verifyToken: get("whatsapp_verify_token"),
      },
    });
  } catch (err) {
    logger.error({ err }, "Get platform webhooks error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
