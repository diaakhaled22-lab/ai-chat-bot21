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

async function sendMessengerMessage(pageAccessToken: string, recipientId: string, text: string) {
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
 *   Webhook URL   → <your-domain>/api/messenger/webhook
 *   Verify Token  → the token generated in Admin → Security / Webhook Settings
 *
 * Meta sends hub.verify_token which we check against the stored platform token.
 */
router.get("/messenger/webhook", async (req, res) => {
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
router.post("/messenger/webhook", async (req, res) => {
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
            "⚠️ هذه الخدمة غير نشطة حاليًا. يرجى التواصل مع الدعم.",
            "⚠️ This chatbot is currently inactive. Please contact support.",
          ));
          continue;
        }

        if (!company.aiAgentApiKey) {
          await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
            userText,
            "⚠️ لم يتم إعداد الذكاء الاصطناعي بعد.",
            "⚠️ AI is not configured yet.",
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

        const aiReply = enforceResponseLanguage(await callAI(company, userText, history), userText);

        await db.insert(chatLogsTable).values({
          companyId: company.id,
          channel: "messenger",
          sessionId,
          customerMessage: userText,
          botResponse: aiReply,
        });

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
 * Per-company webhook verification (legacy — kept for backwards compatibility).
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
router.post("/messenger/webhook/:pageId", async (req, res) => {
  res.sendStatus(200);

  try {
    const { pageId } = req.params;
    const body = req.body as {
      entry?: { messaging?: { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean } }[] }[];
    };

    const companies = await db.select().from(companiesTable);
    const company   = companies.find(c => c.messengerPageId === pageId);

    if (!company) {
      logger.warn({ pageId }, "Messenger webhook: no company matched page ID");
      return;
    }

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
            "⚠️ هذه الخدمة غير نشطة حاليًا. يرجى التواصل مع الدعم.",
            "⚠️ This chatbot is currently inactive. Please contact support.",
          ));
          continue;
        }

        if (!company.aiAgentApiKey) {
          await sendMessengerMessage(company.messengerApiKey, senderId, localizedChannelMessage(
            userText,
            "⚠️ لم يتم إعداد الذكاء الاصطناعي بعد.",
            "⚠️ AI is not configured yet.",
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

        const aiReply = enforceResponseLanguage(await callAI(company, userText, history), userText);

        await db.insert(chatLogsTable).values({
          companyId: company.id,
          channel: "messenger",
          sessionId,
          customerMessage: userText,
          botResponse: aiReply,
        });

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
  }
});

export default router;
