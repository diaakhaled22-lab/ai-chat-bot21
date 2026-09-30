import { isSessionInHandoff, triggerHandoffNotification, HANDOFF_SYSTEM_PROMPT, LEAD_GEN_SYSTEM_PROMPT, extractLeadData, METRICS_SYSTEM_PROMPT, extractMetrics } from '../lib/handoff';
import { Router } from "express";
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
import { chatLimiter } from "../lib/security";
import { assertCompanyQuotaNotExceeded, resolveCompanyAi } from "../lib/supportAi";

const router = Router();

const WIDGET_CORS = (_req: any, res: any, next: any) => {
  // Origin validation is done per-request in the route handlers after loading the company.
  // Here we set permissive headers; the route handler will block disallowed origins.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
};

/**
 * Check if the request origin is allowed by the company's widgetAllowedDomains.
 * If widgetAllowedDomains is null/empty, all origins are allowed (backwards compatible).
 * Returns true if allowed, false if blocked.
 */
function isOriginAllowed(origin: string | undefined, widgetAllowedDomains: string | null): boolean {
  if (!widgetAllowedDomains || !widgetAllowedDomains.trim()) return true; // No restriction
  if (!origin) return true; // Allow requests with no origin (curl, mobile, etc.)
  const allowed = widgetAllowedDomains.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return true;
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    return allowed.some(domain => originHost === domain || originHost.endsWith("." + domain));
  } catch {
    return false;
  }
}

router.options("/widget/:key/config", WIDGET_CORS, (_req, res) => { res.sendStatus(204); });
router.options("/widget/:key/chat", WIDGET_CORS, (_req, res) => { res.sendStatus(204); });

router.get("/widget/:key/config", WIDGET_CORS, chatLimiter, async (req, res) => {
  try {
    const { key } = req.params;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.websiteChatbotKey, key as string)).limit(1);

    if (!company) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }

    if (!isOriginAllowed(req.headers.origin as string | undefined, company.widgetAllowedDomains)) {
      res.status(403).json({ error: "Origin not allowed for this widget" });
      return;
    }

    res.json({
      name: company.name,
      isActive: company.isActive,
      fabPositionX: company.fabPositionX,
      fabPositionY: company.fabPositionY,
    });
  } catch (err) {
    logger.error({ err }, "Widget config error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/widget/:key/chat", WIDGET_CORS, chatLimiter, async (req, res) => {
  try {
    const { key } = req.params;
    const { message, sessionId, lang } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const explicitLang = lang === "ar" || lang === "en" ? lang : undefined;

    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.websiteChatbotKey, key as string)).limit(1);

    if (!company) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }

    if (!isOriginAllowed(req.headers.origin as string | undefined, company.widgetAllowedDomains)) {
      res.status(403).json({ error: "Origin not allowed for this widget" });
      return;
    }

    if (!company.isActive) {
      res.status(403).json({
        error: localizedChannelMessage(
          message,
          "هذه الخدمة غير نشطة حاليًا.",
          "This chatbot is currently inactive.",
          explicitLang
        ),
      });
      return;
    }

    let aiConfig;
    try {
      await assertCompanyQuotaNotExceeded(company);
      aiConfig = await resolveCompanyAi(company);
    } catch (configErr: any) {
      res.status(503).json({
        error: localizedChannelMessage(
          message,
          "نعتذر، المساعد الذكي غير متاح حالياً. يرجى التواصل مع فريق خدمة العملاء مباشرة.",
          "We apologize, the smart assistant is currently unavailable. Please contact customer support directly.",
          explicitLang
        ),
      });
      return;
    }

    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (sessionId && typeof sessionId === "string") {
      const priorLogs = await db.select().from(chatLogsTable).where(and(eq(chatLogsTable.companyId, company.id), eq(chatLogsTable.sessionId, sessionId))).orderBy(asc(chatLogsTable.createdAt)).limit(20);

    if (isSessionInHandoff(priorLogs)) {
      if (sessionId && typeof sessionId === "string") {
        await db.insert(chatLogsTable).values({
          companyId: company.id,
          channel: "website",
          sessionId,
          customerMessage: message.trim(),
          botResponse: null,
          isHandoff: true
        });
      }
      res.json({ reply: "" });
      return;
    }

      for (const log of priorLogs) {
        conversationHistory.push({ role: "user", content: log.customerMessage });
        if (log.botResponse) {
          conversationHistory.push({ role: "assistant", content: log.botResponse });
        }
      }
    }

    let sysContent = company.systemPrompt ?? "";
    sysContent += HANDOFF_SYSTEM_PROMPT;
    sysContent += LEAD_GEN_SYSTEM_PROMPT;
    sysContent += METRICS_SYSTEM_PROMPT;
    if (company.securityPrompt) sysContent += `\n\nSecurity Instructions:\n${company.securityPrompt}`;
    sysContent += `\n\n${LANGUAGE_MATCH_INSTRUCTION}`;
    sysContent += `\n\n${getLanguageInstruction(message.trim(), explicitLang)}`;
    sysContent += `\n\n${OUTPUT_FORMAT_INSTRUCTION}`;
    if (company.generalInfo) {
      sysContent += `\n\nCompany Info:\n${company.generalInfo}`;
    }

    sysContent += await getWebsiteKnowledgeSection(company);
    sysContent += await getWordPressKnowledgeSection(company.id);
    sysContent += await getKnowledgeFilesPromptSection(company.id);

    const provider = aiConfig.provider;
    const model = aiConfig.model;

    let aiReply = "";

    if (provider === "anthropic") {
      const anthropic = new Anthropic({ apiKey: aiConfig.apiKey });
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: sysContent || undefined,
        messages: [
          ...conversationHistory.map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
          { role: "user" as const, content: message.trim() },
        ],
      });
      aiReply = (response.content?.[0] as { type: string; text: string })?.text ?? "";

    } else if (provider === "google") {
      const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
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
      const openrouter = new OpenAI({ apiKey: aiConfig.apiKey, baseURL: "https://openrouter.ai/api/v1" });
      const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (sysContent) msgs.push({ role: "system", content: sysContent });
      for (const turn of conversationHistory) {
        msgs.push({ role: turn.role, content: turn.content });
      }
      msgs.push({ role: "user", content: message.trim() });
      const completion = await openrouter.chat.completions.create({ model, messages: msgs });
      aiReply = completion.choices?.[0]?.message?.content ?? "";

    } else {
      const openai = new OpenAI({ apiKey: aiConfig.apiKey });
      const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (sysContent) msgs.push({ role: "system", content: sysContent });
      for (const turn of conversationHistory) {
        msgs.push({ role: turn.role, content: turn.content });
      }
      msgs.push({ role: "user", content: message.trim() });
      const completion = await openai.chat.completions.create({ model, messages: msgs });
      aiReply = completion.choices?.[0]?.message?.content ?? "";
    }

        const { cleanResponse: tempResponse, leadData } = extractLeadData(aiReply);
    const { cleanResponse, metrics } = extractMetrics(tempResponse);
    aiReply = enforceResponseLanguage(cleanResponse, message.trim(), explicitLang);
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
            channel: "website" // Update channel to the most recent one used
          })
          .where(eq(leadsTable.id, existingLead.id));
      } else {
        await db.insert(leadsTable).values({
          companyId: company.id,
          channel: "website",
          sessionId,
          name: leadData.name || null,
          email: leadData.email || null,
          phone: leadData.phone || null,
          interest: leadData.interest || null,
        });
      }
    }

    if (aiReply.includes("[HANDOFF_REQUESTED]")) {
      aiReply = localizedChannelMessage(message.trim(), "???? ?????? ??? ???? ?????? ???? ????????.", "You are being transferred to a human agent. They will reply to you shortly.");
      isHandoff = true;
        triggerHandoffNotification(company, sessionId, "website");
      }

    if (sessionId && typeof sessionId === "string") {
      await db.insert(chatLogsTable).values({
        companyId: company.id,
        channel: "website",
        sessionId,
        customerMessage: message.trim(),
        botResponse: aiReply,
        isHandoff,
        sentiment: metrics?.sentiment || null,
        intent: metrics?.intent || null,
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




