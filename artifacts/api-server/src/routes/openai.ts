import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, asc, and, like, not } from "drizzle-orm";
import pino from "pino";

const logger = pino({ name: "openai-routes" });
const router = Router();

// All routes require an authenticated session (any role)
function requireSession(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use("/openai", requireSession);

// Exclude legacy/other-provider conversations (e.g. removed "openrouter-*" rows)
// so this route only ever surfaces conversations that belong to it.
const isOpenAiConversation = not(like(conversations.provider, "openrouter-%"));

// GET /openai/conversations — list conversations for the logged-in user
router.get("/openai/conversations", async (req, res) => {
  try {
    const userId = req.session.userId as number;
    const all = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), isOpenAiConversation))
      .orderBy(asc(conversations.createdAt));
    res.json(all);
  } catch (err) {
    logger.error({ err }, "list conversations error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /openai/conversations — create a new conversation for the logged-in user
router.post("/openai/conversations", async (req, res) => {
  try {
    const userId = req.session.userId as number;
    const title: string = (req.body?.title as string)?.trim() || "New Chat";
    const [conv] = await db.insert(conversations).values({ userId, title }).returning();
    res.status(201).json(conv);
  } catch (err) {
    logger.error({ err }, "create conversation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /openai/conversations/:id — only the owner can delete
router.delete("/openai/conversations/:id", async (req, res) => {
  try {
    const userId = req.session.userId as number;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId), isOpenAiConversation));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete conversation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /openai/conversations/:id/messages — only the owner can read
router.get("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const userId = req.session.userId as number;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    // Verify ownership
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId), isOpenAiConversation)).limit(1);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    res.json(msgs);
  } catch (err) {
    logger.error({ err }, "get messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /openai/conversations/:id/messages — stream AI reply, owner-only
router.post("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const userId = req.session.userId as number;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const userContent: string = (req.body?.content as string)?.trim();
    if (!userContent) { res.status(400).json({ error: "content is required" }); return; }

    // Verify ownership
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId), isOpenAiConversation)).limit(1);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    // Save user message
    await db.insert(messages).values({ conversationId: id, role: "user", content: userContent });

    // Load full history for context
    const history = await db.select().from(messages)
      .where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));

    const chatMessages = history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 8192,
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant for a chatbot platform. Answer clearly and concisely.",
        },
        ...chatMessages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Save assistant reply
    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    // Auto-title from first user message
    if (conv.title === "New Chat" && history.length === 1) {
      await db.update(conversations)
        .set({ title: userContent.slice(0, 60).trim() })
        .where(eq(conversations.id, id));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "send message error");
    try {
      res.write(`data: ${JSON.stringify({ error: "AI error, please try again" })}\n\n`);
      res.end();
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;
