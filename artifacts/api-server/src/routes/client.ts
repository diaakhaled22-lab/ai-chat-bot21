import { Router } from "express";
import { notifyWidgetClient } from "../lib/ws";

import { sendWhatsAppMessage } from "./whatsapp";
import { sendTelegramMessage } from "./telegram";
import { sendMessengerMessage } from "./messenger";


import bcrypt from "bcryptjs";
import { google } from "googleapis";
import { db, usersTable, companiesTable, chatLogsTable, ticketsTable, notificationsTable, adminConfigTable, malfunctionsTable, leadsTable, cannedResponsesTable } from "@workspace/db";
import { eq, and, or, sql, gte, lte, desc, inArray } from "drizzle-orm";
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
import { sendNewTicketNotification, sendMalfunctionNotification } from "../lib/email";
import { getAiModelCatalog } from "../lib/aiModels";
import { maskApiKey } from "../lib/security";
import { resolveCompanyAi, assertCompanyQuotaNotExceeded, getQuotaAiSettings, getQuotaAiModelInfo } from "../lib/supportAi";
import { DEFAULT_SECURITY_PROMPT } from "../lib/promptInstructions";
import { getResendConfig, buildNotificationHtml, sendCompanyNotification } from "../lib/companyNotification";
import crypto from 'crypto';

function telegramWebhookSecret(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

const router = Router();
// Only enforce client auth on /client/* paths ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â other paths pass through unguarded
router.use("/client", requireClient);

// GET /client/ai-models ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â the same hourly-refreshed catalog used by the admin UI
router.get("/client/ai-models", async (req, res) => {
  try {
    res.json(await getAiModelCatalog());
  } catch (err) {
    logger.error({ err }, "Get client AI model catalog error");
    res.status(500).json({ error: "Unable to load AI model catalog" });
  }
});

// GET /client/company
router.get("/client/company", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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

    logger.info(
      {
        userId: req.session.userId,
        companyId: company.id,
        name: company.name,
        permissions: {
          website: company.allowSourceWebsite,
          files: company.allowSourceFiles,
          wordpress: company.allowSourceWordpress,
          restApi: company.allowSourceRestApi,
          shopify: company.allowSourceShopify,
        },
      },
      "Fetched client company"
    );

    res.json({
      id: company.id,
      clientId: company.clientId,
      clientName: null,
      myId: company.myId ?? null,
      name: company.name,
      notificationEmail: company.notificationEmail ?? null,
      resendApiKey: maskApiKey(company.resendApiKey),
      generalInfo: company.generalInfo,
      isActive: company.isActive,
      systemPrompt: company.systemPrompt,
        securityPrompt: company.securityPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: maskApiKey(company.serviceAccountKey),
      aiAgentApiKey: maskApiKey(company.aiAgentApiKey),
      aiAgentUrl: company.aiAgentUrl,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
      aiExecutionMode: (company as any).aiExecutionMode || "quota",
      monthlyTokenQuota: company.monthlyTokenQuota ?? null,
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
      voiceReplyEnabled: company.voiceReplyEnabled ?? false,
      voiceReplyVoice: company.voiceReplyVoice ?? "alloy",
      websiteChatbotKey: company.websiteChatbotKey,
      widgetEnabled: company.widgetEnabled ?? false,
      websiteDataUrl: company.websiteDataUrl,
      websiteAutoSync: company.websiteAutoSync,
      fabEnabled: company.fabEnabled,
      fabPositionX: company.fabPositionX,
      fabPositionY: company.fabPositionY,
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
    logger.error({ err }, "Get client company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/company/quota  ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â current month token usage vs quota
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

    const resetConfig = await db
      .select({ key: adminConfigTable.key, value: adminConfigTable.value })
      .from(adminConfigTable)
      .where(or(
        eq(adminConfigTable.key, `quota_reset_company_${company.id}`),
        eq(adminConfigTable.key, "quota_reset_all")
      ));

    let effectiveStart = monthStart;
    for (const r of resetConfig) {
      if (r.value) {
        const d = new Date(r.value);
        if (!isNaN(d.getTime()) && d > effectiveStart) {
          effectiveStart = d;
        }
      }
    }

    const logs = await db
      .select({ customerMessage: chatLogsTable.customerMessage, botResponse: chatLogsTable.botResponse })
      .from(chatLogsTable)
      .where(and(
        eq(chatLogsTable.companyId, company.id),
        gte(chatLogsTable.createdAt, effectiveStart),
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
  const secret = telegramWebhookSecret(token);
  const webhookUrl = `${baseUrl}/api/telegram/webhook/${secret}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        secret_token: secret,
      }),
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

type MetaGraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

function getMessengerMetaError(error: MetaGraphError | undefined): {
  code?: number;
  message: string;
  requiresPageAccess: boolean;
} {
  const rawMessage = error?.message ?? "Meta rejected the Messenger credentials.";
  const requiresPageAccess =
    error?.code === 100 ||
    rawMessage.includes("pages_read_engagement") ||
    rawMessage.includes("Page Public Content Access") ||
    rawMessage.includes("Page Public Metadata Access");

  if (requiresPageAccess) {
    return {
      code: error?.code,
      requiresPageAccess: true,
      message:
        "Meta rejected this credential. Use a Page Access Token (not an App Token or User Access Token), make sure the token belongs to the selected Facebook Page, and enable pages_messaging plus pages_read_engagement or Page Public Metadata Access in Meta.",
    };
  }

  return { code: error?.code, requiresPageAccess: false, message: rawMessage };
}

// Fetches the Facebook Page ID via the Graph API so we can build a shareable
// m.me/<pageId> link when the client has not entered it manually.
async function fetchAndStoreMessengerPageId(companyId: number, pageAccessToken: string): Promise<void> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id&access_token=${encodeURIComponent(pageAccessToken)}`);
    const data = await res.json() as { id?: string; error?: MetaGraphError };
    if (data.id) {
      await db.update(companiesTable).set({ messengerPageId: data.id }).where(eq(companiesTable.id, companyId));
    } else {
      const metaError = getMessengerMetaError(data.error);
      logger.warn({ companyId, error: data.error, requiresPageAccess: metaError.requiresPageAccess }, "Graph API /me did not return a page id");
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
        notificationEmail: (data as any).notificationEmail ? (data as any).notificationEmail.trim() : null,
        resendApiKey: (data as any).resendApiKey ? (data as any).resendApiKey.trim() : null,
        generalInfo: data.generalInfo ?? null,
        isActive: false,
        systemPrompt: data.systemPrompt ?? null,
        securityPrompt: DEFAULT_SECURITY_PROMPT,
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
        telegramWebhookSecretHash: data.telegramBotApiKey ? telegramWebhookSecret(data.telegramBotApiKey) : null,
        whatsappApiToken: data.whatsappApiToken ?? null,
        whatsappPhoneNumberId: data.whatsappPhoneNumberId ?? null,
        whatsappBusinessAccountId: data.whatsappBusinessAccountId ?? null,
        whatsappNumber: data.whatsappNumber ?? null,
        messengerApiKey: data.messengerApiKey ?? null,
        messengerPageId: data.messengerPageId ?? null,
        websiteChatbotKey: data.websiteChatbotKey ?? null,
        websiteDataUrl: data.websiteDataUrl ?? null,
        websiteAutoSync: data.websiteAutoSync ?? false,
      })
      .returning();

    if (company.telegramBotApiKey) {
      autoRegisterTelegramWebhook(company.telegramBotApiKey, getAppBaseUrl(req));
      fetchAndStoreTelegramUsername(company.id, company.telegramBotApiKey);
    }
    if (company.messengerApiKey && !company.messengerPageId) {
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
      notificationEmail: company.notificationEmail ?? null,
      resendApiKey: maskApiKey(company.resendApiKey),
      generalInfo: company.generalInfo,
      isActive: company.isActive,
      systemPrompt: company.systemPrompt,
        securityPrompt: company.securityPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: maskApiKey(company.serviceAccountKey),
      aiAgentApiKey: maskApiKey(company.aiAgentApiKey),
      aiAgentUrl: company.aiAgentUrl,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
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
    const [existingCompany] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!existingCompany) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    const preserveMaskedSecret = (
      nextValue: string | null | undefined,
      existingValue: string | null | undefined,
    ) => {
      if (nextValue !== undefined && existingValue && nextValue === maskApiKey(existingValue)) {
        return existingValue;
      }
      return nextValue;
    };

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if ((data as any).notificationEmail !== undefined) {
      updates.notificationEmail = (data as any).notificationEmail ? (data as any).notificationEmail.trim() : null;
    }
    if ((data as any).resendApiKey !== undefined) {
      updates.resendApiKey = preserveMaskedSecret((data as any).resendApiKey, existingCompany.resendApiKey);
    }
    if (data.generalInfo !== undefined) updates.generalInfo = data.generalInfo;
    if (data.systemPrompt !== undefined) updates.systemPrompt = data.systemPrompt;
    if (data.googleSheetsEnabled !== undefined) updates.googleSheetsEnabled = data.googleSheetsEnabled;
    if (data.googleSheetsLink !== undefined) updates.googleSheetsLink = data.googleSheetsLink;
    if (data.googleSheetsName !== undefined) updates.googleSheetsName = data.googleSheetsName;
    if (data.googleSheetsPage !== undefined) updates.googleSheetsPage = data.googleSheetsPage;
    if (data.serviceAccountKey !== undefined) {
      updates.serviceAccountKey = preserveMaskedSecret(data.serviceAccountKey, existingCompany.serviceAccountKey);
    }
    if (data.aiAgentApiKey !== undefined) {
      updates.aiAgentApiKey = preserveMaskedSecret(data.aiAgentApiKey, existingCompany.aiAgentApiKey);
    }
    if (data.aiAgentUrl !== undefined) updates.aiAgentUrl = data.aiAgentUrl;
    if (data.aiProvider !== undefined) updates.aiProvider = data.aiProvider;
    if (data.aiModel !== undefined) updates.aiModel = data.aiModel;
    if ((data as any).aiExecutionMode !== undefined) {
      updates.aiExecutionMode = (data as any).aiExecutionMode === "tokens" ? "tokens" : "quota";
    }
    if (data.telegramBotApiKey !== undefined) {
      updates.telegramBotApiKey = preserveMaskedSecret(data.telegramBotApiKey, existingCompany.telegramBotApiKey);
    }
    // Also update the webhook secret hash for direct DB lookup
    const resolvedTgKey = updates.telegramBotApiKey as string | null | undefined;
    if (resolvedTgKey !== undefined) {
      updates.telegramWebhookSecretHash = resolvedTgKey ? telegramWebhookSecret(resolvedTgKey) : null;
    }
    if (data.telegramEnabled !== undefined) updates.telegramEnabled = data.telegramEnabled;
    if (data.whatsappApiToken !== undefined) {
      updates.whatsappApiToken = preserveMaskedSecret(data.whatsappApiToken, existingCompany.whatsappApiToken);
    }
    if (data.whatsappPhoneNumberId !== undefined) updates.whatsappPhoneNumberId = data.whatsappPhoneNumberId;
    if (data.whatsappBusinessAccountId !== undefined) updates.whatsappBusinessAccountId = data.whatsappBusinessAccountId;
    if (data.whatsappNumber !== undefined) updates.whatsappNumber = data.whatsappNumber;
    if (data.whatsappEnabled !== undefined) updates.whatsappEnabled = data.whatsappEnabled;
    if (data.messengerApiKey !== undefined) {
      updates.messengerApiKey = preserveMaskedSecret(data.messengerApiKey, existingCompany.messengerApiKey);
    }
    if (data.messengerPageId !== undefined) updates.messengerPageId = data.messengerPageId;
    if (data.messengerEnabled !== undefined) updates.messengerEnabled = data.messengerEnabled;
    if (data.websiteChatbotKey !== undefined) updates.websiteChatbotKey = data.websiteChatbotKey;
    if (data.widgetEnabled !== undefined) updates.widgetEnabled = data.widgetEnabled;
    if (data.websiteDataUrl !== undefined) updates.websiteDataUrl = data.websiteDataUrl;
    if (data.websiteAutoSync !== undefined) updates.websiteAutoSync = data.websiteAutoSync;
    if (data.fabEnabled !== undefined) updates.fabEnabled = data.fabEnabled;
    if (data.fabPositionX !== undefined) updates.fabPositionX = data.fabPositionX;
    if (data.fabPositionY !== undefined) updates.fabPositionY = data.fabPositionY;
    if ((data as any).voiceReplyEnabled !== undefined) updates.voiceReplyEnabled = (data as any).voiceReplyEnabled;
    if ((data as any).voiceReplyVoice !== undefined) updates.voiceReplyVoice = (data as any).voiceReplyVoice;

    const [company] = await db
      .update(companiesTable)
      .set(updates)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .returning();

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    // Two-way sync: also update usersTable notificationEmail and resendApiKey
    if (updates.notificationEmail !== undefined || updates.resendApiKey !== undefined) {
      const userUpdates: Record<string, unknown> = {};
      if (updates.notificationEmail !== undefined) userUpdates.notificationEmail = updates.notificationEmail;
      if (updates.resendApiKey !== undefined) userUpdates.resendApiKey = updates.resendApiKey;
      if (Object.keys(userUpdates).length > 0 && req.session.userId) {
        await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, req.session.userId)).catch(() => {});
      }
    }

    if (company.telegramBotApiKey && data.telegramBotApiKey !== undefined) {
      autoRegisterTelegramWebhook(company.telegramBotApiKey, getAppBaseUrl(req));
      fetchAndStoreTelegramUsername(company.id, company.telegramBotApiKey);
    }
    const savedMessengerToken = preserveMaskedSecret(data.messengerApiKey, existingCompany.messengerApiKey);
    const messengerTokenChanged =
      data.messengerApiKey !== undefined && savedMessengerToken !== existingCompany.messengerApiKey;
    if (company.messengerApiKey && messengerTokenChanged && !company.messengerPageId) {
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
        securityPrompt: company.securityPrompt,
      googleSheetsEnabled: company.googleSheetsEnabled,
      googleSheetsLink: company.googleSheetsLink,
      googleSheetsName: company.googleSheetsName,
      googleSheetsPage: company.googleSheetsPage,
      serviceAccountKey: maskApiKey(company.serviceAccountKey),
      aiAgentApiKey: maskApiKey(company.aiAgentApiKey),
      aiAgentUrl: company.aiAgentUrl,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
      aiExecutionMode: (company as any).aiExecutionMode || "quota",
      monthlyTokenQuota: company.monthlyTokenQuota ?? null,
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
      widgetEnabled: company.widgetEnabled ?? false,
      websiteDataUrl: company.websiteDataUrl,
      websiteAutoSync: company.websiteAutoSync,
      fabEnabled: company.fabEnabled,
      fabPositionX: company.fabPositionX,
      fabPositionY: company.fabPositionY,
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
    logger.error({ err }, "Update client company error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /client/company/execution-mode — quick toggle between quota and API tokens
router.put("/client/company/execution-mode", async (req, res) => {
  try {
    const { mode } = req.body as { mode?: string };
    if (mode !== "quota" && mode !== "tokens") {
      res.status(400).json({ error: "Invalid mode. Must be 'quota' or 'tokens'" });
      return;
    }

    const [existingCompany] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!existingCompany) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    const [updated] = await db
      .update(companiesTable)
      .set({ aiExecutionMode: mode })
      .where(eq(companiesTable.id, existingCompany.id))
      .returning({ id: companiesTable.id, aiExecutionMode: companiesTable.aiExecutionMode });

    res.json({ success: true, aiExecutionMode: updated.aiExecutionMode });
  } catch (err) {
    logger.error({ err }, "Update AI execution mode error");
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
        allowSourceWebsite: companiesTable.allowSourceWebsite,
      })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    if (company.allowSourceWebsite === false) {
      res.status(403).json({ error: "Website data source is disabled by administrator." });
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
        res.json({ success: false, message: "Sheet not found. Double-check the URL ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â the spreadsheet may have been deleted or moved." });
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
        sessionId: log.sessionId,
        customerMessage: log.customerMessage,
        botResponse: log.botResponse,
        isRead: log.isRead,
         isHandoff: log.isHandoff,
        createdAt: log.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    logger.error({ err }, "List client chat logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /client/chat-logs/session/:sessionId/read
router.patch("/client/chat-logs/session/:sessionId/read", async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const [myCompany] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!myCompany) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    if (sessionId.startsWith("msg_")) {
      const logId = parseInt(sessionId.replace("msg_", ""), 10);
      const res = await db
        .update(chatLogsTable)
        .set({ isRead: true })
        .where(
          and(
            eq(chatLogsTable.companyId, myCompany.id),
            eq(chatLogsTable.id, logId)
          )
        );
      logger.info({ sessionId, logId, myCompanyId: myCompany.id }, "Marked single msg as read");
    } else {
      const res = await db
        .update(chatLogsTable)
        .set({ isRead: true })
        .where(
          and(
            eq(chatLogsTable.companyId, myCompany.id),
            eq(chatLogsTable.sessionId, sessionId)
          )
        );
      logger.info({ sessionId, myCompanyId: myCompany.id }, "Marked session as read");
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Mark session as read error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /client/chat-logs/:id/read
// DELETE /client/chat-logs/session/:sessionId
router.delete("/client/chat-logs/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const [myCompany] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!myCompany) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    if (sessionId.startsWith("msg_")) {
      const logId = parseInt(sessionId.replace("msg_", ""), 10);
      await db
        .delete(chatLogsTable)
        .where(
          and(
            eq(chatLogsTable.companyId, myCompany.id),
            eq(chatLogsTable.id, logId)
          )
        );
    } else {
      await db
        .delete(chatLogsTable)
        .where(
          and(
            eq(chatLogsTable.companyId, myCompany.id),
            eq(chatLogsTable.sessionId, sessionId)
          )
        );
    }

    res.json({ ok: true, success: true });
  } catch (err) {
    logger.error({ err }, "Delete session error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/client/chat-logs/:id/read", async (req, res) => {
  try {
    const logId = parseInt(req.params.id, 10);
    if (isNaN(logId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [myCompany] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!myCompany) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    await db
      .update(chatLogsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(chatLogsTable.companyId, myCompany.id),
          eq(chatLogsTable.id, logId)
        )
      );

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Mark log as read error");
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

// GET /client/dashboard — returns current-month usage stats + assigned quota
router.get("/client/dashboard", async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!company) {
      // Return empty stats so the dashboard page always renders
      const now = new Date();
      res.json({
        companyName: null,
        aiProvider: null,
        aiModel: null,
        isActive: false,
        monthlyTokenQuota: null,
        hasOwnApiKey: false,
        hasQuota: false,
        activeExecutionMode: "none",
        quotaAiProvider: null,
        quotaAiModel: null,
        totalMessages: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostUsd: 0,
        pricingPer1MTokens: { input: 0, output: 0 },
        byChannel: [],
        sentiments: { positive: 0, neutral: 0, negative: 0, angry: 0 },
        intents: [],
        periodLabel: `${now.toLocaleString("en", { month: "long" })} ${now.getFullYear()}`,
        hasCompany: false,
      });
      return;
    }

    const quotaModelInfo = await getQuotaAiModelInfo();

    // Always compute for the current month so quota progress is accurate
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Query all logs for the company so dashboard always displays the customer's full activity and stats
    const logs = await db
      .select({
        customerMessage: chatLogsTable.customerMessage,
        botResponse: chatLogsTable.botResponse,
        channel: chatLogsTable.channel,
        createdAt: chatLogsTable.createdAt,
        sentiment: chatLogsTable.sentiment,
        intent: chatLogsTable.intent,
      })
      .from(chatLogsTable)
      .where(eq(chatLogsTable.companyId, company.id));

    const CHARS_PER_TOKEN = 4;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const byChannelMap: Record<string, { messages: number; inputTokens: number; outputTokens: number }> = {};
    const sentiments = { positive: 0, neutral: 0, negative: 0, angry: 0 };
    const intents: Record<string, number> = {};

    for (const log of logs) {
      const it = Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
      const ot = Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
      totalInputTokens += it;
      totalOutputTokens += ot;
      const ch = log.channel;
      if (!byChannelMap[ch]) byChannelMap[ch] = { messages: 0, inputTokens: 0, outputTokens: 0 };
      byChannelMap[ch].messages += 1;
      byChannelMap[ch].inputTokens += it;
      byChannelMap[ch].outputTokens += ot;

      if (log.sentiment && (sentiments as any)[log.sentiment] !== undefined) {
        (sentiments as any)[log.sentiment] += 1;
      }
      if (log.intent) {
        intents[log.intent] = (intents[log.intent] || 0) + 1;
      }
    }

    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 2.50, output: 10.00 }, "gpt-4o-mini": { input: 0.15, output: 0.60 },
      "gpt-4-turbo": { input: 10.00, output: 30.00 }, "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
      "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 }, "claude-3-5-haiku-20241022": { input: 0.80, output: 4.00 },
      "claude-3-opus-20240229": { input: 15.00, output: 75.00 }, "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
      "gemini-1.5-pro": { input: 1.25, output: 5.00 }, "gemini-1.5-flash": { input: 0.075, output: 0.30 },
      "gemini-2.0-flash": { input: 0.10, output: 0.40 },
    };
    const modelPricing = pricing[company.aiModel ?? ""] ?? { input: 0, output: 0 };
    const estimatedCostUsd =
      (totalInputTokens / 1_000_000) * modelPricing.input +
      (totalOutputTokens / 1_000_000) * modelPricing.output;

    res.json({
      companyName: company.name,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
      isActive: company.isActive,
      monthlyTokenQuota: company.monthlyTokenQuota ?? null,
      hasOwnApiKey: !!company.aiAgentApiKey,
      hasQuota: (company.monthlyTokenQuota ?? 0) > 0,
      aiExecutionMode: (company as any).aiExecutionMode || "quota",
      activeExecutionMode: ((company as any).aiExecutionMode === "tokens")
        ? "own_key"
        : ((company.monthlyTokenQuota && company.monthlyTokenQuota > 0) ? "quota" : (company.aiAgentApiKey ? "own_key" : "none")),
      quotaAiProvider: quotaModelInfo.provider,
      quotaAiModel: quotaModelInfo.model,
      totalMessages: logs.length,
      estimatedInputTokens: totalInputTokens,
      estimatedOutputTokens: totalOutputTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      pricingPer1MTokens: modelPricing,
      byChannel: Object.entries(byChannelMap).map(([channel, d]) => ({ channel, ...d })),
      sentiments,
      intents: Object.entries(intents).map(([name, count]) => ({ name, count })).sort((a,b)=>b.count-a.count),
      periodLabel: `${now.toLocaleString("en", { month: "long" })} ${now.getFullYear()}`,
      hasCompany: true,
    });
  } catch (err) {
    logger.error({ err }, "Get client dashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/usage — displays quota usage only if admin has assigned a quota
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

    const hasQuota = (company.monthlyTokenQuota ?? 0) > 0;

    // If admin has NOT assigned a quota to this client, do NOT return own API key usage
    if (!hasQuota) {
      res.json({
        hasQuota: false,
        monthlyTokenQuota: null,
        quotaAiProvider: null,
        quotaAiModel: null,
        aiProvider: null,
        aiModel: null,
        totalMessages: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostUsd: 0,
        pricingPer1MTokens: { input: 0, output: 0 },
        byChannel: [],
        quota: null,
        usedTokens: 0,
        percentUsed: 0,
        warning: "none",
      });
      return;
    }

    const quotaModelInfo = await getQuotaAiModelInfo();
    const quotaAiProvider = quotaModelInfo.provider;
    const quotaAiModel = quotaModelInfo.model;
    const quota = company.monthlyTokenQuota!;

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
      .select({
        customerMessage: chatLogsTable.customerMessage,
        botResponse: chatLogsTable.botResponse,
        channel: chatLogsTable.channel,
      })
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

    // Calculate current monthly quota consumption (respecting resets)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const resetConfig = await db
      .select({ key: adminConfigTable.key, value: adminConfigTable.value })
      .from(adminConfigTable)
      .where(or(
        eq(adminConfigTable.key, `quota_reset_company_${company.id}`),
        eq(adminConfigTable.key, "quota_reset_all")
      ));

    let effectiveStart = monthStart;
    for (const r of resetConfig) {
      if (r.value) {
        const d = new Date(r.value);
        if (!isNaN(d.getTime()) && d > effectiveStart) {
          effectiveStart = d;
        }
      }
    }

    const currentPeriodLogs = await db
      .select({ customerMessage: chatLogsTable.customerMessage, botResponse: chatLogsTable.botResponse })
      .from(chatLogsTable)
      .where(and(
        eq(chatLogsTable.companyId, company.id),
        gte(chatLogsTable.createdAt, effectiveStart),
      ));

    let periodUsedTokens = 0;
    for (const log of currentPeriodLogs) {
      periodUsedTokens += Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
      periodUsedTokens += Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
    }

    const percentUsed = Math.min(Math.round((periodUsedTokens / quota) * 100), 100);
    const warning = periodUsedTokens >= quota ? "exceeded" : periodUsedTokens >= quota * 0.8 ? "near" : "ok";

    res.json({
      hasQuota: true,
      monthlyTokenQuota: quota,
      quotaAiProvider,
      quotaAiModel,
      aiProvider: quotaAiProvider,
      aiModel: quotaAiModel,
      totalMessages: logs.length,
      estimatedInputTokens: totalInputTokens,
      estimatedOutputTokens: totalOutputTokens,
      estimatedCostUsd: 0,
      pricingPer1MTokens: { input: 0, output: 0 },
      byChannel: Object.entries(byChannelMap).map(([channel, data]) => ({
        channel,
        ...data,
      })),
      quota,
      usedTokens: periodUsedTokens,
      percentUsed,
      warning,
    });
  } catch (err) {
    logger.error({ err }, "Get client usage error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /client/api-tokens — displays only Company's Own API Key Usage data without Quota data
router.get("/client/api-tokens", async (req, res) => {
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

    const hasOwnApiKey = !!company.aiAgentApiKey;
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
      .select({
        customerMessage: chatLogsTable.customerMessage,
        botResponse: chatLogsTable.botResponse,
        channel: chatLogsTable.channel,
      })
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
      "o1":                                  { input: 15.00, output: 60.00 },
      "o1-mini":                             { input: 3.00,  output: 12.00 },
      "o3-mini":                             { input: 1.10,  output: 4.40  },
      // Anthropic
      "claude-3-5-sonnet-20241022":          { input: 3.00,  output: 15.00 },
      "claude-3-5-haiku-20241022":           { input: 0.80,  output: 4.00  },
      "claude-3-opus-20240229":              { input: 15.00, output: 75.00 },
      "claude-3-haiku-20240307":             { input: 0.25,  output: 1.25  },
      "claude-3-sonnet-20240229":            { input: 3.00,  output: 15.00 },
      // Google
      "gemini-1.5-pro":                      { input: 1.25,  output: 5.00  },
      "gemini-1.5-flash":                    { input: 0.075, output: 0.30  },
      "gemini-2.0-flash":                    { input: 0.10,  output: 0.40  },
      "gemini-2.0-flash-lite":               { input: 0.075, output: 0.30  },
      // OpenRouter & Others
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
      hasOwnApiKey,
      aiProvider: company.aiProvider,
      aiModel: company.aiModel,
      totalMessages: logs.length,
      estimatedInputTokens: totalInputTokens,
      estimatedOutputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      pricingPer1MTokens: modelPricing,
      byChannel: Object.entries(byChannelMap).map(([channel, data]) => {
        const cost =
          (data.inputTokens / 1_000_000) * modelPricing.input +
          (data.outputTokens / 1_000_000) * modelPricing.output;
        return {
          channel,
          ...data,
          costUsd: Math.round(cost * 10000) / 10000,
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, "Get client api tokens usage error");
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

    const [company] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    // Create notifications for all admins
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
      
    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map(admin => ({
          userId: admin.id,
          type: "ticket",
          title: `New Problem: ${ticket.title}`,
          message: `Client ${user?.name ?? "Unknown"} reported a problem.`,
          companyId: company?.id ?? null,
        }))
      );
    }

    sendNewTicketNotification({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      clientName: user?.name ?? "Unknown",
    }).catch(err => {
      logger.error({ err }, "Failed to send new ticket notification email");
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

    const isCompanyOverride = company?.chatLogRetentionDays !== null && company?.chatLogRetentionDays !== undefined;
    let retentionDays = company?.chatLogRetentionDays ?? null;
    if (retentionDays === null) {
      const [adminRow] = await db
        .select()
        .from(adminConfigTable)
        .where(eq(adminConfigTable.key, "chat_log_retention_days"))
        .limit(1);
      retentionDays = adminRow?.value ? parseInt(adminRow.value, 10) : 7;
    }
    res.json({ retentionDays, isCompanyOverride });
  } catch (err) {
    logger.error({ err }, "Get client chat log retention error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /client/chat-log-retention ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â restricted to admin only
router.put("/client/chat-log-retention", async (req, res) => {
  res.status(403).json({ error: "Data retention policy can only be configured by a platform administrator." });
});

// PUT /client/settings
router.put("/client/settings", async (req, res) => {
  try {
    const parsed = UpdateClientSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { currentPassword, newPassword, newUsername, notificationEmail, resendApiKey } = parsed.data as any;

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (newPassword || (newUsername && newUsername !== user.username)) {
      if (!currentPassword) {
        res.status(400).json({ error: "Current password is required to change username or password" });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        res.status(400).json({ error: "Current password is incorrect" });
        return;
      }
    } else if (currentPassword) {
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

    // Save notification email if provided
    if (notificationEmail !== undefined) {
      const trimmedEmail = notificationEmail === "" ? null : notificationEmail.trim();
      updates.notificationEmail = trimmedEmail;
      await db
        .update(companiesTable)
        .set({ notificationEmail: trimmedEmail })
        .where(eq(companiesTable.clientId, req.session.userId!));

      if (trimmedEmail && trimmedEmail !== user.notificationEmail) {
        changes.push(`notification email set to "${trimmedEmail}"`);
        const [comp] = await db
          .select({ id: companiesTable.id, name: companiesTable.name })
          .from(companiesTable)
          .where(eq(companiesTable.clientId, req.session.userId!))
          .limit(1);

        if (comp) {
          sendCompanyNotification(
            comp.id,
            "Email Notifications Enabled",
            buildNotificationHtml({
              companyName: comp.name,
              eventType: "Notifications Enabled",
              title: "Email Notifications Enabled",
              dateTime: new Date(),
              customerDetails: { "Notification Email": trimmedEmail },
              eventDetails: "Your email has been successfully linked to your Bot Manager account. You will now receive automatic notifications for conversations, leads, orders, and malfunctions here.",
            }),
            { eventType: "Email Notifications Enabled" }
          ).catch((e: any) => logger.error({ err: e }, "Failed to send confirmation email via Resend"));
        }
      }
    }

    // Save RESEND_API_KEY secret if provided
    if (resendApiKey !== undefined) {
      const trimmedKey = resendApiKey === "" ? null : resendApiKey.trim();
      const resolvedKey = preserveMaskedSecret(trimmedKey, user.resendApiKey);
      updates.resendApiKey = resolvedKey;
      changes.push(`Resend API key ${resolvedKey ? "updated" : "removed"}`);
      await db
        .update(companiesTable)
        .set({ resendApiKey: resolvedKey })
        .where(eq(companiesTable.clientId, req.session.userId!));
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
              title: "Client Settings Updated",
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

// POST /client/send-test-notification
router.post("/client/send-test-notification", async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    const recipient =
      (typeof req.body?.email === "string" && req.body.email.trim()) ||
      user.notificationEmail?.trim() ||
      company?.notificationEmail?.trim();

    if (!recipient) {
      res.status(400).json({
        error: "No notification email provided. Please enter a Gmail address to test.",
      });
      return;
    }

    const customKey =
      typeof req.body?.resendApiKey === "string" && req.body.resendApiKey.trim() !== ""
        ? req.body.resendApiKey.trim()
        : user.resendApiKey?.trim() || company?.resendApiKey?.trim();

    const { apiKey, fromEmail } = await getResendConfig(customKey);

    if (!apiKey) {
      res.status(400).json({
        error: "RESEND_API_KEY is missing. Please enter your Resend API Key (re_...) in Client Settings or set the RESEND_API_KEY environment variable.",
      });
      return;
    }

    const companyName = company?.name || user.name || "My Company";
    const testHtml = buildNotificationHtml({
      companyName,
      eventType: "Test Email Notification",
      title: "Test Email Notification",
      dateTime: new Date(),
      customerDetails: {
        "Recipient Email": recipient,
        "Sender Address": fromEmail,
        "Delivery Status": "Verified via Resend API",
      },
      eventDetails:
        "Congratulations! Your Resend API Key and notification settings are properly configured. Live alerts (such as new conversations, captured leads, customer handoffs, orders, and malfunctions) will now be delivered to this email address.",
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipient],
        subject: `[Test] Email Notification Verified - ${companyName}`,
        html: testHtml,
      }),
    });

    if (resendRes.ok) {
      const data = (await resendRes.json()) as { id?: string };
      logger.info({ recipient, fromEmail, resendId: data.id }, "Test notification email sent successfully");

      // Auto-save verified email and Resend API key so automatic notifications work immediately
      try {
        const userUpdates: Record<string, any> = { notificationEmail: recipient };
        if (customKey) userUpdates.resendApiKey = customKey;
        await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, user.id));

        const compUpdates: Record<string, any> = { notificationEmail: recipient };
        if (customKey) compUpdates.resendApiKey = customKey;
        if (company) {
          await db.update(companiesTable).set(compUpdates).where(eq(companiesTable.id, company.id));
        } else {
          await db.update(companiesTable).set(compUpdates).where(eq(companiesTable.clientId, user.id));
        }
      } catch (saveErr) {
        logger.warn({ err: saveErr }, "Could not auto-save verified notification settings during test");
      }

      res.json({
        ok: true,
        id: data.id,
        recipient,
        from: fromEmail,
        message: `Test email sent successfully to ${recipient}!`,
      });
    } else {
      const errorText = await resendRes.text();
      let parsedMsg = errorText;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.message) parsedMsg = parsed.message;
      } catch {}

      logger.warn({ status: resendRes.status, parsedMsg }, "Resend test notification email failed");

      let userFriendlyAdvice = parsedMsg;
      if (resendRes.status === 403 && parsedMsg.toLowerCase().includes("only send testing emails to your own email address")) {
        userFriendlyAdvice = `Resend Free Tier Restriction: In Resend free tier, onboarding@resend.dev can only send emails to the email address registered with your Resend account (${parsedMsg}). To send to other Gmail addresses, either set your notification email to your Resend account email, or verify a custom domain in Resend Dashboard (resend.com/domains).`;
      } else if (resendRes.status === 401) {
        userFriendlyAdvice = "Invalid RESEND_API_KEY. Please make sure you copied the correct API Key starting with 're_' from your Resend Dashboard (resend.com/api-keys).";
      }

      res.status(400).json({
        error: userFriendlyAdvice,
        resendStatus: resendRes.status,
        rawError: parsedMsg,
      });
    }
  } catch (err: any) {
    logger.error({ err }, "Error sending test notification email");
    res.status(500).json({ error: err?.message || "Internal server error" });
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

    // Check quota
    try {
      await assertCompanyQuotaNotExceeded(company);
    } catch (quotaErr: any) {
      res.json({
        status: "quota_exceeded",
        provider: company.aiProvider ?? "openai",
        model: company.aiModel ?? "gpt-4o-mini",
        detail: quotaErr?.message,
      });
      return;
    }

    let aiConfig;
    try {
      aiConfig = await resolveCompanyAi(company);
    } catch {
      res.json({ status: "no_key", provider: company.aiProvider ?? "openai" });
      return;
    }

    const { apiKey, provider, model, isSupportAgent } = aiConfig;

    try {
      if (provider === "google") {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const genModel = genAI.getGenerativeModel({ model });
        await genModel.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
      } else if (provider === "anthropic") {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey });
        await client.messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] });
      } else if (provider === "openrouter") {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey,
          baseURL: "https://openrouter.ai/api/v1",
        });
        await openai.chat.completions.create({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
      } else {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey });
        await openai.chat.completions.create({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 });
      }
      res.json({ status: "ok", provider, model, isSupportAgent });
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

// DELETE /client/notifications/:id
router.delete("/client/notifications/:id", async (req, res) => {
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
    logger.error({ err }, "Delete client notification error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /client/notifications
router.delete("/client/notifications", async (req, res) => {
  try {
    await db
      .delete(notificationsTable)
      .where(eq(notificationsTable.userId, req.session.userId!));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Clear client notifications error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/chatbot-trial ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â try the client's chatbot using platform AI key
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
          securityPrompt: companiesTable.securityPrompt,
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

// ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Universal multi-provider streaming chat ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
// POST /client/multi-ai/chat ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â uses admin-saved test keys per provider
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

    // Validate provider + model against the hourly-refreshed provider catalog.
    // This keeps newly released models usable without a code change.
    const modelCatalog = await getAiModelCatalog();
    const allowedModels = modelCatalog.providers[provider as keyof typeof modelCatalog.providers]
      ? new Set(modelCatalog.providers[provider as keyof typeof modelCatalog.providers].map((item) => item.id))
      : undefined;
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
        error: `No API key configured for ${provider}. Ask your admin to add it in Settings ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ AI Tester.`,
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

// POST /client/test-messenger ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â verify the company's Messenger Page Access Token via Meta Graph API
router.post("/client/test-messenger", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Client access required" });
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!));
    if (!company?.messengerApiKey) return res.status(400).json({ ok: false, error: "No Messenger Page Access Token saved." });

    const url = `https://graph.facebook.com/me?access_token=${encodeURIComponent(company.messengerApiKey)}&fields=id,name`;
    const metaRes = await fetch(url);
    const data = await metaRes.json() as { id?: string; name?: string; error?: MetaGraphError };

    if (data.error) {
      const metaError = getMessengerMetaError(data.error);
      return res.json({
        ok: false,
        code: metaError.code,
        requiresPageAccess: metaError.requiresPageAccess,
        error: metaError.message,
      });
    }
    return res.json({ ok: true, name: data.name ?? null, id: data.id ?? null });
  } catch (err) {
    logger.error({ err }, "Test messenger connection error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// POST /client/test-whatsapp ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â verify the company's WhatsApp API Token via Meta Graph API
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

// GET /client/platform-webhooks ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â return platform-level webhook URLs + verify tokens
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


// â”€â”€ Malfunctions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── Malfunctions ───────────────────────────────────────────────────────────
router.get("/client/malfunctions", async (req, res) => {
  try {
    if (!(req.session as any).companyId) {
      res.json([]);
      return;
    }
    const list = await db.select().from(malfunctionsTable)
      .where(and(
        eq(malfunctionsTable.isActive, true),
        eq(malfunctionsTable.companyId, (req.session as any).companyId)
      ))
      .orderBy(desc(malfunctionsTable.createdAt));
    res.json(list);
  } catch (err) {
    logger.error({ err }, "Failed to fetch active malfunctions for client");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/client/malfunctions", async (req, res) => {
  try {
    let companyId = (req.session as any).companyId;
    if (!companyId && req.session.userId) {
      const [comp] = await db.select({ id: companiesTable.id }).from(companiesTable).where(eq(companiesTable.clientId, req.session.userId)).limit(1);
      if (comp) companyId = comp.id;
    }
    if (!companyId) {
      res.status(400).json({ error: "Company required to report malfunction" });
      return;
    }
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title || !description) {
      res.status(400).json({ error: "Missing title or description" });
      return;
    }
    const [company] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);

    const result = await db.insert(malfunctionsTable).values({
      companyId,
      title,
      description,
      source: "client",
      isActive: true,
    }).returning();

    // Notify admin bell icon and admin recipient email
    sendMalfunctionNotification({
      id: result[0].id,
      title,
      description,
      source: "client",
      companyId,
      companyName: company?.name,
    }).catch((err) => logger.error({ err }, "Failed to send malfunction notification"));

    res.json(result[0]);
  } catch (err) {
    logger.error({ err }, "Failed to report malfunction from client");
    res.status(500).json({ error: "Internal Server Error" });
  }
});



router.post("/client/chat/reply", async (req, res) => {
  try {
    const { sessionId, message, resolveHandoff } = req.body;
    if (!sessionId || message === undefined) {
      res.status(400).json({ error: "Missing sessionId or message" });
      return;
    }

    const [myCompany] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!myCompany) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    
    const [log] = await db
      .select()
      .from(chatLogsTable)
      .where(eq(chatLogsTable.sessionId, sessionId))
      .limit(1);

    if (!log) {
      res.status(404).json({ error: "Session not found in logs" });
      return;
    }
    const channel = log.channel;


    if (!resolveHandoff && message) {
        if (channel === "whatsapp") {
          const recipientPhone = sessionId.replace("wa_", "");
          if (myCompany.whatsappPhoneNumberId && myCompany.whatsappApiToken) {
            await sendWhatsAppMessage(myCompany.whatsappPhoneNumberId, myCompany.whatsappApiToken, recipientPhone, message);
          }
        } else if (channel === "telegram") {
          const chatId = parseInt(sessionId.replace("tg_", ""), 10);
          if (myCompany.telegramBotApiKey) {
            await sendTelegramMessage(myCompany.telegramBotApiKey, chatId, message);
          }
        } else if (channel === "messenger") {
          const senderId = sessionId.replace("fb_", "");
          if (myCompany.messengerApiKey) {
            await sendMessengerMessage(myCompany.messengerApiKey, senderId, message);
          }
        }
    }

    if (!resolveHandoff && message) {
        await db.insert(chatLogsTable).values({
          companyId: myCompany.id,
          channel: channel as any,
          sessionId,
          customerMessage: "",
          botResponse: "[Human] " + message,
          isHandoff: true,
          });
    }

    if (resolveHandoff) {
      await db.insert(chatLogsTable).values({
        companyId: myCompany.id,
        channel: channel as any,
        sessionId,
        customerMessage: "",
        botResponse: "[HANDOFF_RESOLVED]",
        isHandoff: false,
        });
    }

    res.json({ success: true, ok: true });
  } catch (err) {
    logger.error({ err }, "Reply error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/client/leads", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Client access required" });
    return;
  }
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId));
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const leads = await db.select().from(leadsTable).where(eq(leadsTable.companyId, company.id)).orderBy(sql`created_at DESC`);
    res.json(leads);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/client/leads/:id", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Client access required" });
    return;
  }
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId));
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const leadId = parseInt(req.params.id);
    if (isNaN(leadId)) {
      res.status(400).json({ error: "Invalid lead ID" });
      return;
    }
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.companyId, company.id)));
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    res.json({ success: true });
  } catch (err: any) {
    logger.error("Error deleting lead:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


  // GET /client/canned-responses
  router.get("/client/canned-responses", async (req, res) => {
    try {
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!)).limit(1);
      if (!company) { res.status(404).json({ error: "No company found" }); return; }
      const responses = await db.select().from(cannedResponsesTable).where(eq(cannedResponsesTable.companyId, company.id));
      res.json(responses);
    } catch (err) {
      logger.error({ err }, "Get canned responses error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /client/canned-responses
  router.post("/client/canned-responses", async (req, res) => {
    try {
      const { title, content } = req.body;
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!)).limit(1);
      if (!company) { res.status(404).json({ error: "No company found" }); return; }
      const [newResponse] = await db.insert(cannedResponsesTable).values({ companyId: company.id, title, content }).returning();
      res.json(newResponse);
    } catch (err) {
      logger.error({ err }, "Post canned responses error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /client/canned-responses/:id
  router.delete("/client/canned-responses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!)).limit(1);
      if (!company) { res.status(404).json({ error: "No company found" }); return; }
      await db.delete(cannedResponsesTable).where(and(eq(cannedResponsesTable.id, parseInt(id)), eq(cannedResponsesTable.companyId, company.id)));
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Delete canned responses error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

export default router;
