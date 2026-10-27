import { Router } from "express";
import { db, companiesTable, chatLogsTable, leadsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
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
import { LANGUAGE_MATCH_INSTRUCTION, OUTPUT_FORMAT_INSTRUCTION, ANTI_HALLUCINATION_INSTRUCTION } from "../lib/promptInstructions";
import { detectResponseLanguage, enforceResponseLanguage, getLanguageInstruction, localizedChannelMessage } from "../lib/language";
import { webhookLimiter } from "../lib/security";

const router = Router();

async function callAI(
  company: typeof companiesTable.$inferSelect,
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
  overrideAiConfig?: ResolvedAiConfig
): Promise<string> {
  const { apiKey, provider, model } = overrideAiConfig ?? await resolveCompanyAi(company);

  let sysContent = company.systemPrompt ?? "";
  sysContent += HANDOFF_SYSTEM_PROMPT;
  sysContent += LEAD_GEN_SYSTEM_PROMPT;
  sysContent += METRICS_SYSTEM_PROMPT;
  if (company.securityPrompt) sysContent += `\n\nSecurity Instructions:\n${company.securityPrompt}`;
  sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
  sysContent += `\n\n${getLanguageInstruction(userMessage)}`;
  sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
  sysContent += `\n\n${ANTI_HALLUCINATION_INSTRUCTION}`;
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
 * Universal channel webhook endpoint supporting:
 * - telegram, whatsapp, messenger, website
 * - Phase 1: Fetch context (systemPrompt, securityPrompt, conversationHistory, inHandoff)
 * - Phase 2: Store conversation turns
 * - Automatic AI reply generation with full multi-source knowledge retrieval,
 *   quota enforcement, lead extraction, and human handoff checks.
 */
router.post(["/webhook/message", "/webhook"], webhookLimiter, async (req, res) => {
  try {
    const parsed = IngestChatMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.issues.map((i: { message: string }) => i.message).join(", "),
      });
      return;
    }

    const { apiKey, channel, customerMessage, botResponse, sessionId } = parsed.data;
    const cleanApiKey = (apiKey || "").trim();
    const isContextOnly = (req.body as any)?.contextOnly === true || (req.body as any)?.autoGenerate === false;

    // Match company by channel key
    const channelKeyColumn = {
      telegram: companiesTable.telegramBotApiKey,
      whatsapp: companiesTable.whatsappApiToken,
      messenger: companiesTable.messengerApiKey,
      website: companiesTable.websiteChatbotKey,
    }[channel];

    let [company] = channelKeyColumn
      ? await db.select().from(companiesTable).where(eq(channelKeyColumn, cleanApiKey)).limit(1)
      : [];

    // Fallback: match by websiteChatbotKey as universal company key
    if (!company && cleanApiKey) {
      [company] = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.websiteChatbotKey, cleanApiKey))
        .limit(1);
    }

    if (!company) {
      res.status(401).json({ error: "Invalid API key for this channel" });
      return;
    }

    if (!company.isActive) {
      res.status(403).json({ error: "Company account is currently inactive" });
      return;
    }

    const normalizedBotResponse = botResponse
      ? enforceResponseLanguage(botResponse, customerMessage)
      : undefined;

    // Fetch prior turns for this session
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    let priorLogs: (typeof chatLogsTable.$inferSelect)[] = [];

    if (sessionId) {
      priorLogs = await db
        .select()
        .from(chatLogsTable)
        .where(
          and(
            eq(chatLogsTable.companyId, company.id),
            eq(chatLogsTable.sessionId, sessionId)
          )
        )
        .orderBy(asc(chatLogsTable.createdAt))
        .limit(20);

      if (!priorLogs || priorLogs.length === 0) {
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
    }

    const inHandoff = isSessionInHandoff(priorLogs);

    // If session is already in human handoff
    if (inHandoff && !normalizedBotResponse) {
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

    // Phase 2 — If caller provided botResponse directly, store the turn
    if (normalizedBotResponse) {
      const { cleanResponse: tempResponse, leadData } = extractLeadData(normalizedBotResponse);
      const { cleanResponse } = extractMetrics(tempResponse);
      const isHandoff = isHandoffRequested(customerMessage, normalizedBotResponse, cleanResponse);

      if (isHandoff && sessionId) {
        triggerHandoffNotification(company, sessionId, channel).catch((e) =>
          logger.warn({ err: e }, "Webhook handoff notification failed")
        );
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

      const [log] = await db
        .insert(chatLogsTable)
        .values({
          companyId: company.id,
          channel: channel as "telegram" | "whatsapp" | "messenger" | "website",
          sessionId: sessionId ?? null,
          customerMessage,
          botResponse: cleanResponse,
          isHandoff,
        })
        .returning();

      void syncConversationToSheet(company, [
        ...conversationHistory,
        { role: "user", content: customerMessage },
        { role: "assistant", content: cleanResponse },
      ]);

      triggerNewMessageNotification(company, sessionId ?? "webhook", channel, customerMessage);

      req.log.info({ companyId: company.id, channel, sessionId }, "Chat log stored via webhook");

      res.status(201).json({
        id: log.id,
        companyId: log.companyId,
        channel: log.channel,
        sessionId: log.sessionId ?? null,
        createdAt: log.createdAt.toISOString(),
        systemPrompt: company.systemPrompt ?? null,
        securityPrompt: company.securityPrompt ?? null,
        botResponse: cleanResponse,
        conversationHistory,
        inHandoff,
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
      const rawReply = await callAI(company, customerMessage, conversationHistory, aiConfig);
      const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);
      const { cleanResponse } = extractMetrics(tempResponse);

      let aiReply = enforceResponseLanguage(cleanResponse, customerMessage);
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

export default router;
