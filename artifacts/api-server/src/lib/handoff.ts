import { chatLogsTable } from "@workspace/db";
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
  const regex = /\[LEAD_DATA:\s*(\{.*?\})\s*\]/s;
  const match = botResponse.match(regex);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanResponse = botResponse.replace(regex, "").trim();
      return { cleanResponse, leadData: parsed };
    } catch (e) {
      // Failed to parse JSON, just return as is
    }
  }
  return { cleanResponse: botResponse, leadData: null };
}
