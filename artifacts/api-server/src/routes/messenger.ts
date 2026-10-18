import { isSessionInHandoff, isHandoffRequested, triggerHandoffNotification, triggerNewMessageNotification, HANDOFF_SYSTEM_PROMPT, LEAD_GEN_SYSTEM_PROMPT, extractLeadData, METRICS_SYSTEM_PROMPT, extractMetrics } from '../lib/handoff';
import {
  notifyNewConversation,
  notifyNewLead,
  notifyNewOrder,
} from "../lib/companyNotification";
import { reportSystemMalfunction } from "../lib/malfunctions";
import { resolveCompanyAi, assertCompanyQuotaNotExceeded, type ResolvedAiConfig } from "../lib/supportAi";
import { Router } from "express";
import { db, companiesTable, chatLogsTable, leadsTable, adminConfigTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sanitizeGoogleModel, formatGeminiHistory, sanitizeOpenAiModel, buildOpenAiChatParams, sanitizeOpenRouterModel, isOpenRouterFreeModel, stripThinkingTags, getOpenRouterHeaders } from "../lib/aiModels";
import { syncConversationToSheet } from "../lib/googleSheets";
import { getKnowledgeFilesPromptSection } from "../lib/knowledgeFiles";
import { getWebsiteKnowledgeSection } from "../lib/websiteSync";
import { getWordPressKnowledgeSection } from "../lib/wordpressSync";
import { getRestApiKnowledgeSection } from "../lib/restApiSync";
import { getShopifyKnowledgeSection } from "../lib/shopifySync";
import { LANGUAGE_MATCH_INSTRUCTION, OUTPUT_FORMAT_INSTRUCTION } from "../lib/promptInstructions";
import { enforceResponseLanguage, getLanguageInstruction, localizedChannelMessage } from "../lib/language";
import { webhookLimiter } from "../lib/security";
import { verifyMetaWebhookSignature } from "../lib/webhookSecurity";

import crypto from 'crypto';

const router = Router();

async function callAI(company: typeof companiesTable.$inferSelect, userMessage: string, history: { role: "user" | "assistant"; content: string }[], overrideAiConfig?: ResolvedAiConfig): Promise<string> {
  const { apiKey, provider, model } = overrideAiConfig ?? await resolveCompanyAi(company);
  

  let sysContent = company.systemPrompt ?? "";
  sysContent += HANDOFF_SYSTEM_PROMPT;
  sysContent += LEAD_GEN_SYSTEM_PROMPT;
  sysContent += METRICS_SYSTEM_PROMPT;
    if (company.securityPrompt) sysContent += `\n\nSecurity Instructions:\n${company.securityPrompt}`;
  sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
  sysContent += `\n\n${getLanguageInstruction(userMessage)}`;
  sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
  if (company.generalInfo) sysContent += `\n\nCompany Info:\n${company.generalInfo}`;

  sysContent += await getWebsiteKnowledgeSection(company);
  sysContent += await getWordPressKnowledgeSection(company.id);
  sysContent += await getRestApiKnowledgeSection(company.id);
  sysContent += await getShopifyKnowledgeSection(company.id);
  sysContent += await getKnowledgeFilesPromptSection(company.id, userMessage);

  

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model, max_tokens: 1024,
      system: sysContent || undefined,
      messages: [
        ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user" as const, content: userMessage },
      ],
    });
    return (resp.content?.[0] as any)?.text || "";

  } else if (provider === "google") {
    const genAI = new GoogleGenerativeAI(apiKey);
    const effectiveModel = sanitizeGoogleModel(model);
    const genModel = genAI.getGenerativeModel({
      model: effectiveModel,
      systemInstruction: sysContent || undefined,
    });
    const chat = genModel.startChat({
      history: formatGeminiHistory(history),
    });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();

  } else if (provider === "openrouter") {
    const openrouter = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: getOpenRouterHeaders(),
    });
    const effectiveModel = sanitizeOpenRouterModel(model);
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sysContent) msgs.push({ role: "system", content: sysContent });
    history.forEach(h => msgs.push({ role: h.role, content: h.content }));
    msgs.push({ role: "user", content: userMessage });
    let completion;
    try {
      completion = await openrouter.chat.completions.create({
        model: effectiveModel,
        messages: msgs,
        max_tokens: 1024,
      });
    } catch (err: any) {
      if (isOpenRouterFreeModel(effectiveModel) && effectiveModel !== "openrouter/free") {
        logger.warn({ effectiveModel, err: err?.message }, "OpenRouter free model error in Messenger; falling back to openrouter/free");
        completion = await openrouter.chat.completions.create({
          model: "openrouter/free",
          messages: msgs,
          max_tokens: 1024,
        });
      } else {
        throw err;
      }
    }
    const reply = completion.choices?.[0]?.message?.content || "";
    return stripThinkingTags(reply);

  } else {
    const openai = new OpenAI({ apiKey });
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sysContent) msgs.push({ role: "system", content: sysContent });
    history.forEach(h => msgs.push({ role: h.role, content: h.content }));
    msgs.push({ role: "user", content: userMessage });
    const completion = await openai.chat.completions.create(
      buildOpenAiChatParams(model, msgs, { maxTokens: 1024 })
    );
    return (completion.choices?.[0]?.message?.content || "") as string;
  }
}

export async function sendMessengerMessage(pageAccessToken: string, recipientId: string, text: string) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });
}

/**
 * GET /messenger/webhook
 *
 * Platform-level webhook verification handshake (no page ID in URL).
 * In the Meta App Dashboard set:
 *   Webhook URL   â†’ <your-domain>/api/messenger/webhook
 *   Verify Token  â†’ the token generated in Admin â†’ Security / Webhook Settings
 *
 * Meta sends hub.verify_token which we check against the stored platform token.
 */
router.get("/messenger/webhook", webhookLimiter, async (req, res) => {
  try {
    const mode        = req.query["hub.mode"];
    const verifyToken = req.query["hub.verify_token"];
    const challenge   = req.query["hub.challenge"];

    if (mode !== "subscribe") {
      res.sendStatus(403);
      return;
    }

    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "messenger_verify_token"));

    if (!row?.value || verifyToken !== row.value) {
      res.sendStatus(403);
      return;
    }

    res.status(200).send(challenge);
  } catch (err) {
    logger.error({ err }, "Messenger platform webhook verification error");
    res.sendStatus(500);
  }
});

/**
 * POST /messenger/webhook
 *
 * Platform-level incoming Messenger events. Extracts the Page ID from
 * entry[].id in the payload and routes to the matching company.
 */
router.post("/messenger/webhook", webhookLimiter, verifyMetaWebhookSignature, async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body as {
      entry?: { id?: string; messaging?: { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } }[] }[];
    };

    const companies = await db.select().from(companiesTable);

    for (const entry of body.entry ?? []) {
      const pageId  = entry.id;
      const company = companies.find(c => c.messengerPageId === pageId);

      if (!company) {
        logger.warn({ pageId }, "Messenger platform webhook: no company matched page ID");
        continue;
      }

      if (!company.messengerApiKey) {
        logger.warn({ pageId, companyId: company.id }, "Messenger platform webhook: company has no Page Access Token");
        continue;
      }

      for (const event of entry.messaging ?? []) {
        const senderId = event.sender?.id;
        const userText = event.message?.text;
        if (!senderId || !userText || event.message?.is_echo) continue;

        const sessionId = `fb_${senderId}`;

        if (!company.isActive) {
          await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
            userText,
            "âš ï¸ Ù‡Ø°Ù‡ Ø§Ù„Ø®Ø¯Ù…Ø© ØºÙŠØ± Ù†Ø´Ø·Ø© Ø­Ø§Ù„ÙŠÙ‹Ø§. ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ø¯Ø¹Ù….",
            "âš ï¸ This chatbot is currently inactive. Please contact support.",
          ));
          continue;
        }

        let aiConfig: ResolvedAiConfig;
        try {
          await assertCompanyQuotaNotExceeded(company);
          aiConfig = await resolveCompanyAi(company);
        } catch (configErr: any) {
          void reportSystemMalfunction(
            `AI Unavailable for ${company.name} (Messenger)`,
            configErr?.message || "AI configuration failed or token quota not allocated",
            company.id,
            configErr
          );
          await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
            userText,
            "نعتذر، المساعد الذكي غير متاح حالياً. يرجى التواصل مع فريق خدمة العملاء مباشرة.",
            "We apologize, the smart assistant is currently unavailable. Please contact customer support directly.",
          ));
          continue;
        }

        const priorLogs = await db
          .select()
          .from(chatLogsTable)
          .where(and(eq(chatLogsTable.companyId, company.id), eq(chatLogsTable.sessionId, sessionId)))
          .orderBy(asc(chatLogsTable.createdAt))
          .limit(20);

        if (!priorLogs || priorLogs.length === 0) {
          notifyNewConversation(
            { id: company.id, name: company.name },
            { channel: "messenger", sessionId, initialMessage: userText }
          ).catch((e) => logger.warn({ err: e, companyId: company.id }, "Messenger new conversation email failed"));
        }

        const history: { role: "user" | "assistant"; content: string }[] = [];
        for (const log of priorLogs) {
          history.push({ role: "user", content: log.customerMessage });
          if (log.botResponse) history.push({ role: "assistant", content: log.botResponse });
        }

        
    if (isSessionInHandoff(priorLogs)) {
            await db.insert(chatLogsTable).values({
              companyId: company.id,
              channel: "messenger",
              sessionId,
              customerMessage: userText,
              botResponse: null,
              isHandoff: true
            });

    // Notify client of new message
    triggerNewMessageNotification(company, sessionId, "messenger", userText);
            return;
          }

    let rawReply: string;
    try {
      rawReply = await callAI(company, userText, history, aiConfig);
    } catch (aiErr: any) {
      void reportSystemMalfunction(
        `Messenger AI Generation Error: ${company.name}`,
        aiErr?.message || "Failed to generate AI response",
        company.id,
        aiErr
      );
      await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
        userText,
        "نعتذر، حدث خطأ في معالجة الرد الذكي. يرجى المحاولة مرة أخرى لاحقاً.",
        "We apologize, an error occurred while generating the AI response. Please try again later.",
      ));
      continue;
    }
    const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);
    const { cleanResponse, metrics } = extractMetrics(tempResponse);
    
    let aiReply = enforceResponseLanguage(cleanResponse, userText);
    let isHandoff = false;

    if (isHandoffRequested(userText, rawReply, aiReply)) {
      aiReply = localizedChannelMessage(userText, "سيتم وضعك في قائمة الانتظار.", "You will be placed on the waiting list.");
      isHandoff = true;
      triggerHandoffNotification(company, sessionId, "messenger");
    }

    if (leadData && sessionId && typeof sessionId === "string") {
      let existingLead = null;

      // 1. Try to find by phone (if provided) to merge leads across channels/sessions
      if (leadData.phone) {
        const [byPhone] = await db
          .select()
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.companyId, company.id),
              eq(leadsTable.phone, leadData.phone)
            )
          )
          .limit(1);
        if (byPhone) existingLead = byPhone;
      }

      // 2. If not found by phone, try to find by current sessionId
      if (!existingLead) {
        const [bySession] = await db
          .select()
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.companyId, company.id),
              eq(leadsTable.sessionId, sessionId)
            )
          )
          .limit(1);
        if (bySession) existingLead = bySession;
      }

      if (existingLead) {
        // Only update the phone if we didn't have one before and we just got one,
        // or if we matched by sessionId and the phone is changing.
        // Also update sessionId to the latest one so future messages track correctly.
        await db
          .update(leadsTable)
          .set({
            name: leadData.name || existingLead.name,
            email: leadData.email || existingLead.email,
            phone: leadData.phone || existingLead.phone,
            interest: leadData.interest || existingLead.interest,
            sessionId: sessionId,
            channel: "messenger" // Update channel to the most recent one used
          })
          .where(eq(leadsTable.id, existingLead.id));
      } else {
        await db.insert(leadsTable).values({
          companyId: company.id,
          channel: "messenger",
          sessionId,
          name: leadData.name || null,
          email: leadData.email || null,
          phone: leadData.phone || null,
          interest: leadData.interest || null,
        });

        // Event 3: New lead
        notifyNewLead(
          { id: company.id, name: company.name },
          {
            name: leadData.name || null,
            email: leadData.email || null,
            phone: leadData.phone || null,
            interest: leadData.interest || null,
            channel: "messenger",
            sessionId,
          }
        ).catch((e) => logger.warn({ err: e, companyId: company.id }, "Messenger new lead email failed"));
      }
    }

    // Event 5: New order
    const orderKeywords = ["طلب جديد", "شراء", "اشتريت", "طلبية", "order", "purchase"];
    const isOrderDetected =
      metrics?.intent === "purchase" ||
      (metrics?.intent as string) === "order" ||
      orderKeywords.some(k => userText.toLowerCase().includes(k) || (leadData?.interest && leadData.interest.toLowerCase().includes(k)));

    if (isOrderDetected) {
      notifyNewOrder(
        { id: company.id, name: company.name },
        {
          customerName: leadData?.name || null,
          customerEmail: leadData?.email || null,
          customerPhone: leadData?.phone || null,
          items: leadData?.interest || userText.trim(),
          notes: `Detected via Messenger chat (${sessionId})`,
          channel: "messenger",
        }
      ).catch((e) => logger.warn({ err: e, companyId: company.id }, "Messenger new order email failed"));
    }

    await db.insert(chatLogsTable).values({
      companyId: company.id,
      channel: "messenger",
      sessionId,
      customerMessage: userText,
      botResponse: aiReply,
      isHandoff,
      sentiment: metrics?.sentiment || null,
      intent: metrics?.intent || null,
    });
    triggerNewMessageNotification(company, sessionId, "messenger", userText);

        await sendMessengerMessage(company.messengerApiKey, senderId, aiReply);

        void syncConversationToSheet(company, [
          ...history,
          { role: "user", content: userText },
          { role: "assistant", content: aiReply },
        ]);

        logger.info({ companyId: company.id, senderId, sessionId }, "Messenger platform message handled");
      }
    }
  } catch (err) {
    logger.error({ err }, "Messenger platform webhook error");
  }
});

/**
 * GET /messenger/webhook/:pageId
 *
 * Per-company webhook verification (legacy â€” kept for backwards compatibility).
 * Verify Token = Page Access Token stored in company settings.
 */
router.get("/messenger/webhook/:pageId", async (req, res) => {
  try {
    const { pageId } = req.params;
    const mode        = req.query["hub.mode"];
    const verifyToken = req.query["hub.verify_token"];
    const challenge   = req.query["hub.challenge"];

    if (mode !== "subscribe") {
      res.sendStatus(403);
      return;
    }

    const companies = await db.select().from(companiesTable);
    const company   = companies.find(c => c.messengerPageId === pageId);

    if (!company || !company.messengerApiKey || verifyToken !== company.messengerApiKey) {
      res.sendStatus(403);
      return;
    }

    res.status(200).send(challenge);
  } catch (err) {
    logger.error({ err }, "Messenger webhook verification error");
    res.sendStatus(500);
  }
});

/**
 * POST /messenger/webhook/:pageId
 *
 * Receives incoming Messenger events from Meta.
 * Looks up the company by Page ID, processes the message through the AI pipeline,
 * and sends the reply back to the user via the Graph API.
 */
router.post("/messenger/webhook/:pageId", webhookLimiter, verifyMetaWebhookSignature, async (req, res) => {
  res.sendStatus(200);

  let company: typeof companiesTable.$inferSelect | undefined;
  try {
    const { pageId } = req.params;
    const body = req.body as {
      entry?: { messaging?: { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } }[] }[];
    };

    const companies = await db.select().from(companiesTable);
    const foundCompany = companies.find(c => c.messengerPageId === pageId);

    if (!foundCompany) {
      logger.warn({ pageId }, "Messenger webhook: no company matched page ID");
      return;
    }
    company = foundCompany;
    const currentCompany = foundCompany;

    if (!company.messengerApiKey) {
      logger.warn({ pageId, companyId: company.id }, "Messenger webhook: company has no Page Access Token");
      return;
    }

    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const senderId = event.sender?.id;
        const userText = event.message?.text;
        if (!senderId || !userText || event.message?.is_echo) continue;

        const sessionId = `fb_${senderId}`;

        if (!company.isActive) {
          await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
            userText,
            "âš ï¸ Ù‡Ø°Ù‡ Ø§Ù„Ø®Ø¯Ù…Ø© ØºÙŠØ± Ù†Ø´Ø·Ø© Ø­Ø§Ù„ÙŠÙ‹Ø§. ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ø¯Ø¹Ù….",
            "âš ï¸ This chatbot is currently inactive. Please contact support.",
          ));
          continue;
        }

        let aiConfig: ResolvedAiConfig;
        try {
          await assertCompanyQuotaNotExceeded(company);
          aiConfig = await resolveCompanyAi(company);
        } catch (configErr: any) {
          void reportSystemMalfunction(
            `AI Unavailable for ${company.name} (Custom Messenger)`,
            configErr?.message || "AI configuration failed or token quota not allocated",
            company.id,
            configErr
          );
          await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
            userText,
            "نعتذر، المساعد الذكي غير متاح حالياً. يرجى التواصل مع فريق خدمة العملاء مباشرة.",
            "We apologize, the smart assistant is currently unavailable. Please contact customer support directly.",
          ));
          continue;
        }

        const priorLogs = await db
          .select()
          .from(chatLogsTable)
          .where(and(eq(chatLogsTable.companyId, company.id), eq(chatLogsTable.sessionId, sessionId)))
          .orderBy(asc(chatLogsTable.createdAt))
          .limit(20);

        if (!priorLogs || priorLogs.length === 0) {
          notifyNewConversation(
            { id: currentCompany.id, name: currentCompany.name },
            { channel: "messenger", sessionId, initialMessage: userText }
          ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Custom Messenger new conversation email failed"));
        }

        const history: { role: "user" | "assistant"; content: string }[] = [];
        for (const log of priorLogs) {
          history.push({ role: "user", content: log.customerMessage });
          if (log.botResponse) history.push({ role: "assistant", content: log.botResponse });
        }

        if (isSessionInHandoff(priorLogs)) {
            await db.insert(chatLogsTable).values({
              companyId: company.id,
              channel: "messenger",
              sessionId,
              customerMessage: userText,
              botResponse: null,
              isHandoff: true
            });
            return;
          }

        let rawReply: string;
        try {
          rawReply = await callAI(company, userText, history, aiConfig);
        } catch (aiErr: any) {
          void reportSystemMalfunction(
            `Custom Messenger AI Generation Error: ${company.name}`,
            aiErr?.message || "Failed to generate AI response",
            company.id,
            aiErr
          );
          await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
            userText,
            "نعتذر، حدث خطأ في معالجة الرد الذكي. يرجى المحاولة مرة أخرى لاحقاً.",
            "We apologize, an error occurred while generating the AI response. Please try again later.",
          ));
          continue;
        }
        const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);
        const { cleanResponse, metrics } = extractMetrics(tempResponse);
        let aiReply = enforceResponseLanguage(cleanResponse, userText);
        let isHandoff = false;

        if (isHandoffRequested(userText, rawReply, aiReply)) {
      aiReply = localizedChannelMessage(userText, "سيتم وضعك في قائمة الانتظار.", "You will be placed on the waiting list.");
      isHandoff = true;
      triggerHandoffNotification(company, sessionId, "messenger");
    }

        if (leadData && sessionId && typeof sessionId === "string") {
      let existingLead = null;

      // 1. Try to find by phone (if provided) to merge leads across channels/sessions
      if (leadData.phone) {
        const [byPhone] = await db
          .select()
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.companyId, company.id),
              eq(leadsTable.phone, leadData.phone)
            )
          )
          .limit(1);
        if (byPhone) existingLead = byPhone;
      }

      // 2. If not found by phone, try to find by current sessionId
      if (!existingLead) {
        const [bySession] = await db
          .select()
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.companyId, company.id),
              eq(leadsTable.sessionId, sessionId)
            )
          )
          .limit(1);
        if (bySession) existingLead = bySession;
      }

      if (existingLead) {
        // Only update the phone if we didn't have one before and we just got one,
        // or if we matched by sessionId and the phone is changing.
        // Also update sessionId to the latest one so future messages track correctly.
        await db
          .update(leadsTable)
          .set({
            name: leadData.name || existingLead.name,
            email: leadData.email || existingLead.email,
            phone: leadData.phone || existingLead.phone,
            interest: leadData.interest || existingLead.interest,
            sessionId: sessionId,
            channel: "messenger" // Update channel to the most recent one used
          })
          .where(eq(leadsTable.id, existingLead.id));
      } else {
        await db.insert(leadsTable).values({
          companyId: company.id,
          channel: "messenger",
          sessionId,
          name: leadData.name || null,
          email: leadData.email || null,
          phone: leadData.phone || null,
          interest: leadData.interest || null,
        });

        // Event 3: New lead
        notifyNewLead(
          { id: currentCompany.id, name: currentCompany.name },
          {
            name: leadData.name || null,
            email: leadData.email || null,
            phone: leadData.phone || null,
            interest: leadData.interest || null,
            channel: "messenger",
            sessionId,
          }
        ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Custom Messenger new lead email failed"));
      }
    }

    // Event 5: New order
    const orderKeywords = ["طلب جديد", "شراء", "اشتريت", "طلبية", "order", "purchase"];
    const isOrderDetected =
      metrics?.intent === "purchase" ||
      (metrics?.intent as string) === "order" ||
      orderKeywords.some(k => userText.toLowerCase().includes(k) || (leadData?.interest && leadData.interest.toLowerCase().includes(k)));

    if (isOrderDetected) {
      notifyNewOrder(
        { id: currentCompany.id, name: currentCompany.name },
        {
          customerName: leadData?.name || null,
          customerEmail: leadData?.email || null,
          customerPhone: leadData?.phone || null,
          items: leadData?.interest || userText.trim(),
          notes: `Detected via Custom Messenger chat (${sessionId})`,
          channel: "messenger",
        }
      ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Custom Messenger new order email failed"));
    }

        await db.insert(chatLogsTable).values({
          companyId: company.id,
          channel: "messenger",
          sessionId,
          customerMessage: userText,
          botResponse: aiReply,
          isHandoff,
          sentiment: metrics?.sentiment || null,
          intent: metrics?.intent || null
        });
        triggerNewMessageNotification(company, sessionId, "messenger", userText);

        await sendMessengerMessage(company.messengerApiKey, senderId, aiReply);

        void syncConversationToSheet(company, [
          ...history,
          { role: "user", content: userText },
          { role: "assistant", content: aiReply },
        ]);

        logger.info({ companyId: company.id, senderId, sessionId }, "Messenger message handled");
      }
    }
  } catch (err) {
      logger.error({ err }, "Messenger webhook error");
      if (company && company.id) {
        void reportSystemMalfunction(
          "عطل في ربط ماسنجر (Messenger Webhook Error)",
          "حدث خطأ غير متوقع أثناء معالجة رسالة عبر ماسنجر. قد يكون هناك مشكلة في توكن الربط أو تعطل مؤقت في الخدمة.",
          company.id,
          err
        );
      }
    }
});

export default router;


