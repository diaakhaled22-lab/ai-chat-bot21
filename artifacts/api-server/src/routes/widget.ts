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

const WIDGET_CORS = (_req: any, res: any, next: any) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
};

router.options("/widget/:key/config", WIDGET_CORS, (_req, res) => { res.sendStatus(204); });
router.options("/widget/:key/chat", WIDGET_CORS, (_req, res) => { res.sendStatus(204); });

router.get("/widget/:key/config", WIDGET_CORS, async (req, res) => {
  try {
    const { key } = req.params;
    const companies = await db.select().from(companiesTable);
    const company = companies.find((c) => c.websiteChatbotKey === key);

    if (!company) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }

    res.json({
      name: company.name,
      isActive: company.isActive,
    });
  } catch (err) {
    logger.error({ err }, "Widget config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/widget/:key/chat", WIDGET_CORS, async (req, res) => {
  try {
    const { key } = req.params;
    const { message, sessionId } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const companies = await db.select().from(companiesTable);
    const company = companies.find((c) => c.websiteChatbotKey === key);

    if (!company) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }

    if (!company.isActive) {
      res.status(403).json({
        error: localizedChannelMessage(
          message,
          "هذه الخدمة غير نشطة حاليًا.",
          "This chatbot is currently inactive.",
        ),
      });
      return;
    }

    if (!company.aiAgentApiKey) {
      res.status(503).json({
        error: localizedChannelMessage(
          message,
          "لم يتم إعداد الذكاء الاصطناعي لهذه الخدمة بعد.",
          "AI is not configured for this chatbot yet.",
        ),
      });
      return;
    }

    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (sessionId && typeof sessionId === "string") {
      const priorLogs = await db
        .select()
        .from(chatLogsTable)
        .where(and(eq(chatLogsTable.companyId, company.id), eq(chatLogsTable.sessionId, sessionId)))
        .orderBy(asc(chatLogsTable.createdAt))
        .limit(20);

      for (const log of priorLogs) {
        conversationHistory.push({ role: "user", content: log.customerMessage });
        if (log.botResponse) {
          conversationHistory.push({ role: "assistant", content: log.botResponse });
        }
      }
    }

    let sysContent = company.systemPrompt ?? "";
    sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
    sysContent += `\n\n${getLanguageInstruction(message.trim())}`;
    sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
    if (company.generalInfo) {
      sysContent += `\n\nCompany Info:\n${company.generalInfo}`;
    }

    sysContent += await getWebsiteKnowledgeSection(company);
    sysContent += await getWordPressKnowledgeSection(company.id);
    sysContent += await getKnowledgeFilesPromptSection(company.id);

    const provider = company.aiProvider ?? "openai";
    const model = company.aiModel ?? (
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "google/gemma-4-31b-it:free" : "gpt-4o-mini"
    );

    let aiReply = "";

    if (provider === "anthropic") {
      const anthropic = new Anthropic({ apiKey: company.aiAgentApiKey });
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: sysContent || undefined,
        messages: [
          ...conversationHistory.map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
          { role: "user" as const, content: message.trim() },
        ],
      });
      aiReply = (response.content[0] as { type: string; text: string })?.text ?? "";

    } else if (provider === "google") {
      const genAI = new GoogleGenerativeAI(company.aiAgentApiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: sysContent || undefined,
      });
      const history = conversationHistory.map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.content }],
      }));
      const chat = genModel.startChat({ history });
      const result = await chat.sendMessage(message.trim());
      aiReply = result.response.text();

    } else if (provider === "openrouter") {
      const openrouter = new OpenAI({ apiKey: company.aiAgentApiKey, baseURL: "https://openrouter.ai/api/v1" });
      const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (sysContent) msgs.push({ role: "system", content: sysContent });
      for (const turn of conversationHistory) {
        msgs.push({ role: turn.role, content: turn.content });
      }
      msgs.push({ role: "user", content: message.trim() });
      const completion = await openrouter.chat.completions.create({ model, messages: msgs });
      aiReply = completion.choices[0]?.message?.content ?? "";

    } else {
      const openai = new OpenAI({ apiKey: company.aiAgentApiKey });
      const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (sysContent) msgs.push({ role: "system", content: sysContent });
      for (const turn of conversationHistory) {
        msgs.push({ role: turn.role, content: turn.content });
      }
      msgs.push({ role: "user", content: message.trim() });
      const completion = await openai.chat.completions.create({ model, messages: msgs });
      aiReply = completion.choices[0]?.message?.content ?? "";
    }

    aiReply = enforceResponseLanguage(aiReply, message.trim());

    if (sessionId && typeof sessionId === "string") {
      await db.insert(chatLogsTable).values({
        companyId: company.id,
        channel: "website",
        sessionId,
        customerMessage: message.trim(),
        botResponse: aiReply,
      });
    }

    void syncConversationToSheet(company, [
      ...conversationHistory,
      { role: "user", content: message.trim() },
      { role: "assistant", content: aiReply },
    ]);

    res.json({ response: aiReply });
  } catch (err) {
    logger.error({ err }, "Widget chat error");
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    res.status(500).json({
      error: localizedChannelMessage(
        message,
        "تعذر إعداد الرد. يرجى المحاولة مرة أخرى.",
        "Failed to generate response. Please try again.",
      ),
    });
  }
});

export default router;
