import { reportSystemMalfunction } from "../lib/malfunctions";
import { resolveCompanyAi, assertCompanyQuotaNotExceeded, type ResolvedAiConfig } from "../lib/supportAi";
import { webhookLimiter } from "../lib/security";
import { Router } from "express";
import { db, companiesTable, chatLogsTable, adminConfigTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { syncConversationToSheet } from "../lib/googleSheets";
import { getKnowledgeFilesPromptSection } from "../lib/knowledgeFiles";
import { getWebsiteKnowledgeSection } from "../lib/websiteSync";
import { getWordPressKnowledgeSection } from "../lib/wordpressSync";
import { LANGUAGE_MATCH_INSTRUCTION, OUTPUT_FORMAT_INSTRUCTION } from "../lib/promptInstructions";
import { enforceResponseLanguage, getLanguageInstruction, localizedChannelMessage } from "../lib/language";
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
  if (company.securityPrompt) sysContent += `\n\nSecurity Instructions:\n${company.securityPrompt}`;
  sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
  sysContent += `\n\n${getLanguageInstruction(userMessage)}`;
  sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
  if (company.generalInfo) sysContent += `\n\nCompany Info:\n${company.generalInfo}`;

  sysContent += await getWebsiteKnowledgeSection(company);
  sysContent += await getWordPressKnowledgeSection(company.id);
  sysContent += await getKnowledgeFilesPromptSection(company.id);

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
    const genModel = genAI.getGenerativeModel({
      model,
      systemInstruction: sysContent || undefined,
    });
    const chat = genModel.startChat({
      history: history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();

  } else if (provider === "openrouter") {
    const openrouter = new OpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" });
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sysContent) msgs.push({ role: "system", content: sysContent });
    history.forEach(h => msgs.push({ role: h.role, content: h.content }));
    msgs.push({ role: "user", content: userMessage });
    const completion = await openrouter.chat.completions.create({ model, messages: msgs });
    return (completion.choices?.[0]?.message?.content || "") as string;

  } else {
    const openai = new OpenAI({ apiKey });
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sysContent) msgs.push({ role: "system", content: sysContent });
    history.forEach(h => msgs.push({ role: h.role, content: h.content }));
    msgs.push({ role: "user", content: userMessage });
    const completion = await openai.chat.completions.create({ model, messages: msgs });
    return (completion.choices?.[0]?.message?.content || "") as string;
  }
}

async function sendWhatsAppMessage(phoneNumberId: string, apiToken: string, to: string, text: string) {
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
 * GET /whatsapp/webhook
 *
 * Platform-level webhook verification handshake (no phone number ID in URL).
 * In the Meta App Dashboard set:
 *   Webhook URL   â†’ <your-domain>/api/whatsapp/webhook
 *   Verify Token  â†’ the token generated in Admin â†’ Security / Webhook Settings
 */
router.get("/whatsapp/webhook", webhookLimiter, async (req, res) => {
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
 * POST /whatsapp/webhook
 *
 * Platform-level incoming WhatsApp events. Extracts the Phone Number ID from
 * entry[].changes[].value.metadata.phone_number_id and routes to the matching company.
 */
router.post("/whatsapp/webhook", webhookLimiter, async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body as {
      entry?: {
        changes?: {
          value?: {
            metadata?: { phone_number_id?: string };
            messages?: { from?: string; text?: { body?: string }; type?: string }[];
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
          const userText    = message.type === "text" ? message.text?.body : undefined;
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
            await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
              userText,
              configErr?.message || "⚠️ تعذر الرد بسبب مشكلة في إعدادات الذكاء الاصطناعي أو تجاوز الحصة.",
              configErr?.message || "⚠️ Unable to respond due to AI configuration issue or exceeded quota.",
            ));
            continue;
          }

          const priorLogs = await db
            .select()
            .from(chatLogsTable)
            .where(and(eq(chatLogsTable.companyId, company.id), eq(chatLogsTable.sessionId, sessionId)))
            .orderBy(asc(chatLogsTable.createdAt))
            .limit(20);

          const history: { role: "user" | "assistant"; content: string }[] = [];
          for (const log of priorLogs) {
            history.push({ role: "user", content: log.customerMessage });
            if (log.botResponse) history.push({ role: "assistant", content: log.botResponse });
          }

          const aiReply = enforceResponseLanguage(await callAI(company, userText, history, aiConfig), userText);

          await db.insert(chatLogsTable).values({
            companyId: company.id,
            channel: "whatsapp",
            sessionId,
            customerMessage: userText,
            botResponse: aiReply,
          });

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
 * GET /whatsapp/webhook/:phoneNumberId
 *
 * Per-company webhook verification (legacy â€” kept for backwards compatibility).
 * Verify Token = whatsappApiToken stored in company settings.
 */
router.get("/whatsapp/webhook/:phoneNumberId", async (req, res) => {
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

    if (!company || !company.whatsappApiToken || verifyToken !== company.whatsappApiToken) {
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
 * POST /whatsapp/webhook/:phoneNumberId
 *
 * Receives incoming messages from the WhatsApp Cloud API.
 * Looks up the company by Phone Number ID, processes the message through the AI pipeline,
 * and sends the reply back to the user via the WhatsApp Cloud API.
 */
router.post("/whatsapp/webhook/:phoneNumberId", async (req, res) => {
  res.sendStatus(200);

  try {
    const { phoneNumberId } = req.params;
    const body = req.body as {
      entry?: {
        changes?: {
          value?: {
            messages?: { from?: string; text?: { body?: string }; type?: string }[];
            statuses?: unknown[];
          };
        }[];
      }[];
    };

    const companies = await db.select().from(companiesTable);
    const company   = companies.find(c => c.whatsappPhoneNumberId === phoneNumberId);

    if (!company) {
      logger.warn({ phoneNumberId }, "WhatsApp webhook: no company matched phone number ID");
      return;
    }

    if (!company.whatsappApiToken) {
      logger.warn({ phoneNumberId, companyId: company.id }, "WhatsApp webhook: company has no API token");
      return;
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const messages = change.value?.messages ?? [];

        for (const message of messages) {
          const senderPhone = message.from;
          const userText    = message.type === "text" ? message.text?.body : undefined;
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
            await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, localizedChannelMessage(
              userText,
              configErr?.message || "⚠️ تعذر الرد بسبب مشكلة في إعدادات الذكاء الاصطناعي أو تجاوز الحصة.",
              configErr?.message || "⚠️ Unable to respond due to AI configuration issue or exceeded quota.",
            ));
            continue;
          }

          const priorLogs = await db
            .select()
            .from(chatLogsTable)
            .where(and(eq(chatLogsTable.companyId, company.id), eq(chatLogsTable.sessionId, sessionId)))
            .orderBy(asc(chatLogsTable.createdAt))
            .limit(20);

          const history: { role: "user" | "assistant"; content: string }[] = [];
          for (const log of priorLogs) {
            history.push({ role: "user", content: log.customerMessage });
            if (log.botResponse) history.push({ role: "assistant", content: log.botResponse });
          }

          const aiReply = enforceResponseLanguage(await callAI(company, userText, history, aiConfig), userText);

          await db.insert(chatLogsTable).values({
            companyId: company.id,
            channel: "whatsapp",
            sessionId,
            customerMessage: userText,
            botResponse: aiReply,
          });

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
