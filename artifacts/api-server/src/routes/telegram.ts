import { Router } from "express";
import { db, companiesTable, chatLogsTable } from "@workspace/db";
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

const router = Router();

async function callAI(company: typeof companiesTable.$inferSelect, userMessage: string, history: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  if (!company.aiAgentApiKey) throw new Error("No AI API key configured");

  let sysContent = company.systemPrompt ?? "";
  sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
  sysContent += `\n\n${getLanguageInstruction(userMessage)}`;
  sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
  if (company.generalInfo) sysContent += `\n\nCompany Info:\n${company.generalInfo}`;

  sysContent += await getWebsiteKnowledgeSection(company);
  sysContent += await getWordPressKnowledgeSection(company.id);
  sysContent += await getKnowledgeFilesPromptSection(company.id);

  const provider = company.aiProvider ?? "openai";
  const model = company.aiModel ?? (
    provider === "anthropic" ? "claude-3-5-haiku-20241022" :
    provider === "google" ? "gemini-2.0-flash" :
    provider === "openrouter" ? "google/gemma-4-31b-it:free" : "gpt-4o-mini"
  );

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: company.aiAgentApiKey });
    const resp = await client.messages.create({
      model, max_tokens: 1024,
      system: sysContent || undefined,
      messages: [
        ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user" as const, content: userMessage },
      ],
    });
    return (resp.content[0] as { type: string; text: string })?.text ?? "";

  } else if (provider === "google") {
    const genAI = new GoogleGenerativeAI(company.aiAgentApiKey);
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
    const openrouter = new OpenAI({ apiKey: company.aiAgentApiKey, baseURL: "https://openrouter.ai/api/v1" });
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sysContent) msgs.push({ role: "system", content: sysContent });
    history.forEach(h => msgs.push({ role: h.role, content: h.content }));
    msgs.push({ role: "user", content: userMessage });
    const completion = await openrouter.chat.completions.create({ model, messages: msgs });
    return completion.choices[0]?.message?.content ?? "";

  } else {
    const openai = new OpenAI({ apiKey: company.aiAgentApiKey });
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (sysContent) msgs.push({ role: "system", content: sysContent });
    history.forEach(h => msgs.push({ role: h.role, content: h.content }));
    msgs.push({ role: "user", content: userMessage });
    const completion = await openai.chat.completions.create({ model, messages: msgs });
    return completion.choices[0]?.message?.content ?? "";
  }
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

router.post("/telegram/webhook/:token", async (req, res) => {
  res.sendStatus(200);

  try {
    const { token } = req.params;
    const update = req.body;

    const message = update.message || update.edited_message;
    if (!message || !message.text) return;

    const chatId: number = message.chat.id;
    const userText: string = message.text;
    const sessionId = `tg_${chatId}`;

    const companies = await db.select().from(companiesTable);
    const company = companies.find(c => c.telegramBotApiKey === token);

    if (!company) {
      logger.warn({ token: token.slice(0, 8) }, "Telegram webhook: no company matched");
      return;
    }

    if (!company.isActive) {
      await sendTelegramMessage(token, chatId, localizedChannelMessage(
        userText,
        "⚠️ هذه الخدمة غير نشطة حاليًا. يرجى التواصل مع الدعم.",
        "⚠️ This chatbot is currently inactive. Please contact support.",
      ));
      return;
    }

    if (!company.aiAgentApiKey) {
      await sendTelegramMessage(token, chatId, localizedChannelMessage(
        userText,
        "⚠️ لم يتم إعداد الذكاء الاصطناعي بعد.",
        "⚠️ AI is not configured yet.",
      ));
      return;
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

    const aiReply = enforceResponseLanguage(await callAI(company, userText, history), userText);

    await db.insert(chatLogsTable).values({
      companyId: company.id,
      channel: "telegram",
      sessionId,
      customerMessage: userText,
      botResponse: aiReply,
    });

    await sendTelegramMessage(token, chatId, aiReply);

    void syncConversationToSheet(company, [
      ...history,
      { role: "user", content: userText },
      { role: "assistant", content: aiReply },
    ]);

    logger.info({ companyId: company.id, chatId, sessionId }, "Telegram message handled");
  } catch (err) {
    logger.error({ err }, "Telegram webhook error");
  }
});

router.post("/telegram/register-webhook/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      res.status(400).json({ error: "webhookUrl is required" });
      return;
    }

    const companies = await db.select().from(companiesTable);
    const company = companies.find(c => c.telegramBotApiKey === token);
    if (!company) {
      res.status(404).json({ error: "No company found with this token" });
      return;
    }

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

router.get("/telegram/webhook-info/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const companies = await db.select().from(companiesTable);
    const company = companies.find(c => c.telegramBotApiKey === token);
    if (!company) {
      res.status(404).json({ error: "No company found with this token" });
      return;
    }

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const tgData = await tgRes.json() as { ok: boolean; result?: { url: string; pending_update_count: number; last_error_message?: string } };

    res.json(tgData);
  } catch (err) {
    logger.error({ err }, "Get Telegram webhook info error");
    res.status(500).json({ error: "Failed to get webhook info" });
  }
});

export default router;
