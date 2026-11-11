import { Router } from "express";
import { db, companiesTable, chatLogsTable, leadsTable, usersTable, ticketsTable } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { IngestChatMessageBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  triggerNewMessageNotification,
  triggerHandoffNotification,
  isSessionInHandoff,
  isHandoffRequested,
  HANDOFF_SYSTEM_PROMPT,
  LEAD_GEN_SYSTEM_PROMPT,
  METRICS_SYSTEM_PROMPT,
  extractLeadData,
  extractMetrics,
} from "../lib/handoff";
import { notifyNewConversation, notifyNewLead } from "../lib/companyNotification";
import { resolveCompanyAi, assertCompanyQuotaNotExceeded, type ResolvedAiConfig } from "../lib/supportAi";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  sanitizeGoogleModel,
  formatGeminiHistory,
  sanitizeOpenAiModel,
  buildOpenAiChatParams,
  buildOpenRouterChatParams,
  sanitizeOpenRouterModel,
  isOpenRouterFreeModel,
  stripThinkingTags,
  getOpenRouterHeaders,
  sanitizeAnthropicModel,
  isAnthropicFreeModel,
  formatAnthropicMessages,
  extractAnthropicText,
} from "../lib/aiModels";
import { syncConversationToSheet } from "../lib/googleSheets";
import { getKnowledgeFilesPromptSection } from "../lib/knowledgeFiles";
import { getWebsiteKnowledgeSection } from "../lib/websiteSync";
import { getWordPressKnowledgeSection } from "../lib/wordpressSync";
import { getRestApiKnowledgeSection } from "../lib/restApiSync";
import { getShopifyKnowledgeSection } from "../lib/shopifySync";
import { LANGUAGE_MATCH_INSTRUCTION, OUTPUT_FORMAT_INSTRUCTION, ANTI_HALLUCINATION_INSTRUCTION, CONVERSATIONAL_MEMORY_INSTRUCTION, DEFAULT_PERSONALITY_PROMPT, buildWelcomeInstruction, buildKnownCustomerContext } from "../lib/promptInstructions";
import { detectResponseLanguage, enforceResponseLanguage, getLanguageInstruction, localizedChannelMessage } from "../lib/language";
import { rateLimit, webhookLimiter, escapeHtml } from "../lib/security";
import { timingSafeCompare } from "../lib/webhookSecurity";
import { getEmailConfig } from "../lib/email";
import { verifyApprovalToken, markApprovalTokenUsed, processApprovedPlanRequest } from "../lib/planApproval";

const router = Router();

async function callAI(
  company: typeof companiesTable.$inferSelect,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
  overrideAiConfig?: ResolvedAiConfig,
  knownCustomerContext?: string,
  isFirstMessage?: boolean
): Promise<string> {
  const { apiKey, provider, model } = overrideAiConfig ?? await resolveCompanyAi(company);

  let sysContent = company.systemPrompt?.trim() || DEFAULT_PERSONALITY_PROMPT;
  sysContent += HANDOFF_SYSTEM_PROMPT;
  sysContent += LEAD_GEN_SYSTEM_PROMPT;
  sysContent += METRICS_SYSTEM_PROMPT;
  if (company.securityPrompt) sysContent += `\n\nSecurity Instructions:\n${company.securityPrompt}`;
  sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
  sysContent += `\n\n${getLanguageInstruction(userMessage)}`;
  sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
  sysContent += `\n\n${ANTI_HALLUCINATION_INSTRUCTION}`;
  sysContent += `\n\n${CONVERSATIONAL_MEMORY_INSTRUCTION}`;
  sysContent += `\n\n${buildWelcomeInstruction(company, Boolean(isFirstMessage))}`;
  if (knownCustomerContext) {
    sysContent += `\n\n${knownCustomerContext}`;
  }
  if (company.generalInfo) sysContent += `\n\nCompany Info:\n${company.generalInfo}`;

  sysContent += await getWebsiteKnowledgeSection(company);
  sysContent += await getWordPressKnowledgeSection(company.id);
  sysContent += await getRestApiKnowledgeSection(company.id);
  sysContent += await getShopifyKnowledgeSection(company.id);
  sysContent += await getKnowledgeFilesPromptSection(company.id, userMessage);

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey });
    const effectiveModel = sanitizeAnthropicModel(model);
    const anthropicMsgs = formatAnthropicMessages(history, userMessage);
    let resp;
    try {
      resp = await client.messages.create({
        model: effectiveModel,
        max_tokens: 1024,
        system: sysContent || undefined,
        messages: anthropicMsgs,
      });
    } catch (err: any) {
      if (isAnthropicFreeModel(effectiveModel)) {
        if (effectiveModel !== "claude-3-5-haiku-20241022") {
          logger.warn({ effectiveModel, err: err?.message }, "Anthropic free model error in webhook; falling back to claude-3-5-haiku-20241022");
          resp = await client.messages.create({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1024,
            system: sysContent || undefined,
            messages: anthropicMsgs,
          });
        } else {
          throw err;
        }
      } else {
        const fallbackPaidModel = effectiveModel !== "claude-3-5-sonnet-20241022"
          ? "claude-3-5-sonnet-20241022"
          : "claude-3-5-haiku-20241022";
        logger.warn({ effectiveModel, fallbackPaidModel, err: err?.message }, "Anthropic paid model error in webhook; falling back to resilient tier");
        resp = await client.messages.create({
          model: fallbackPaidModel,
          max_tokens: 1024,
          system: sysContent || undefined,
          messages: anthropicMsgs,
        });
      }
    }
    return extractAnthropicText(resp.content);

  } else if (provider === "google") {
    const genAI = new GoogleGenerativeAI(apiKey);
    const effectiveModel = sanitizeGoogleModel(model);
    const genModel = genAI.getGenerativeModel({
      model: effectiveModel,
      systemInstruction: sysContent || undefined,
    });
    const geminiHistory = formatGeminiHistory(history);
    const chat = genModel.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();

  } else if (provider === "openrouter") {
    const openrouter = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: getOpenRouterHeaders(),
    });
    const effectiveModel = sanitizeOpenRouterModel(model);
    const messages: Array<{ role: string; content: string }> = [];
    if (sysContent) messages.push({ role: "system", content: sysContent });
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: "user", content: userMessage });

    let completion;
    try {
      const chatParams = buildOpenRouterChatParams(effectiveModel, messages, { maxTokens: 1024 });
      completion = await openrouter.chat.completions.create(chatParams);
    } catch (err: any) {
      if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
        logger.warn({ effectiveModel, err: err?.message }, "OpenRouter free model error in webhook; falling back to openrouter/free");
        const fallbackParams = buildOpenRouterChatParams("openrouter/free", messages, { maxTokens: 1024 });
        completion = await openrouter.chat.completions.create(fallbackParams);
      } else {
        throw err;
      }
    }
    return stripThinkingTags(completion.choices[0]?.message?.content ?? "");

  } else {
    const openai = new OpenAI({ apiKey });
    const effectiveModel = sanitizeOpenAiModel(model);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sysContent) messages.push({ role: "system", content: sysContent });
    for (const turn of history) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: "user", content: userMessage });

    const completion = await openai.chat.completions.create(
      buildOpenAiChatParams(effectiveModel, messages, { maxTokens: 1024 })
    );
    return completion.choices[0]?.message?.content ?? "";
  }
}

/**
 * POST /webhook/message (and /webhook)
 *
 * Server-to-server endpoint for private Telegram, WhatsApp, and Messenger integrations.
 * It generates and stores replies with full multi-source knowledge retrieval,
 *   quota enforcement, lead extraction, and human handoff checks.
 */
router.post(["/webhook/message", "/webhook"], webhookLimiter, async (req, res) => {
  try {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "botResponse")) {
      res.status(400).json({ error: "Caller-supplied botResponse is not accepted; replies are generated by the server" });
      return;
    }

    if (req.body?.channel === "website") {
      res.status(400).json({ error: "Website widget keys are public and cannot authenticate this endpoint" });
      return;
    }

    const parsed = IngestChatMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.issues.map((i: { message: string }) => i.message).join(", "),
      });
      return;
    }

    const { apiKey, channel, customerMessage, sessionId } = parsed.data;
    const cleanApiKey = (apiKey || "").trim();
    const isContextOnly = (req.body as any)?.contextOnly === true || (req.body as any)?.autoGenerate === false;

    // Match company by channel key
    const channelKeyColumn = {
      telegram: companiesTable.telegramBotApiKey,
      whatsapp: companiesTable.whatsappApiToken,
      messenger: companiesTable.messengerApiKey,
    }[channel];

    let [company] = channelKeyColumn
      ? await db.select().from(companiesTable).where(eq(channelKeyColumn, cleanApiKey)).limit(1)
      : [];

    if (!company) {
      res.status(401).json({ error: "Invalid API key for this channel" });
      return;
    }

    if (!company.isActive) {
      res.status(403).json({ error: "Company account is currently inactive" });
      return;
    }

    // Fetch prior turns for this session
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    let priorLogs: (typeof chatLogsTable.$inferSelect)[] = [];
    let knownCustomerContext = "";

    if (sessionId) {
      const recentLogs = await db
        .select()
        .from(chatLogsTable)
        .where(
          and(
            eq(chatLogsTable.companyId, company.id),
            eq(chatLogsTable.sessionId, sessionId)
          )
        )
        .orderBy(desc(chatLogsTable.createdAt))
        .limit(30);

      priorLogs = recentLogs.reverse();
      const isFirstMessage = !priorLogs || priorLogs.length === 0;

      if (isFirstMessage) {
        notifyNewConversation(
          { id: company.id, name: company.name },
          { channel, sessionId, initialMessage: customerMessage }
        ).catch((e) => logger.warn({ err: e, companyId: company.id }, "Webhook new conversation notification failed"));
      }

      for (const log of priorLogs) {
        conversationHistory.push({ role: "user", content: log.customerMessage });
        if (log.botResponse) {
          conversationHistory.push({ role: "assistant", content: log.botResponse });
        }
      }

      // Lookup previously collected lead info to avoid asking for already provided details
      try {
        const [knownLead] = await db
          .select()
          .from(leadsTable)
          .where(and(eq(leadsTable.companyId, company.id), eq(leadsTable.sessionId, sessionId)))
          .limit(1);

        knownCustomerContext = buildKnownCustomerContext(knownLead, conversationHistory);
      } catch {
        knownCustomerContext = buildKnownCustomerContext(null, conversationHistory);
      }
    }

    const inHandoff = isSessionInHandoff(priorLogs);

    // If session is already in human handoff
    if (inHandoff) {
      // Store the customer's incoming message so human agent sees it
      await db.insert(chatLogsTable).values({
        companyId: company.id,
        channel: channel as "telegram" | "whatsapp" | "messenger" | "website",
        sessionId: sessionId ?? null,
        customerMessage,
        botResponse: null,
        isHandoff: true,
      });

      triggerNewMessageNotification(company, sessionId ?? "webhook", channel, customerMessage);

      const waitingMsg = localizedChannelMessage(
        customerMessage,
        "محادثتك قيد المتابعة مع ممثل خدمة العملاء. يرجى الانتظار.",
        "Your session is being handled by a human agent. Please wait."
      );

      res.status(200).json({
        id: null,
        companyId: company.id,
        channel,
        sessionId: sessionId ?? null,
        createdAt: new Date().toISOString(),
        systemPrompt: company.systemPrompt ?? null,
        securityPrompt: company.securityPrompt ?? null,
        botResponse: waitingMsg,
        conversationHistory,
        inHandoff: true,
      });
      return;
    }

    // Phase 1 Context Fetch Only (if explicitly requested)
    if (isContextOnly) {
      req.log.info({ companyId: company.id, channel, sessionId }, "Webhook context fetch (isContextOnly=true)");
      res.status(200).json({
        id: null,
        companyId: company.id,
        channel,
        sessionId: sessionId ?? null,
        createdAt: new Date().toISOString(),
        systemPrompt: company.systemPrompt ?? null,
        securityPrompt: company.securityPrompt ?? null,
        conversationHistory,
        inHandoff: false,
      });
      return;
    }

    // Auto-generate AI response if company AI credentials can be resolved
    let aiConfig: ResolvedAiConfig | null = null;
    try {
      await assertCompanyQuotaNotExceeded(company);
      aiConfig = await resolveCompanyAi(company);
    } catch (aiCfgErr: any) {
      // If AI credentials/quota are not configured, smoothly return Phase 1 context
      req.log.info({ companyId: company.id, channel, err: aiCfgErr?.message }, "Webhook AI resolution skipped, returning Phase 1 context");
      res.status(200).json({
        id: null,
        companyId: company.id,
        channel,
        sessionId: sessionId ?? null,
        createdAt: new Date().toISOString(),
        systemPrompt: company.systemPrompt ?? null,
        securityPrompt: company.securityPrompt ?? null,
        conversationHistory,
        inHandoff: false,
        quotaNotice: aiCfgErr?.message ?? null,
      });
      return;
    }

    // Generate response using full multi-source AI pipeline
    try {
      const isFirstTurn = !priorLogs || priorLogs.length === 0;
      const rawReply = await callAI(company, customerMessage, conversationHistory, aiConfig, knownCustomerContext, isFirstTurn);
      const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);
      const { cleanResponse } = extractMetrics(tempResponse);

      let aiReply = enforceResponseLanguage(cleanResponse, customerMessage, undefined, company.name);
      let isHandoff = false;

      if (isHandoffRequested(customerMessage, rawReply, aiReply)) {
        aiReply = localizedChannelMessage(customerMessage, "سيتم وضعك في قائمة الانتظار.", "You will be placed on the waiting list.");
        isHandoff = true;
        if (sessionId) {
          triggerHandoffNotification(company, sessionId, channel).catch((e) =>
            logger.warn({ err: e }, "Webhook handoff notification failed")
          );
        }
      }

      // Extract and save lead if found
      if (leadData && (leadData.name || leadData.phone || leadData.email)) {
        try {
          const [newLead] = await db.insert(leadsTable).values({
            companyId: company.id,
            sessionId: sessionId ?? "webhook",
            channel: (channel as string) || "webhook",
            name: leadData.name ?? null,
            phone: leadData.phone ?? null,
            email: leadData.email ?? null,
            interest: leadData.interest ?? null,
            appointmentDate: leadData.appointmentDate ?? null,
            doctor: leadData.doctor ?? null,
            status: "pending",
            bookingType: leadData.bookingType ?? "new_checkup",
            notes: leadData.notes || customerMessage || null,
          }).returning();

          if (newLead) {
            notifyNewLead(company, newLead).catch((e) =>
              logger.warn({ err: e }, "Webhook lead notification failed")
            );
          }
        } catch (leadErr) {
          logger.warn({ leadErr }, "Webhook lead storage error");
        }
      }

      const [aiLog] = await db
        .insert(chatLogsTable)
        .values({
          companyId: company.id,
          channel: channel as "telegram" | "whatsapp" | "messenger" | "website",
          sessionId: sessionId ?? null,
          customerMessage,
          botResponse: aiReply,
          isHandoff,
        })
        .returning();

      void syncConversationToSheet(company, [
        ...conversationHistory,
        { role: "user", content: customerMessage },
        { role: "assistant", content: aiReply },
      ]);

      triggerNewMessageNotification(company, sessionId ?? "webhook", channel, customerMessage);

      req.log.info({ companyId: company.id, channel, sessionId, provider: aiConfig.provider, model: aiConfig.model }, "Webhook AI response generated and stored");

      res.status(201).json({
        id: aiLog.id,
        companyId: aiLog.companyId,
        channel: aiLog.channel,
        sessionId: aiLog.sessionId ?? null,
        createdAt: aiLog.createdAt.toISOString(),
        systemPrompt: company.systemPrompt ?? null,
        securityPrompt: company.securityPrompt ?? null,
        botResponse: aiReply,
        conversationHistory,
        inHandoff,
      });
    } catch (aiErr: any) {
      logger.error({ aiErr: aiErr?.message }, "Webhook AI generation failed");
      res.status(200).json({
        id: null,
        companyId: company.id,
        channel,
        sessionId: sessionId ?? null,
        createdAt: new Date().toISOString(),
        systemPrompt: company.systemPrompt ?? null,
        securityPrompt: company.securityPrompt ?? null,
        conversationHistory,
        inHandoff: false,
        error: detectResponseLanguage(customerMessage) === "Arabic"
          ? "تعذر إعداد الرد. يرجى التحقق من إعدادات الذكاء الاصطناعي."
          : "AI generation failed — check your API key, model selection, or token quota.",
      });
    }
  } catch (err) {
    logger.error({ err }, "Webhook ingest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Helper to determine whether an email reply message indicates approval.
 * Inspects reply lines before quotation markers (> or On ... wrote: or كتب:).
 * Matches "OK", "ok", "موافق", "approved", "تم", "تفعيل", "تمام", "نعم", "yes".
 */
function isApprovalReplyText(rawText: string): boolean {
  if (!rawText || typeof rawText !== "string") return false;
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const cleanLines: string[] = [];
  for (const line of lines) {
    if (
      line.startsWith(">") ||
      line.startsWith("---") ||
      line.startsWith("___") ||
      line.toLowerCase().includes("wrote:") ||
      line.includes("كتب:") ||
      line.toLowerCase().includes("original message")
    ) {
      break;
    }
    cleanLines.push(line);
  }

  const combined = (cleanLines.length > 0 ? cleanLines.join(" ") : lines[0] || "").trim().toLowerCase();
  if (!combined) return false;

  // Check prefix or full match
  const keywordMatch = /^(ok|okay|موافق|approved?|approve|تم|تفعيل|تمام|نعم|yes)\b/i.test(combined);
  if (keywordMatch) return true;

  // Check if "ok" or "موافق" is present anywhere in first clean lines
  return /\b(ok|موافق|approved)\b/i.test(combined);
}

/**
 * Helper to extract Ticket ID from inbound email subject, body, or headers.
 */
function extractTicketIdFromEmail(subject: string, bodyText: string, headers?: Record<string, any>): number | null {
  // 1. Check subject: e.g. [طلب باقة جديد #123] or #123 or Ticket #123
  if (subject) {
    const match = subject.match(/#(\d+)/) || subject.match(/ticket\s*#?(\d+)/i) || subject.match(/طلب\s*باقة[^\d]*(\d+)/i);
    if (match && match[1]) {
      const id = parseInt(match[1], 10);
      if (!isNaN(id) && id > 0) return id;
    }
  }

  // 2. Check headers (In-Reply-To or References: <ticket-123@botmanager>)
  if (headers) {
    const inReplyTo = String(headers["in-reply-to"] || headers["In-Reply-To"] || headers["references"] || headers["References"] || "");
    const headerMatch = inReplyTo.match(/ticket-(\d+)@/i);
    if (headerMatch && headerMatch[1]) {
      const id = parseInt(headerMatch[1], 10);
      if (!isNaN(id) && id > 0) return id;
    }
  }

  // 3. Check body text
  if (bodyText) {
    const bodyMatch = bodyText.match(/#(\d+)/);
    if (bodyMatch && bodyMatch[1]) {
      const id = parseInt(bodyMatch[1], 10);
      if (!isNaN(id) && id > 0) return id;
    }
  }

  return null;
}

/**
 * POST /webhooks/inbound-email, /email/inbound, /api/webhooks/inbound-email
 * Inbound Email Webhook to process Admin replies ("OK").
 * Supports Resend inbound, SendGrid Inbound Parse, Mailgun, Postmark, and generic JSON/form webhooks.
 */
router.post(
  ["/webhooks/inbound-email", "/email/inbound", "/webhook/inbound-email", "/api/webhooks/inbound-email"],
  rateLimit(60 * 1000, 10, "inbound-email-approval"),
  async (req, res) => {
    try {
      const webhookSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim();
      if (!webhookSecret) {
        logger.error({ path: req.path }, "Inbound email approval is disabled: INBOUND_EMAIL_WEBHOOK_SECRET is not configured");
        res.status(503).json({ ok: false, error: "Inbound email approval is not configured" });
        return;
      }

      const providedSecret = (
        req.get("x-email-webhook-token") ||
        req.get("x-webhook-token") ||
        req.get("x-admin-token") ||
        ""
      ).trim();
      if (!timingSafeCompare(providedSecret, webhookSecret)) {
        logger.warn({ ip: req.ip, path: req.path }, "Inbound email webhook rejected: invalid or missing webhook token");
        res.status(401).json({ ok: false, error: "Invalid or missing webhook token" });
        return;
      }

      const body = req.body || {};
      logger.info({ bodyKeys: Object.keys(body) }, "Inbound email webhook received");

      // Extract sender
      const rawFrom =
        body.from ||
        body.sender ||
        body.data?.from ||
        body.From ||
        body["sender-email"] ||
        body.envelope?.from ||
        "";
      const fromMatch =
        String(rawFrom).match(/<([^>]+)>/) ||
        String(rawFrom).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      const senderEmail = (fromMatch ? fromMatch[1] : String(rawFrom)).trim().toLowerCase();

      // The sender in the payload is only accepted after the webhook token is verified.
      const cfg = await getEmailConfig();
      const configuredAdminEmail = (cfg.recipientEmail || "").trim().toLowerCase();
      let isAuthorized = Boolean(configuredAdminEmail && senderEmail === configuredAdminEmail);
      if (!isAuthorized && senderEmail) {
        const matchingAdmin = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.role, "admin"), eq(usersTable.email, senderEmail)))
          .limit(1);
        isAuthorized = matchingAdmin.length > 0;
      }

      if (!isAuthorized) {
        logger.warn({ senderEmail }, "Inbound email rejected: sender not authorized as admin");
        res.status(403).json({ ok: false, error: "Sender email is not authorized as admin" });
        return;
      }

      // Extract subject
      const subject = String(body.subject || body.Subject || body.data?.subject || "");

      // Extract text content
      const rawText = String(
        body["stripped-text"] ||
        body.StrippedTextReply ||
        body.text ||
        body.body ||
        body.data?.text ||
        body.TextBody ||
        body.content ||
        ""
      );

      // Extract Ticket ID
      const explicitId = req.query.ticketId ? Number(req.query.ticketId) : body.ticketId ? Number(body.ticketId) : null;
      const ticketId = explicitId && !isNaN(explicitId) ? explicitId : extractTicketIdFromEmail(subject, rawText, body.headers || req.headers);

      if (!ticketId) {
        logger.warn({ subject, senderEmail }, "Inbound email: No Ticket ID found in subject, headers, or body");
        res.status(200).json({ ok: false, reason: "No ticket ID identified" });
        return;
      }

      // Check if the reply indicates approval
      const isApproved = isApprovalReplyText(rawText);
      if (!isApproved) {
        logger.info(
          { ticketId, senderEmail, textSnippet: rawText.slice(0, 80) },
          "Inbound email: Message does not contain 'OK' or approval keyword. Ignoring non-approval reply."
        );
        res.status(200).json({ ok: true, status: "ignored_non_approval", ticketId });
        return;
      }

      // Determine if text explicitly indicates unpaid or paid
      let replyIsPaid = false;
      const lowerReply = rawText.toLowerCase();
      if (
        lowerReply.includes("unpaid") ||
        lowerReply.includes("غير مسدد") ||
        lowerReply.includes("غير مدفوع") ||
        lowerReply.includes("آجل") ||
        lowerReply.includes("اجل")
      ) {
        replyIsPaid = false;
      } else if (
        lowerReply.includes("paid") ||
        lowerReply.includes("مسدد") ||
        lowerReply.includes("مدفوع") ||
        lowerReply.includes("كاش")
      ) {
        replyIsPaid = true;
      }

      // Process the approved plan / top-up request!
      const result = await processApprovedPlanRequest(ticketId, {
        approvedBy: senderEmail || "Admin (Email Reply)",
        channel: "email_reply",
        isPaid: replyIsPaid,
      });

      logger.info({ ticketId, senderEmail, invoiceNumber: result.invoice.invoiceNumber }, "Plan request approved via email OK reply");
      res.status(200).json({
        ok: true,
        message: "Plan request approved and processed successfully via email OK reply",
        ticketId,
        invoiceNumber: result.invoice.invoiceNumber,
        dispatchResult: result.dispatchResult,
      });
    } catch (err: any) {
      logger.error({ err }, "Error processing inbound email webhook");
      res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
    }
  }
);

/**
 * GET /admin/plan-requests/approve
 * 1-Click Instant Approval Link embedded inside Admin Notification Emails.
 * Protected by HMAC token.
 */
router.get(
  ["/admin/plan-requests/approve", "/plan-requests/approve", "/api/admin/plan-requests/approve"],
  async (req, res) => {
    try {
      const ticketId = Number(req.query.ticketId);
      const token = String(req.query.token || "");

      if (!ticketId || !token || !verifyApprovalToken(ticketId, token)) {
        res.status(403).send(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>رابط غير صالح</title>
          </head>
          <body style="font-family:'Segoe UI',Tahoma,sans-serif;margin:0;padding:40px 20px;background:#fef2f2;color:#991b1b;text-align:center;">
            <div style="max-width:500px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #fecaca;">
              <div style="font-size:48px;margin-bottom:16px;">❌</div>
              <h2 style="margin:0 0 10px;font-size:20px;">رابط التحقق غير صالح أو منتهي الصلاحية</h2>
              <p style="color:#7f1d1d;font-size:14px;line-height:1.6;margin:0 0 20px;">
                تعذر اعتماد هذا الطلب عبر الرابط لأن رمزه غير صالح أو منتهي الصلاحية أو تم استخدامه مسبقاً. يرجى تسجيل الدخول إلى لوحة تحكم الإدارة لمراجعته يدوياً.
              </p>
              <a href="/admin/tickets" style="display:inline-block;padding:10px 22px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;border-radius:8px;font-size:14px;">
                الانتقال إلى لوحة التحكم
              </a>
            </div>
          </body>
          </html>
        `);
        return;
      }

      const [ticket] = await db.select().from(ticketsTable).where(eq(ticketsTable.id, ticketId)).limit(1);

      if (!ticket) {
        res.status(404).send(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head><meta charset="utf-8"><title>الطلب غير موجود</title></head>
          <body style="font-family:'Segoe UI',Tahoma,sans-serif;margin:0;padding:40px 20px;background:#fef2f2;color:#991b1b;text-align:center;">
            <div style="max-width:500px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #fecaca;">
              <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
              <h2 style="margin:0 0 10px;font-size:20px;">الطلب رقم #${ticketId} غير موجود</h2>
            </div>
          </body>
          </html>
        `);
        return;
      }

      // Single-use restriction: If ticket is already resolved, reject duplicate approval
      if (ticket.status === "resolved") {
        res.status(409).send(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>تم اعتماد هذا الطلب مسبقاً</title>
          </head>
          <body style="margin:0;padding:40px 20px;background:#f8fafc;font-family:'Segoe UI',Tahoma,sans-serif;color:#0f172a;text-align:center;">
            <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:18px;padding:36px 32px;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
              <div style="width:68px;height:68px;background:#eff6ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;border:2px solid #bfdbfe;">
                ℹ️
              </div>
              <h1 style="margin:0 0 10px;font-size:22px;color:#1e3a8a;font-weight:800;">تم اعتماد ومعالجة هذا الطلب مسبقاً</h1>
              <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
                طلب رقم <strong>#${ticketId}</strong> تمت معالجته واعتماده مسبقاً وحالته الحالية <strong>مكتمل (${escapeHtml(ticket.status)})</strong>.<br>
                هذا الرابط مخصص للاستخدام لمرة واحدة فقط (Single-use) لمنع تكرار شحن الرصيد أو تكرار إصدار الفواتير.
              </p>
              <a href="/admin/tickets" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;font-size:14px;">
                الانتقال إلى تذاكر الإدارة
              </a>
            </div>
          </body>
          </html>
        `);
        return;
      }

      const isPaidParam = req.query.isPaid as string | undefined;

      // If payment status (Paid vs Unpaid) is not specified yet, display interactive choice page
      if (isPaidParam === undefined) {
        const [clientUser] = await db.select().from(usersTable).where(eq(usersTable.id, ticket.clientId)).limit(1);
        const clientDisplayName = clientUser?.name || "العميل";

        res.send(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>تحديد حالة سداد الفاتورة - طلب #${ticketId}</title>
          </head>
          <body style="margin:0;padding:40px 20px;background:#f8fafc;font-family:'Segoe UI',Tahoma,sans-serif;color:#0f172a;">
            <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:18px;padding:36px 32px;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #e2e8f0;text-align:center;">
              <div style="width:68px;height:68px;background:#eff6ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;border:2px solid #bfdbfe;">
                🧾
              </div>
              <h1 style="margin:0 0 8px;font-size:22px;color:#1e3a8a;font-weight:800;">اعتماد وتفعيل الباقة وإصدار الفاتورة</h1>
              <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
                طلب رقم <strong>#${ticketId}</strong> • العميل: <strong>${escapeHtml(clientDisplayName)}</strong>
              </p>

              ${
                ticket
                  ? `
                <div style="background:#f1f5f9;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:right;font-size:13px;line-height:1.7;border:1px solid #e2e8f0;">
                  <div style="font-weight:700;color:#0f172a;margin-bottom:4px;">${escapeHtml(ticket.title)}</div>
                  <div style="color:#475569;font-size:12px;">${escapeHtml(ticket.description.slice(0, 180))}${ticket.description.length > 180 ? "..." : ""}</div>
                </div>
              `
                  : ""
              }

              <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#1e293b;">
                يرجى تحديد حالة سداد الفاتورة للعميل ليتم تحديث عمود Paid في صفحة الفواتير تلقائياً:
              </p>

              <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
                <a href="${req.path}?ticketId=${ticketId}&token=${encodeURIComponent(token)}&isPaid=true" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 24px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;font-size:15px;box-shadow:0 4px 12px rgba(22,163,74,0.25);">
                  ✅ اعتماد وتفعيل كـ مسددة (Paid)
                </a>
                <a href="${req.path}?ticketId=${ticketId}&token=${encodeURIComponent(token)}&isPaid=false" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 24px;background:#d97706;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;font-size:15px;box-shadow:0 4px 12px rgba(217,119,6,0.25);">
                  ⏳ اعتماد وتفعيل كـ غير مسددة (Unpaid)
                </a>
              </div>

              <a href="/admin/tickets" style="color:#64748b;text-decoration:none;font-size:13px;">
                إلغاء والعودة للوحة التحكم
              </a>
            </div>
          </body>
          </html>
        `);
        return;
      }

      const isPaid = isPaidParam === "true";
      const result = await processApprovedPlanRequest(ticketId, {
        approvedBy: "Admin (1-Click Email Link)",
        channel: "email_button",
        isPaid,
      });

      // Mark token as consumed for single-use guarantee
      markApprovalTokenUsed(ticketId, token);

      res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>تم اعتماد وتفعيل الباقة بنجاح</title>
        </head>
        <body style="margin:0;padding:40px 20px;background:#f8fafc;font-family:'Segoe UI',Tahoma,sans-serif;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:36px 32px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
            <div style="width:72px;height:72px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:36px;border:2px solid #86efac;">
              ✅
            </div>
            <h1 style="margin:0 0 10px;font-size:22px;color:#166534;font-weight:800;">تمت الموافقة وتفعيل الباقة بنجاح!</h1>
            <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
              تم اعتماد طلب العميل <strong>${escapeHtml(result.invoice.clientName)}</strong> وتفعيل باقة <strong>${escapeHtml(result.invoice.itemNameAr)}</strong> بنجاح وتحديث الكوتا.
            </p>

            <div style="display:inline-block;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;margin-bottom:20px;${
              isPaid
                ? "background:#dcfce7;color:#166534;border:1px solid #86efac;"
                : "background:#fef3c7;color:#92400e;border:1px solid #fcd34d;"
            }">
              حالة الفاتورة في كشف الحساب: ${isPaid ? "✅ مسددة (Paid)" : "⏳ غير مسددة (Unpaid)"}
            </div>

            <div style="background:#f1f5f9;border-radius:12px;padding:18px 20px;margin-bottom:24px;text-align:right;font-size:13px;line-height:1.8;border:1px solid #e2e8f0;">
              <div>• <strong>رقم الفاتورة:</strong> #${escapeHtml(result.invoice.invoiceNumber)}</div>
              <div>• <strong>حالة السداد:</strong> ${isPaid ? "مسددة (Paid)" : "غير مسددة (Unpaid)"}</div>
              <div>• <strong>رصيد الرموز المضاف:</strong> ${result.invoice.tokenQuota.toLocaleString()} Tokens</div>
              <div>• <strong>إرسال الفاتورة عبر الإيميل:</strong> ${result.dispatchResult.emailSent ? "✅ تم الإرسال بنجاح" : "⚠️ بريد العميل أو SMTP غير متوفر"}</div>
              <div>• <strong>إرسال الفاتورة عبر الواتساب:</strong> ${result.dispatchResult.whatsappSent ? "✅ تم الإرسال عبر WhatsApp Cloud API" : "📲 تم تجهيز رابط المحادثة ومشاركتها في صندوق الوارد"}</div>
            </div>

            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
              ${
                result.dispatchResult.whatsappUrl
                  ? `<a href="${result.dispatchResult.whatsappUrl}" target="_blank" style="padding:12px 22px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;font-size:13px;">
                      💬 إرسال الفاتورة للعميل عبر الواتساب
                    </a>`
                  : ""
              }
              <a href="/admin/bills" style="padding:12px 22px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;font-size:13px;">
                📑 الانتقال إلى كشف الفواتير (Bills & Invoices)
              </a>
              <a href="/admin/tickets" style="padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;font-size:13px;">
                الانتقال إلى تذاكر الإدارة
              </a>
            </div>
          </div>
        </body>
        </html>
      `);
    } catch (err: any) {
      logger.error({ err }, "Error in GET 1-click plan approve");
      res.status(500).send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head><meta charset="utf-8"><title>حدث خطأ</title></head>
        <body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2>⚠️ حدث خطأ أثناء معالجة الطلب</h2>
          <p>${escapeHtml(err?.message || "خطأ غير متوقع")}</p>
        </body>
        </html>
      `);
    }
  }
);

export default router;
