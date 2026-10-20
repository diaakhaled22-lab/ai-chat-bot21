
import { eq, and, sql, type InferSelectModel } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { sendClientNotification } from "./email";
import { chatLogsTable, notificationsTable, usersTable, companiesTable } from "@workspace/db";

export const WAITING_LIST_RESPONSE_AR = "سيتم وضعك في قائمة الانتظار.";
export const WAITING_LIST_RESPONSE_EN = "You will be placed on the waiting list.";

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
    "التواصل مع خدمة العملاء", "تواصل مع خدمة العملاء", "الاتصال بخدمة العملاء",
    "اتصال بخدمة العملاء", "تواصل مع الدعم", "تواصل مع مسؤول", "محادثة موظف",
    "مندوب", "مسؤول", "كلم موظف", "كلم خدمة العملاء", "اريد التحدث مع خدمة العملاء",
    "أريد التحدث مع خدمة العملاء", "تحويل الى خدمة العملاء", "تحويل إلى خدمة العملاء",
    "customer service", "customer support", "human agent", "talk to human", 
    "speak to human", "live agent", "support agent", "representative", 
    "talk to agent", "speak to agent", "real person", "talk to someone",
    "contact customer service", "contact support", "call customer service",
    "contact someone", "reach an agent", "connect me with", "transfer to agent"
  ];

  const extraKeywords = [
    "خدمة العملة", "خدمه العملة", "خدمة العملا", "خدمه العملا", "خدمة عملا", "خدمه عملا", "خدمه العمله", "خدمة العمله",
    "الدعم المباشر", "ارغب في التواصل", "أرغب في التواصل", "ارغب بالتواصل", "أرغب بالتواصل",
    "اريد التواصل", "أريد التواصل", "عاوز اتواصل", "عايز اتواصل", "محتاج اتواصل",
    "محادثة مباشرة", "محادثه مباشره", "شات مباشر"
  ];
  if (keywords.some(k => text.includes(k)) || extraKeywords.some(k => text.includes(k))) return true;

  const hasHelpService = (text.includes("خدمة") || text.includes("خدمه")) &&
    (text.includes("عملاء") || text.includes("عملا") || text.includes("عملة") || text.includes("عمله") || text.includes("دعم") || text.includes("مساعدة") || text.includes("مساعده"));
  if (hasHelpService) return true;

  const hasHumanRequest = (text.includes("تواصل") || text.includes("اتصال") || text.includes("تحدث") || text.includes("كلم") || text.includes("تحويل")) &&
    (text.includes("موظف") || text.includes("بشري") || text.includes("إنسان") || text.includes("انسان") || text.includes("ممثل") || text.includes("شخص"));
  if (hasHumanRequest) return true;

  return false;
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

export const HANDOFF_SYSTEM_PROMPT = `\n\nCRITICAL INSTRUCTION: If the user explicitly asks to speak to a human, customer service, or attempts to contact them, or is extremely angry and the AI cannot resolve the issue, YOU MUST reply EXACTLY with "[HANDOFF_REQUESTED]" and nothing else. Do not apologize, do not explain. Just output "[HANDOFF_REQUESTED]".`;

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


import { notifyCustomerServiceRequest, notifyNewChatMessage } from "./companyNotification";

export async function triggerHandoffNotification(company: { id: number, clientId: number | null, name: string }, sessionId: string, channel: string) {
  try {
    // Allow preview sessions so client testing immediately reflects in the notification bell
    const isPreview = Boolean(sessionId && sessionId.startsWith("preview_"));

    const channelNames: Record<string, string> = {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      messenger: "Messenger",
      website: "Website Widget",
    };
    const channelDisplay = channelNames[channel] || channel;
    const title = isPreview ? `[طلب خدمة العملاء - تجربة] Customer Service Requested (${channelDisplay})` : `[طلب خدمة العملاء] Customer Service Requested (${channelDisplay})`;
    const message = `A customer on ${channelDisplay} requested human customer service. | طلب أحد العملاء على ${channelDisplay} التحدث مع خدمة العملاء. يرجى مراجعة الشات الشامل.`;

    let clientId = company.clientId;
    if (!clientId) {
      const [comp] = await db
        .select({ clientId: companiesTable.clientId })
        .from(companiesTable)
        .where(eq(companiesTable.id, company.id))
        .limit(1);
      clientId = comp?.clientId ?? null;
    }

    if (clientId) {
      await db.insert(notificationsTable).values({
        userId: clientId,
        type: "handoff_request",
        title,
        message,
        companyId: company.id,
        isRead: false
      });
    }

    // Send email notification to the company's notification email (company.notificationEmail / usersTable.notificationEmail)
    const emailResult = await notifyCustomerServiceRequest(
      { id: company.id, name: company.name },
      { channel, sessionId }
    );
    if (!emailResult?.ok) {
      logger.warn({ companyId: company.id, error: emailResult?.error }, "Customer service request email notification was not sent");
    } else {
      logger.info({ companyId: company.id, resendId: emailResult.id }, "Customer service request email notification delivered via Resend");
    }
  } catch (err) {
    logger.error({ err, companyId: company.id }, "Failed to trigger handoff notification");
  }
}


export async function triggerNewMessageNotification(company: { id: number, clientId: number | null, name: string }, sessionId: string, channel: string, customerMessage: string) {
  try {
    // Skip preview sessions
    if (sessionId && sessionId.startsWith("preview_")) return;

    // Per user requirement: In-app notification bell on client page triggers ONLY when:
    // (1) A new user starts a conversation (handled in notifyNewConversation)
    // (2) A user requests to contact customer service (handled in triggerHandoffNotification)
    // It should NOT trigger for every single individual message in an existing conversation.
  } catch (err) {
    logger.error({ err }, 'Error triggering new message notification');
  }
}
