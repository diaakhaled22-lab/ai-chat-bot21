import { isSessionInHandoff, isHandoffRequested, triggerHandoffNotification, triggerNewMessageNotification, HANDOFF_SYSTEM_PROMPT, LEAD_GEN_SYSTEM_PROMPT, extractLeadData, METRICS_SYSTEM_PROMPT, extractMetrics } from '../lib/handoff';
import {
  notifyNewConversation,
  notifyNewLead,
  notifyNewOrder,
} from "../lib/companyNotification";
import { reportSystemMalfunction } from "../lib/malfunctions";
import { resolveCompanyAi, assertCompanyQuotaNotExceeded, type ResolvedAiConfig } from "../lib/supportAi";
import { webhookLimiter } from "../lib/security";
import { verifyMetaWebhookSignature } from "../lib/webhookSecurity";
import { Router } from "express";
import { downloadWhatsAppAudio, transcribeAudio, generateVoiceResponse, sendWhatsAppVoiceNote } from '../lib/audio';
import { db, companiesTable, chatLogsTable, leadsTable, adminConfigTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sanitizeGoogleModel, formatGeminiHistory, sanitizeOpenAiModel, buildOpenAiChatParams, sanitizeOpenRouterModel, isOpenRouterFreeModel, stripThinkingTags, getOpenRouterHeaders, sanitizeAnthropicModel, isAnthropicFreeModel, formatAnthropicMessages, extractAnthropicText } from "../lib/aiModels";
import { syncConversationToSheet } from "../lib/googleSheets";
import { getKnowledgeFilesPromptSection } from "../lib/knowledgeFiles";
import { getWebsiteKnowledgeSection } from "../lib/websiteSync";
import { getWordPressKnowledgeSection } from "../lib/wordpressSync";
import { getRestApiKnowledgeSection } from "../lib/restApiSync";
import { getShopifyKnowledgeSection } from "../lib/shopifySync";
import { LANGUAGE_MATCH_INSTRUCTION, OUTPUT_FORMAT_INSTRUCTION } from "../lib/promptInstructions";
import { enforceResponseLanguage, getLanguageInstruction, localizedChannelMessage } from "../lib/language";

import crypto from 'crypto';

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
          logger.warn({ effectiveModel, err: err?.message }, "Anthropic free model error in WhatsApp; falling back to claude-3-5-haiku-20241022");
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
        logger.warn({ effectiveModel, fallbackPaidModel, err: err?.message }, "Anthropic paid model error in WhatsApp; falling back to resilient tier");
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
        logger.warn({ effectiveModel, err: err?.message }, "OpenRouter free model error in WhatsApp; falling back to openrouter/free");
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

export async function sendWhatsAppMessage(phoneNumberId: string, apiToken: string, to: string, text: string) {
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

/**
 * GET /whatsapp/webhook and /webhook/whatsapp
 *
 * Platform-level webhook verification handshake (no phone number ID in URL).
 * In the Meta App Dashboard set:
 *   Webhook URL   → <your-domain>/api/whatsapp/webhook (or /whatsapp/webhook)
 *   Verify Token  → the token generated in Admin → Security / Webhook Settings
 */
router.get(["/whatsapp/webhook", "/webhook/whatsapp"], webhookLimiter, async (req, res) => {
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
      .where(eq(adminConfigTable.key, "whatsapp_verify_token"));

    if (!row?.value || verifyToken !== row.value) {
      res.sendStatus(403);
      return;
    }

    res.status(200).send(challenge);
  } catch (err) {
    logger.error({ err }, "WhatsApp platform webhook verification error");
    res.sendStatus(500);
  }
});

/**
 * POST /whatsapp/webhook and /webhook/whatsapp
 *
 * Platform-level incoming WhatsApp events. Extracts the Phone Number ID from
 * entry[].changes[].value.metadata.phone_number_id and routes to the matching company.
 */
router.post(["/whatsapp/webhook", "/webhook/whatsapp"], webhookLimiter, verifyMetaWebhookSignature, async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body as {
      entry?: {
        changes?: {
          value?: {
            metadata?: { phone_number_id?: string };
            messages?: {
              from?: string;
              text?: { body?: string };
              audio?: { id?: string };
              voice?: { id?: string };
              type?: string;
            }[];
            statuses?: unknown[];
          };
        }[];
      }[];
    };

    const companies = await db.select().from(companiesTable);

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        const messages      = change.value?.messages ?? [];

        if (!phoneNumberId) continue;

        const company = companies.find(c => c.whatsappPhoneNumberId === phoneNumberId);

        if (!company) {
          logger.warn({ phoneNumberId }, "WhatsApp platform webhook: no company matched phone number ID");
          continue;
        }

        if (!company.whatsappApiToken) {
          logger.warn({ phoneNumberId, companyId: company.id }, "WhatsApp platform webhook: company has no API token");
          continue;
        }

        
          for (const message of messages) {
            const senderPhone = message.from;
            let userText = message.type === "text" ? message.text?.body : undefined;
            let isVoiceNote = false;

            if (!userText && (message.type === "audio" || message.type === "voice")) {
               try {
                  const mediaId = message.audio?.id || message.voice?.id;
                  if (mediaId && company.whatsappApiToken) {
                     const buffer = await downloadWhatsAppAudio(company.whatsappApiToken, mediaId);
                     const transcript = await transcribeAudio(company, buffer, "voice.ogg", "audio/ogg");
                     userText = "[رسالة صوتية] " + transcript;
                     isVoiceNote = true;
                  }
               } catch (err) {
                  logger.warn({ err, senderPhone }, "Failed to transcribe WhatsApp audio note");
                  if (phoneNumberId && company.whatsappApiToken && senderPhone) {
                    await sendWhatsAppMessage(
                      phoneNumberId,
                      company.whatsappApiToken,
                      senderPhone,
                      "🎙️ عذراً، لم أتمكن من الاستماع إلى التسجيل الصوتي بوضوح. هل يمكنك كتابة استفسارك نصياً أو إعادة إرساله؟"
                    );
                  }
                  continue;
               }
            }

            if (!senderPhone || !userText) continue;

          const sessionId = `wa_${senderPhone}`;

          if (!company.isActive) {
            await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
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
              `AI Unavailable for ${company.name} (WhatsApp)`,
              configErr?.message || "AI configuration failed or token quota not allocated",
              company.id,
              configErr
            );
            await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
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
              { channel: "whatsapp", sessionId, initialMessage: userText }
            ).catch((e) => logger.warn({ err: e, companyId: company.id }, "WhatsApp new conversation email failed"));
          }

          const history: { role: "user" | "assistant"; content: string }[] = [];
          for (const log of priorLogs) {
            history.push({ role: "user", content: log.customerMessage });
            if (log.botResponse) history.push({ role: "assistant", content: log.botResponse });
          }

          
    if (isSessionInHandoff(priorLogs)) {
            await db.insert(chatLogsTable).values({
              companyId: company.id,
              channel: "whatsapp",
              sessionId,
              customerMessage: userText,
              botResponse: null,
              isHandoff: true
            });

    // Notify client of new message
    triggerNewMessageNotification(company, sessionId, "whatsapp", userText);
            return;
          }

    let rawReply: string;
    try {
      rawReply = await callAI(company, userText, history, aiConfig);
    } catch (aiErr: any) {
      void reportSystemMalfunction(
        `WhatsApp AI Generation Error: ${company.name}`,
        aiErr?.message || "Failed to generate AI response",
        company.id,
        aiErr
      );
      await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
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
      triggerHandoffNotification(company, sessionId, "whatsapp");
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
            channel: "whatsapp" // Update channel to the most recent one used
          })
          .where(eq(leadsTable.id, existingLead.id));
      } else {
        await db.insert(leadsTable).values({
          companyId: company.id,
          channel: "whatsapp",
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
            channel: "whatsapp",
            sessionId,
          }
        ).catch((e) => logger.warn({ err: e, companyId: company.id }, "WhatsApp new lead email failed"));
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
          notes: `Detected via WhatsApp chat (${sessionId})`,
          channel: "whatsapp",
        }
      ).catch((e) => logger.warn({ err: e, companyId: company.id }, "WhatsApp new order email failed"));
    }

    await db.insert(chatLogsTable).values({
      companyId: company.id,
      channel: "whatsapp",
      sessionId,
      customerMessage: userText,
      botResponse: aiReply,
      isHandoff,
      sentiment: metrics?.sentiment || null,
      intent: metrics?.intent || null,
    });
      triggerNewMessageNotification(company, sessionId, "whatsapp", userText);

          // Voice note response if incoming message was voice or voice replies enabled
          if (isVoiceNote || company.voiceReplyEnabled) {
            try {
              const voiceBuffer = await generateVoiceResponse(company, aiReply);
              if (voiceBuffer) {
                await sendWhatsAppVoiceNote(phoneNumberId, company.whatsappApiToken, senderPhone, voiceBuffer);
              }
            } catch (voiceErr) {
              logger.warn({ voiceErr, senderPhone }, "Failed to send WhatsApp voice note, falling back to text only");
            }
          }

          // Also send text response so user can both listen and read
          await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, aiReply);

          void syncConversationToSheet(company, [
            ...history,
            { role: "user", content: userText },
            { role: "assistant", content: aiReply },
          ]);

          logger.info({ companyId: company.id, senderPhone, sessionId }, "WhatsApp platform message handled");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "WhatsApp platform webhook error");
  }
});

/**
 * GET /whatsapp/webhook/:phoneNumberId and /webhook/whatsapp/:phoneNumberId
 *
 * Per-company webhook verification.
 * Verify Token = whatsappApiToken stored in company settings, or platform verify token.
 */
router.get(["/whatsapp/webhook/:phoneNumberId", "/webhook/whatsapp/:phoneNumberId"], async (req, res) => {
  try {
    const { phoneNumberId } = req.params;
    const mode        = req.query["hub.mode"];
    const verifyToken = req.query["hub.verify_token"];
    const challenge   = req.query["hub.challenge"];

    if (mode !== "subscribe") {
      res.sendStatus(403);
      return;
    }

    const companies = await db.select().from(companiesTable);
    const company   = companies.find(c => c.whatsappPhoneNumberId === phoneNumberId);

    const [globalRow] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "whatsapp_verify_token"));

    const isTokenValid = (company?.whatsappApiToken && verifyToken === company.whatsappApiToken) ||
      (globalRow?.value && verifyToken === globalRow.value);

    if (!company || !isTokenValid) {
      res.sendStatus(403);
      return;
    }

    res.status(200).send(challenge);
  } catch (err) {
    logger.error({ err }, "WhatsApp webhook verification error");
    res.sendStatus(500);
  }
});

/**
 * POST /whatsapp/webhook/:phoneNumberId and /webhook/whatsapp/:phoneNumberId
 *
 * Receives incoming messages from the WhatsApp Cloud API.
 * Looks up the company by Phone Number ID, processes the message through the AI pipeline,
 * and sends the reply back to the user via the WhatsApp Cloud API.
 */
router.post(["/whatsapp/webhook/:phoneNumberId", "/webhook/whatsapp/:phoneNumberId"], webhookLimiter, verifyMetaWebhookSignature, async (req, res) => {
  res.sendStatus(200);
  let company: typeof companiesTable.$inferSelect | undefined;
  try {
    const { phoneNumberId } = req.params;
    const body = req.body as {
      entry?: {
        changes?: {
          value?: {
             messages?: {
               from?: string;
               text?: { body?: string };
               audio?: { id?: string };
               voice?: { id?: string };
               type?: string;
             }[];
            statuses?: unknown[];
          };
        }[];
      }[];
    };

    const companies = await db.select().from(companiesTable);
    const foundCompany = companies.find(c => c.whatsappPhoneNumberId === phoneNumberId);

    if (!foundCompany) {
      logger.warn({ phoneNumberId }, "WhatsApp webhook: no company matched phone number ID");
      return;
    }
    company = foundCompany;
    const currentCompany = foundCompany;

    if (!company.whatsappApiToken) {
      logger.warn({ phoneNumberId, companyId: company.id }, "WhatsApp webhook: company has no API token");
      return;
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];

        
          for (const message of messages) {
            const senderPhone = message.from;
            let userText = message.type === "text" ? message.text?.body : undefined;
            let isVoiceNote = false;

            if (!userText && (message.type === "audio" || message.type === "voice")) {
               try {
                  const mediaId = message.audio?.id || message.voice?.id;
                  if (mediaId && company.whatsappApiToken) {
                     const buffer = await downloadWhatsAppAudio(company.whatsappApiToken, mediaId);
                     const transcript = await transcribeAudio(company, buffer, "voice.ogg", "audio/ogg");
                     userText = "[رسالة صوتية] " + transcript;
                     isVoiceNote = true;
                  }
               } catch (err) {
                  logger.warn({ err, senderPhone }, "Failed to transcribe WhatsApp audio note (webhook 2)");
                  if (phoneNumberId && company.whatsappApiToken && senderPhone) {
                    await sendWhatsAppMessage(
                      phoneNumberId,
                      company.whatsappApiToken,
                      senderPhone,
                      "🎙️ عذراً، لم أتمكن من الاستماع إلى التسجيل الصوتي بوضوح. هل يمكنك كتابة استفسارك نصياً أو إعادة إرساله؟"
                    );
                  }
                  continue;
               }
            }

            if (!senderPhone || !userText) continue;

          const sessionId = `wa_${senderPhone}`;

          if (!company.isActive) {
            await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
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
              `AI Unavailable for ${company.name} (Custom WhatsApp)`,
              configErr?.message || "AI configuration failed or token quota not allocated",
              company.id,
              configErr
            );
            await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
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
              { channel: "whatsapp", sessionId, initialMessage: userText }
            ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Custom WhatsApp new conversation email failed"));
          }

          const history: { role: "user" | "assistant"; content: string }[] = [];
          for (const log of priorLogs) {
            history.push({ role: "user", content: log.customerMessage });
            if (log.botResponse) history.push({ role: "assistant", content: log.botResponse });
          }

          if (isSessionInHandoff(priorLogs)) {
            await db.insert(chatLogsTable).values({
              companyId: company.id,
              channel: "whatsapp",
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
              `Custom WhatsApp AI Generation Error: ${company.name}`,
              aiErr?.message || "Failed to generate AI response",
              company.id,
              aiErr
            );
            await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
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
      triggerHandoffNotification(company, sessionId, "whatsapp");
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
            channel: "whatsapp" // Update channel to the most recent one used
          })
          .where(eq(leadsTable.id, existingLead.id));
      } else {
        await db.insert(leadsTable).values({
          companyId: company.id,
          channel: "whatsapp",
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
            channel: "whatsapp",
            sessionId,
          }
        ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Custom WhatsApp new lead email failed"));
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
          notes: `Detected via Custom WhatsApp chat (${sessionId})`,
          channel: "whatsapp",
        }
      ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Custom WhatsApp new order email failed"));
    }

          await db.insert(chatLogsTable).values({
            companyId: company.id,
            channel: "whatsapp",
            sessionId,
            customerMessage: userText,
            botResponse: aiReply,
            isHandoff,
            sentiment: metrics?.sentiment || null,
            intent: metrics?.intent || null
          });
          triggerNewMessageNotification(company, sessionId, "whatsapp", userText);

          // Voice note response if incoming message was voice or voice replies enabled
          if (isVoiceNote || company.voiceReplyEnabled) {
            try {
              const voiceBuffer = await generateVoiceResponse(company, aiReply);
              if (voiceBuffer) {
                await sendWhatsAppVoiceNote(phoneNumberId, company.whatsappApiToken, senderPhone, voiceBuffer);
              }
            } catch (voiceErr) {
              logger.warn({ voiceErr, senderPhone }, "Failed to send WhatsApp voice note, falling back to text only");
            }
          }

          // Also send text response so the user can both listen and read
          await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, aiReply);

          void syncConversationToSheet(company, [
            ...history,
            { role: "user", content: userText },
            { role: "assistant", content: aiReply },
          ]);

          logger.info({ companyId: company.id, senderPhone, sessionId }, "WhatsApp message handled");
        }
      }
    }
  } catch (err) {
      logger.error({ err }, "WhatsApp webhook error");
      if (company && company.id) {
        void reportSystemMalfunction(
          "عطل في ربط واتساب (WhatsApp Webhook Error)",
          "حدث خطأ غير متوقع أثناء معالجة رسالة عبر واتساب. قد يكون هناك مشكلة في توكن الربط أو تعطل مؤقت في الخدمة.",
          company.id,
          err
        );
      }
    }
});

export default router;



