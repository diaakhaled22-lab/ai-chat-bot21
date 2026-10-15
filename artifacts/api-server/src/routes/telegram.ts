import {
  triggerHandoffNotification,
  triggerNewMessageNotification,
  isHandoffRequested,
} from "../lib/handoff";
import {
  notifyNewConversation,
  notifyNewLead,
  notifyNewOrder,
} from "../lib/companyNotification";
import {
  isSessionInHandoff,
  HANDOFF_SYSTEM_PROMPT,
  LEAD_GEN_SYSTEM_PROMPT,
  METRICS_SYSTEM_PROMPT,
  extractLeadData,
  extractMetrics,
} from '../lib/handoff';
import { reportSystemMalfunction } from "../lib/malfunctions";
import { resolveCompanyAi, assertCompanyQuotaNotExceeded, type ResolvedAiConfig } from "../lib/supportAi";
import { Router } from "express";
import { downloadTelegramAudio, transcribeAudio } from '../lib/audio';
import { db, companiesTable, chatLogsTable, leadsTable } from "@workspace/db";
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
import { requireAuth } from "../middlewares/requireAuth";
import { webhookLimiter, apiLimiter } from "../lib/security";
import crypto from 'crypto';

function telegramWebhookSecret(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

const router = Router();

async function callAI(company: typeof companiesTable.$inferSelect, userMessage: string, history: { role: "user" | "assistant"; content: string }[], overrideAiConfig?: ResolvedAiConfig): Promise<string> {
  const { apiKey, provider, model } = overrideAiConfig ?? await resolveCompanyAi(company);
  

  let sysContent = company.systemPrompt ?? "";
  sysContent += HANDOFF_SYSTEM_PROMPT;
  sysContent += LEAD_GEN_SYSTEM_PROMPT;
  sysContent += METRICS_SYSTEM_PROMPT;
  sysContent += HANDOFF_SYSTEM_PROMPT;
    if (company.securityPrompt) sysContent += `\n\nSecurity Instructions:\n${company.securityPrompt}`;
  sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
  sysContent += `\n\n${getLanguageInstruction(userMessage)}`;
  sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
  if (company.generalInfo) sysContent += `\n\nCompany Info:\n${company.generalInfo}`;

  sysContent += await getWebsiteKnowledgeSection(company);
  sysContent += await getWordPressKnowledgeSection(company.id);
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

export async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

router.post("/telegram/webhook/:secret", webhookLimiter, async (req, res) => {
  res.sendStatus(200);
  let company: typeof companiesTable.$inferSelect | undefined;
  try {
    const secret = Array.isArray(req.params.secret) ? req.params.secret[0] : String(req.params.secret || "");
    const update = req.body;

    const message = update.message || update.edited_message;
    if (!message) return;

    const chatId: number = message.chat.id;
    const sessionId = `tg_${chatId}`;
    let userText: string = message.text || "";
    let isVoice = false;

    const [foundCompany] = await db.select().from(companiesTable).where(eq(companiesTable.telegramWebhookSecretHash, secret)).limit(1);
    if (!foundCompany) {
      logger.warn({ secret: secret.slice(0, 8) }, "Telegram webhook: no company matched");
      return;
    }
    company = foundCompany;
    const currentCompany = foundCompany;

    if (!userText && (message.voice || message.audio)) {
      try {
        const fileId = message.voice ? message.voice.file_id : message.audio.file_id;
        const buffer = await downloadTelegramAudio(company.telegramBotApiKey!, fileId);
        const transcript = await transcribeAudio(company, buffer, "audio.ogg");
        userText = "[رسالة صوتية] " + transcript;
        isVoice = true;
      } catch (err) {
        logger.error({ err }, "Error transcribing telegram audio");
        // We could send a fallback message or just return
        return;
      }
    }

    if (!userText) return;

    if (!company.isActive) {
      await sendTelegramMessage(company.telegramBotApiKey!, chatId, localizedChannelMessage(
        userText,
        "âš ï¸ Ù‡Ø°Ù‡ Ø§Ù„Ø®Ø¯Ù…Ø© ØºÙŠØ± Ù†Ø´Ø·Ø© Ø­Ø§Ù„ÙŠÙ‹Ø§. ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªÙˆØ§ØµÙ„ Ù…Ø¹ Ø§Ù„Ø¯Ø¹Ù….",
        "âš ï¸ This chatbot is currently inactive. Please contact support.",
      ));
      return;
    }

    let aiConfig: ResolvedAiConfig;
    try {
      await assertCompanyQuotaNotExceeded(company);
      aiConfig = await resolveCompanyAi(company);
    } catch (configErr: any) {
      void reportSystemMalfunction(
        `AI Unavailable for ${company.name} (Telegram)`,
        configErr?.message || "AI configuration failed or token quota not allocated",
        company.id,
        configErr
      );
      await sendTelegramMessage(company.telegramBotApiKey!, chatId, localizedChannelMessage(
        userText,
        "نعتذر، المساعد الذكي غير متاح حالياً. يرجى التواصل مع فريق خدمة العملاء مباشرة.",
        "We apologize, the smart assistant is currently unavailable. Please contact customer support directly.",
      ));
      return;
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
        { channel: "telegram", sessionId, initialMessage: userText }
      ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Telegram new conversation email failed"));
    }

    const history: { role: "user" | "assistant"; content: string }[] = [];
    for (const log of priorLogs) {
      history.push({ role: "user", content: log.customerMessage });
      if (log.botResponse) history.push({ role: "assistant", content: log.botResponse });
    }

        if (isSessionInHandoff(priorLogs)) {
            await db.insert(chatLogsTable).values({
              companyId: company.id,
              channel: "telegram",
              sessionId,
              customerMessage: userText,
              botResponse: null,
              isHandoff: true
            });

    // Notify client of new message
    triggerNewMessageNotification(company, sessionId, "telegram", userText);
            return;
          }

    let rawReply: string;
    try {
      rawReply = await callAI(company, userText, history, aiConfig);
    } catch (aiErr: any) {
      void reportSystemMalfunction(
        `Telegram AI Generation Error: ${company.name}`,
        aiErr?.message || "Failed to generate AI response",
        company.id,
        aiErr
      );
      await sendTelegramMessage(company.telegramBotApiKey!, chatId, localizedChannelMessage(
        userText,
        "نعتذر، حدث خطأ في معالجة الرد الذكي. يرجى المحاولة مرة أخرى لاحقاً.",
        "We apologize, an error occurred while generating the AI response. Please try again later.",
      ));
      return;
    }
    const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);
    const { cleanResponse, metrics } = extractMetrics(tempResponse);
    let aiReply = enforceResponseLanguage(cleanResponse, userText);
    let isHandoff = false;

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
            channel: "telegram" // Update channel to the most recent one used
          })
          .where(eq(leadsTable.id, existingLead.id));
      } else {
        await db.insert(leadsTable).values({
          companyId: company.id,
          channel: "telegram",
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
            channel: "telegram",
            sessionId,
          }
        ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Telegram new lead email failed"));
      }
    }

    if (isHandoffRequested(userText, rawReply, aiReply)) {
      aiReply = localizedChannelMessage(userText, "سيتم وضعك في قائمة الانتظار.", "You will be placed on the waiting list.");
      isHandoff = true;
      triggerHandoffNotification(company, sessionId, "telegram");
    }

    // Event 5: New order (detected via intent or keywords)
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
          notes: `Detected via Telegram chat (${sessionId})`,
          channel: "telegram",
        }
      ).catch((e) => logger.warn({ err: e, companyId: currentCompany.id }, "Telegram new order email failed"));
    }

    await db.insert(chatLogsTable).values({
      companyId: company.id,
      channel: "telegram",
      sessionId,
      customerMessage: userText,
      botResponse: aiReply,
      isHandoff,
        sentiment: metrics?.sentiment || null,
        intent: metrics?.intent || null,
      });
    triggerNewMessageNotification(company, sessionId, "telegram", userText);

    await sendTelegramMessage(company.telegramBotApiKey!, chatId, aiReply);

    void syncConversationToSheet(company, [
      ...history,
      { role: "user", content: userText },
      { role: "assistant", content: aiReply },
    ]);

    logger.info({ companyId: company.id, chatId, sessionId }, "Telegram message handled");
  } catch (err) {
      logger.error({ err }, "Telegram webhook error");
      if (company && company.id) {
        void reportSystemMalfunction(
          "عطل في ربط تيليجرام (Telegram Webhook Error)",
          "حدث خطأ غير متوقع أثناء معالجة رسالة عبر تيليجرام. يرجى التأكد من صلاحية البوت.",
          company.id,
          err
        );
      }
    }
});

function getAppBaseUrl(req: import("express").Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
  return `${proto}://${host}`;
}

router.post("/telegram/register-webhook", requireAuth, apiLimiter, async (req, res) => {
  try {
    const { companyId } = req.body;
    const [company] = req.session.role === "admin"
      ? await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1)
      : await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!)).limit(1);

    if (!company || !company.telegramBotApiKey) {
      res.status(404).json({ error: "No company found or missing Telegram Bot API Key" });
      return;
    }

    const token = company.telegramBotApiKey;
    const webhookUrl = getAppBaseUrl(req) + "/api/telegram/webhook/" + telegramWebhookSecret(token);
    await db.update(companiesTable).set({ telegramWebhookSecretHash: telegramWebhookSecret(token) }).where(eq(companiesTable.id, company.id));

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
    });
    const tgData = await tgRes.json() as { ok: boolean; description?: string };

    if (!tgData.ok) {
      res.status(400).json({ error: `Telegram error: ${tgData.description}` });
      return;
    }

    res.json({ ok: true, message: "Webhook registered with Telegram successfully" });
  } catch (err) {
    logger.error({ err }, "Register Telegram webhook error");
    res.status(500).json({ error: "Failed to register webhook" });
  }
});

router.get("/telegram/webhook-info/:companyId", requireAuth, apiLimiter, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    if (!companyId) {
      res.status(400).json({ error: "Invalid company ID" });
      return;
    }

    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    if (!company || !company.telegramBotApiKey) {
      res.status(404).json({ error: "No company found or missing Telegram Bot API Key" });
      return;
    }

    // Verify ownership
    if (req.session.role !== "admin" && company.clientId !== req.session.userId) {
      res.status(403).json({ error: "Forbidden: You do not own this chatbot" });
      return;
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${company.telegramBotApiKey}/getWebhookInfo`);
    const tgData = await tgRes.json() as { ok: boolean; result?: { url: string; pending_update_count: number; last_error_message?: string } };

    res.json(tgData);
  } catch (err) {
    logger.error({ err }, "Get Telegram webhook info error");
    res.status(500).json({ error: "Failed to get webhook info" });
  }
});

export default router;








