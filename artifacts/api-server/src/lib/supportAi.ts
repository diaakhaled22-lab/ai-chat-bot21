import { db, adminConfigTable, companiesTable, chatLogsTable } from "@workspace/db";
import { eq, sql, and, gte, or } from "drizzle-orm";
import { logger } from "./logger";

export interface ResolvedAiConfig {
  apiKey: string;
  provider: "openai" | "anthropic" | "google" | "openrouter";
  model: string;
  isSupportAgent: boolean;
}

export async function getSupportAiSettings(): Promise<{
  apiKey: string;
  provider: "openai" | "anthropic" | "google" | "openrouter";
  model: string;
} | null> {
  try {
    const rows = await db.select().from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value ?? ""]));
    const key = cfg["support_ai_api_key"]?.trim();
    if (!key) return null;

    return {
      apiKey: key,
      provider: (cfg["support_ai_provider"] as any) || "openai",
      model: cfg["support_ai_model"] || "gpt-4o-mini",
    };
  } catch (err) {
    logger.error({ err }, "Failed to get Support AI settings");
    return null;
  }
}

export async function getQuotaAiSettings(): Promise<{
  apiKey: string;
  provider: "openai" | "anthropic" | "google" | "openrouter";
  model: string;
} | null> {
  try {
    const rows = await db.select().from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('quota_ai_api_key', 'quota_ai_provider', 'quota_ai_model', 'support_ai_api_key', 'support_ai_provider', 'support_ai_model')`);
    
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value ?? ""]));
    const key = cfg["quota_ai_api_key"]?.trim() || cfg["support_ai_api_key"]?.trim();
    if (!key) return null;

    return {
      apiKey: key,
      provider: (cfg["quota_ai_provider"] || cfg["support_ai_provider"] || "openai") as any,
      model: cfg["quota_ai_model"] || cfg["support_ai_model"] || "gpt-4o-mini",
    };
  } catch (err) {
    logger.error({ err }, "Failed to get Quota AI settings");
    return null;
  }
}

/**
 * Resolves the AI credentials for a company.
 * - IF a token quota is set (monthlyTokenQuota > 0):
 *   Usage is drawn from the Company Quota AI Agent credentials (configured on AI / Quota page).
 * - IF NO token quota is set (null or <= 0):
 *   It will NEVER draw from Platform / Quota AI Agent.
 *   It only draws from the company's own configured aiAgentApiKey.
 *   If the company has no personal key, it throws an error.
 */
export async function resolveCompanyAi(
  company: typeof companiesTable.$inferSelect
): Promise<ResolvedAiConfig> {
  const hasQuota = company.monthlyTokenQuota !== null && company.monthlyTokenQuota !== undefined && company.monthlyTokenQuota > 0;

  // Case 1: Company has an assigned quota -> Use Company Quota AI Agent
  if (hasQuota) {
    const quotaAi = await getQuotaAiSettings();
    if (quotaAi && quotaAi.apiKey) {
      return {
        apiKey: quotaAi.apiKey,
        provider: quotaAi.provider,
        model: quotaAi.model,
        isSupportAgent: true,
      };
    } else {
      throw new Error("لم يتم إعداد مفتاح وكيل حصص الشركات (Company Quota AI Agent) في صفحة AI / Quota حتى الآن.");
    }
  }

  // Case 2: No quota set -> NEVER use Support AI Agent. Only use company's personal key if configured.
  if (company.aiAgentApiKey) {
    const provider = (company.aiProvider as any) || "openai";
    const model = company.aiModel || (
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "google/gemma-4-31b-it:free" : "gpt-4o-mini"
    );

    return {
      apiKey: company.aiAgentApiKey,
      provider,
      model,
      isSupportAgent: false,
    };
  }

  // Case 3: No quota and no personal key -> Blocked
  throw new Error("لم يتم تخصيص حصة رموز (Token Quota) لهذه الشركة، ولا يوجد مفتاح API خاص بها. يرجى مراجعة إدارة المنصة لتحديد حصة.");
}

/**
 * Checks whether the company has exceeded its monthly token quota or has no quota allocated.
 * Throws an error if exceeded or if no quota is allocated without a personal key.
 */
export async function assertCompanyQuotaNotExceeded(
  company: typeof companiesTable.$inferSelect
): Promise<{ usedTokens: number; quota: number | null }> {
  const hasQuota = company.monthlyTokenQuota !== null && company.monthlyTokenQuota !== undefined && company.monthlyTokenQuota > 0;

  // If no quota is set:
  if (!hasQuota) {
    // If company provided their own API key, they can run on their own key
    if (company.aiAgentApiKey) {
      return { usedTokens: 0, quota: null };
    }
    // Otherwise, blocked completely!
    throw new Error("لم يتم تخصيص حصة رموز (Token Quota) لهذه الشركة. يرجى تحديد حصة من لوحة الإدارة أولاً لتفعيل الردود.");
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Check reset timestamps from admin_config
  const resetConfig = await db
    .select({ key: adminConfigTable.key, value: adminConfigTable.value })
    .from(adminConfigTable)
    .where(or(
      eq(adminConfigTable.key, `quota_reset_company_${company.id}`),
      eq(adminConfigTable.key, "quota_reset_all")
    ));

  let effectiveStart = monthStart;
  for (const r of resetConfig) {
    if (r.value) {
      const d = new Date(r.value);
      if (!isNaN(d.getTime()) && d > effectiveStart) {
        effectiveStart = d;
      }
    }
  }

  const logs = await db
    .select({ customerMessage: chatLogsTable.customerMessage, botResponse: chatLogsTable.botResponse })
    .from(chatLogsTable)
    .where(and(
      eq(chatLogsTable.companyId, company.id),
      gte(chatLogsTable.createdAt, effectiveStart),
    ));

  const CHARS_PER_TOKEN = 4;
  let usedTokens = 0;
  for (const log of logs) {
    usedTokens += Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
    usedTokens += Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
  }

  if (usedTokens >= company.monthlyTokenQuota!) {
    throw new Error(`تم تجاوز حصة الرموز الشهرية المحددة للشركة (${company.monthlyTokenQuota!.toLocaleString()} رمز). يرجى ترقية الحصة.`);
  }

  return { usedTokens, quota: company.monthlyTokenQuota };
}
