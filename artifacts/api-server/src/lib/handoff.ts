
import { eq, and, sql, type InferSelectModel } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { sendClientNotification } from "./email";
import { chatLogsTable, notificationsTable, usersTable } from "@workspace/db";

export function isHandoffRequested(userMessage: string, rawAiReply?: string, cleanAiReply?: string): boolean {
  if (rawAiReply && rawAiReply.includes("[HANDOFF_REQUESTED]")) return true;
  if (cleanAiReply && cleanAiReply.includes("[HANDOFF_REQUESTED]")) return true;

  const text = (userMessage || "").toLowerCase().trim();
  const keywords = [
    "خدمة العملاء", "خدمه العملاء", "خدمة عملاء", "خدمه عملاء",
    "الدعم الفني", "الدعم", "دعم فني", "موظف الدعم",
    "تحدث مع موظف", "تحدث مع شخص", "اريد موظف", "عايز موظف", "تكلم موظف", 
    "كلمني حد", "بني ادم", "شخص بشري", "انسان بشري", "اريد انسان", 
    "تحدث مع ممثل", "التحدث مع ممثل", "مسؤول الدعم", "خدمة الدعم", 
    "تواصل مع شخص", "تواصل مع موظف", "تحويل لموظف", "تحويل لممثل",
    "customer service", "customer support", "human agent", "talk to human", 
    "speak to human", "live agent", "support agent", "representative", 
    "talk to agent", "speak to agent", "real person", "talk to someone"
  ];

  return keywords.some(k => text.includes(k));
}

type ChatLog = InferSelectModel<typeof chatLogsTable>;

export function isSessionInHandoff(logs: ChatLog[]): boolean {
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    if (log.botResponse === "[HANDOFF_RESOLVED]") return false;
    if (log.isHandoff) return true;
  }
  return false;
}

export const HANDOFF_SYSTEM_PROMPT = `\n\nCRITICAL INSTRUCTION: If the user explicitly asks to speak to a human, customer service, or is extremely angry and the AI cannot resolve the issue, YOU MUST reply EXACTLY with "[HANDOFF_REQUESTED]" and nothing else. Do not apologize, do not explain. Just output "[HANDOFF_REQUESTED]".`;

export const LEAD_GEN_SYSTEM_PROMPT = `\nCRITICAL INSTRUCTION: If the user provides their contact information (email, phone number, etc.) or explicitly expresses interest in a product/service, you MUST extract this data and append a secret JSON block to the END of your response EXACTLY in this format:
[LEAD_DATA: {"name": "...", "email": "...", "phone": "...", "interest": "..."}]
Only include the fields you know. For example, if they only provide a phone number, output {"phone": "+1234567"}. DO NOT mention to the user that you are saving this data. Just append the block at the very end of your normal helpful response.`;

export function extractLeadData(botResponse: string): { cleanResponse: string, leadData: any | null } {
  // Try to match the LEAD_DATA block, being flexible about newlines or markdown backticks
  const regex = /\[LEAD_DATA:\s*([\s\S]*?)\s*\]/s;
  const match = botResponse.match(regex);
  if (match) {
    try {
      let jsonStr = match[1];
      // Clean up any markdown code blocks the AI might have added
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      const cleanResponse = botResponse.replace(regex, "").trim();
      return { cleanResponse, leadData: parsed };
    } catch (e) {
      // Failed to parse JSON, just return as is
    }
  }
  return { cleanResponse: botResponse, leadData: null };
}


export const METRICS_SYSTEM_PROMPT = `\nCRITICAL INSTRUCTION: Analyze the user's latest message and determine their sentiment (positive, neutral, negative, angry) and intent (sales, support, complaint, general). Append EXACTLY this secret JSON block to the END of your response:\n[METRICS: {"sentiment": "...", "intent": "..."}]`;

export function extractMetrics(botResponse: string): { cleanResponse: string, metrics: { sentiment?: string, intent?: string } | null } {
  const regex = /\[METRICS:\s*([\s\S]*?)\s*\]/s;
  const match = botResponse.match(regex);
  if (match) {
    try {
      let jsonStr = match[1];
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      const cleanResponse = botResponse.replace(regex, "").trim();
      return { cleanResponse, metrics: parsed };
    } catch (e) {
      return { cleanResponse: botResponse, metrics: null };
    }
  }
  return { cleanResponse: botResponse, metrics: null };
}


export async function triggerHandoffNotification(company: { id: number, clientId: number | null, name: string }, sessionId: string, channel: string) {
  if (!company.clientId) return;
  
  try {
    const title = `New Human Handoff Request (${channel})`;
    const message = `A customer on ${channel} wants to speak with a human agent. Please check the Universal Chat.\nSession: ${sessionId}`;

    await db.insert(notificationsTable).values({
      userId: company.clientId,
      type: "handoff_request",
      title,
      message,
      companyId: company.id,
      isRead: false
    });

    const [user] = await db
      .select({ email: usersTable.notificationEmail })
      .from(usersTable)
      .where(eq(usersTable.id, company.clientId))
      .limit(1);
    
    if (user && user.email) {
      await sendClientNotification(user.email, title, message).catch(e => logger.warn({ err: e }, "Handoff email failed"));
    }
  } catch (err) {
    logger.error({ err, companyId: company.id }, "Failed to trigger handoff notification");
  }
}


export async function triggerNewMessageNotification(company: { id: number, clientId: number | null, name: string }, sessionId: string, channel: string, customerMessage: string) {
  if (!company.clientId) return;
  try {
    const channelNames: Record<string, string> = {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      messenger: "Messenger",
      website: "Website Widget",
    };
    const channelDisplay = channelNames[channel] || channel;
    const title = `New message (${channelDisplay})`;
    const snippet = customerMessage.length > 50 ? customerMessage.substring(0, 50) + "..." : customerMessage;
    const sessionTag = sessionId ? sessionId.substring(0, 8) : "";
    
    // Check if an unread notification for this exact session exists
    const [existing] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.companyId, company.id),
          eq(notificationsTable.type, 'new_message'),
          eq(notificationsTable.isRead, false),
          sql`${notificationsTable.message} LIKE ${'%' + sessionTag + '%'}`
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(notificationsTable)
        .set({
          title,
          message: `[${sessionTag}] ${snippet}`,
          createdAt: new Date(),
        })
        .where(eq(notificationsTable.id, existing.id));
      return;
    }

    await db.insert(notificationsTable).values({
      userId: company.clientId,
      type: 'new_message',
      title,
      message: `[${sessionTag}] ${snippet}`,
      companyId: company.id,
      isRead: false
    });
  } catch (err) {
    logger.error({ err }, 'Error triggering new message notification');
  }
}
