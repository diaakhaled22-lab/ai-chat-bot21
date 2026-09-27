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
