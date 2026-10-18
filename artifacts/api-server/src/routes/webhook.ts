import { Router } from "express";
import { db, companiesTable, chatLogsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { IngestChatMessageBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { triggerNewMessageNotification } from "../lib/handoff";
import { notifyNewConversation } from "../lib/companyNotification";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sanitizeGoogleModel, formatGeminiHistory, sanitizeOpenAiModel, buildOpenAiChatParams, sanitizeOpenRouterModel, isOpenRouterFreeModel, stripThinkingTags, getOpenRouterHeaders, sanitizeAnthropicModel, isAnthropicFreeModel, formatAnthropicMessages, extractAnthropicText } from "../lib/aiModels";
import { syncConversationToSheet } from "../lib/googleSheets";
import { getKnowledgeFilesPromptSection } from "../lib/knowledgeFiles";
import { LANGUAGE_MATCH_INSTRUCTION, OUTPUT_FORMAT_INSTRUCTION } from "../lib/promptInstructions";
import { detectResponseLanguage, enforceResponseLanguage, getLanguageInstruction } from "../lib/language";
import { isSafeUrl, webhookLimiter } from "../lib/security";

const router = Router();

/**
 * POST /webhook/message
 *
 * Two-phase usage for multi-turn AI chatbots:
 *
 * Phase 1 — Fetch context (BEFORE generating a reply):
 *   POST with customerMessage only (no botResponse).
 *   Nothing is stored. Response returns systemPrompt + conversationHistory.
 *   Use these to build your AI prompt, then generate the bot reply.
 *
 * Phase 2 — Store the turn (AFTER generating a reply):
 *   POST with both customerMessage and botResponse.
 *   The complete turn is saved and will appear in future history calls.
 *
 * sessionId:   Optional string grouping messages into a conversation thread.
 *              Use any stable identifier (Telegram chat_id, phone number, etc.)
 *
 * apiKey:      Channel-specific key from company settings:
 *              telegram  → telegramBotApiKey
 *              whatsapp  → whatsappApiToken
 *              messenger → messengerApiKey
 *              website   → websiteChatbotKey
 */
router.post("/webhook/message", webhookLimiter, async (req, res) => {
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
    const normalizedBotResponse = botResponse
      ? enforceResponseLanguage(botResponse, customerMessage)
      : undefined;

    // Match company by channel key
    const channelKeyColumn = {
      telegram: companiesTable.telegramBotApiKey,
      whatsapp: companiesTable.whatsappApiToken,
      messenger: companiesTable.messengerApiKey,
      website: companiesTable.websiteChatbotKey,
    }[channel];

    const [company] = channelKeyColumn
      ? await db.select().from(companiesTable).where(eq(channelKeyColumn, apiKey)).limit(1)
      : [];

    if (!company) {
      res.status(401).json({ error: "Invalid API key for this channel" });
      return;
    }

    // Fetch prior turns for this session
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (sessionId) {
      const priorLogs = await db
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
        ).catch((e) => logger.warn({ err: e, companyId: company.id }, "Webhook new conversation email failed"));
      }

      for (const log of priorLogs) {
        conversationHistory.push({ role: "user", content: log.customerMessage });
        if (log.botResponse) {
          conversationHistory.push({ role: "assistant", content: log.botResponse });
        }
      }
    }

    // Auto-generate AI response if company has an API key and no botResponse provided
    if (!normalizedBotResponse && company.aiAgentApiKey) {
      try {
        const provider = company.aiProvider ?? "openai";
        const model = company.aiModel ?? (
          provider === "anthropic" ? "claude-3-5-haiku-20241022" :
          provider === "google" ? "gemini-1.5-flash" :
          provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini"
        );

        let sysContent = company.systemPrompt ?? "";
    if (company.securityPrompt) sysContent += `\n\nSecurity Instructions:\n${company.securityPrompt}`;
        sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
        sysContent += `\n\n${getLanguageInstruction(customerMessage)}`;
        sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
        if (company.generalInfo) {
          sysContent += `\n\nCompany Info:\n${company.generalInfo}`;
        }

        if (company.websiteDataUrl) {
          try {
            if (!isSafeUrl(company.websiteDataUrl)) {
              logger.warn({ url: company.websiteDataUrl }, "webhook fetch websiteDataUrl blocked: points to internal address");
            } else {
              const siteRes = await fetch(company.websiteDataUrl, {
                headers: { "User-Agent": "ChatbotAgent/1.0" },
                signal: AbortSignal.timeout(6000),
              });
              if (siteRes.ok) {
                const rawText = await siteRes.text();
                const cleaned = rawText
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s{2,}/g, " ")
                  .trim()
                  .slice(0, 6000);
                if (cleaned) {
                  sysContent += `\n\nWebsite Knowledge Base (from ${company.websiteDataUrl}):\n${cleaned}`;
                }
              }
            }
          } catch (fetchErr) {
            logger.warn({ fetchErr, url: company.websiteDataUrl }, "Failed to fetch websiteDataUrl for webhook");
          }
        }

        sysContent += await getKnowledgeFilesPromptSection(company.id, customerMessage);

        let aiReply = "";

        if (provider === "anthropic") {
          const anthropic = new Anthropic({ apiKey: company.aiAgentApiKey });
          const effectiveModel = sanitizeAnthropicModel(model);
          const anthropicMsgs = formatAnthropicMessages(conversationHistory, customerMessage);
          let response;
          try {
            response = await anthropic.messages.create({
              model: effectiveModel,
              max_tokens: 1024,
              system: sysContent || undefined,
              messages: anthropicMsgs,
            });
          } catch (err: any) {
            if (isAnthropicFreeModel(effectiveModel)) {
              if (effectiveModel !== "claude-3-5-haiku-20241022") {
                logger.warn({ effectiveModel, err: err?.message }, "Anthropic free model error in webhook; falling back to claude-3-5-haiku-20241022");
                response = await anthropic.messages.create({
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
              response = await anthropic.messages.create({
                model: fallbackPaidModel,
                max_tokens: 1024,
                system: sysContent || undefined,
                messages: anthropicMsgs,
              });
            }
          }
          aiReply = extractAnthropicText(response.content);

        } else if (provider === "google") {
          const genAI = new GoogleGenerativeAI(company.aiAgentApiKey);
          const effectiveModel = sanitizeGoogleModel(model);
          const genModel = genAI.getGenerativeModel({
            model: effectiveModel,
            systemInstruction: sysContent || undefined,
          });
          const history = formatGeminiHistory(conversationHistory);
          const chat = genModel.startChat({ history });
          const result = await chat.sendMessage(customerMessage);
          aiReply = result.response.text();

        } else if (provider === "openrouter") {
          const openrouter = new OpenAI({
            apiKey: company.aiAgentApiKey,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: getOpenRouterHeaders(),
          });
          const effectiveModel = sanitizeOpenRouterModel(model);
          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
          if (sysContent) messages.push({ role: "system", content: sysContent });
          for (const turn of conversationHistory) {
            messages.push({ role: turn.role, content: turn.content });
          }
          messages.push({ role: "user", content: customerMessage });
          let completion;
          try {
            completion = await openrouter.chat.completions.create({
              model: effectiveModel,
              messages,
              max_tokens: 1024,
            });
          } catch (err: any) {
            if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
              logger.warn({ effectiveModel, err: err?.message }, "OpenRouter free model error in webhook; falling back to openrouter/free");
              completion = await openrouter.chat.completions.create({
                model: "openrouter/free",
                messages,
                max_tokens: 1024,
              });
            } else {
              throw err;
            }
          }
          aiReply = stripThinkingTags(completion.choices[0]?.message?.content ?? "");

        } else {
          const openai = new OpenAI({ apiKey: company.aiAgentApiKey });
          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
          if (sysContent) messages.push({ role: "system", content: sysContent });
          for (const turn of conversationHistory) {
            messages.push({ role: turn.role, content: turn.content });
          }
          messages.push({ role: "user", content: customerMessage });
          const completion = await openai.chat.completions.create(
            buildOpenAiChatParams(model, messages, { maxTokens: 1024 })
          );
          aiReply = completion.choices[0]?.message?.content ?? "";
        }

        aiReply = enforceResponseLanguage(aiReply, customerMessage);

        const [aiLog] = await db
          .insert(chatLogsTable)
          .values({
            companyId: company.id,
            channel: channel as "telegram" | "whatsapp" | "messenger" | "website",
            sessionId: sessionId ?? null,
            customerMessage,
            botResponse: aiReply,
          })
          .returning();

        void syncConversationToSheet(company, [
          ...conversationHistory,
          { role: "user", content: customerMessage },
          { role: "assistant", content: aiReply },
        ]);

        triggerNewMessageNotification(company, sessionId ?? "webhook", channel, customerMessage);

        req.log.info({ companyId: company.id, channel, sessionId, provider, model }, "AI response generated and stored");

        res.status(201).json({
          id: aiLog.id,
          companyId: aiLog.companyId,
          channel: aiLog.channel,
          sessionId: aiLog.sessionId ?? null,
          createdAt: aiLog.createdAt.toISOString(),
          systemPrompt: company.systemPrompt ?? null,
          botResponse: aiReply,
          conversationHistory,
        });
      } catch (aiErr) {
        logger.error({ aiErr }, "AI generation failed");
        res.status(200).json({
          id: null,
          companyId: company.id,
          channel,
          sessionId: sessionId ?? null,
          createdAt: new Date().toISOString(),
          systemPrompt: company.systemPrompt ?? null,
          conversationHistory,
          error: detectResponseLanguage(customerMessage) === "Arabic"
            ? "تعذر إعداد الرد. يرجى التحقق من إعدادات الذكاء الاصطناعي."
            : "AI generation failed — check your API key and model selection.",
        });
      }
      return;
    }

    // Phase 1 — context fetch only, nothing stored (no botResponse, no OpenAI key)
    if (!normalizedBotResponse) {
      req.log.info({ companyId: company.id, channel, sessionId }, "Webhook context fetch (no botResponse)");
      res.status(200).json({
        id: null,
        companyId: company.id,
        channel,
        sessionId: sessionId ?? null,
        createdAt: new Date().toISOString(),
        systemPrompt: company.systemPrompt ?? null,
        conversationHistory,
      });
      return;
    }

    // Phase 2 — store the complete turn
    const [log] = await db
      .insert(chatLogsTable)
      .values({
        companyId: company.id,
        channel: channel as "telegram" | "whatsapp" | "messenger" | "website",
        sessionId: sessionId ?? null,
        customerMessage,
        botResponse: normalizedBotResponse,
      })
      .returning();

    void syncConversationToSheet(company, [
      ...conversationHistory,
      { role: "user", content: customerMessage },
      { role: "assistant", content: normalizedBotResponse },
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
      conversationHistory,
    });
  } catch (err) {
    logger.error({ err }, "Webhook ingest error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
