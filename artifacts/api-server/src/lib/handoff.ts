
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { sendClientNotification } from "./email";
import { chatLogsTable, notificationsTable, usersTable } from "@workspace/db";
import { type InferSelectModel } from "drizzle-orm";

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
      .select({ email: usersTable.notificationEmail, fallback: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, company.clientId))
      .limit(1);
    
    if (user) {
      const emailToUse = user.email || user.fallback;
      if (emailToUse) {
        await sendClientNotification(emailToUse, title, message).catch(e => logger.warn({ err: e }, "Handoff email failed"));
      }
    }
  } catch (err) {
    logger.error({ err, companyId: company.id }, "Failed to trigger handoff notification");
  }
}
