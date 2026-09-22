import { db, adminConfigTable, companiesTable, chatLogsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
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

/**
 * Resolves the AI credentials for a company.
 * If the company has a quota assigned (monthlyTokenQuota != null) OR has no individual key,
 * it is linked to and uses the Support AI Agent credentials.
 */
export async function resolveCompanyAi(
  company: typeof companiesTable.$inferSelect
): Promise<ResolvedAiConfig> {
  // If company has an assigned quota OR has no API key of its own, use Support AI Agent
  if (company.monthlyTokenQuota !== null || !company.aiAgentApiKey) {
    const supportAi = await getSupportAiSettings();
    if (supportAi && supportAi.apiKey) {
      return {
        apiKey: supportAi.apiKey,
        provider: supportAi.provider,
        model: supportAi.model,
        isSupportAgent: true,
      };
    }
  }

  // Fallback to company's own configured API key
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

  throw new Error("No AI API key configured. Either set a company API key or assign a Quota linked to the Support AI Agent.");
}

/**
 * Checks whether the company has exceeded its monthly token quota.
 * Throws an error if exceeded.
 */
export async function assertCompanyQuotaNotExceeded(
  company: typeof companiesTable.$inferSelect
): Promise<{ usedTokens: number; quota: number | null }> {
  if (company.monthlyTokenQuota === null || company.monthlyTokenQuota === undefined) {
    return { usedTokens: 0, quota: null }; // Unlimited
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const logs = await db
    .select({ customerMessage: chatLogsTable.customerMessage, botResponse: chatLogsTable.botResponse })
    .from(chatLogsTable)
    .where(and(
      eq(chatLogsTable.companyId, company.id),
      gte(chatLogsTable.createdAt, monthStart),
    ));

  const CHARS_PER_TOKEN = 4;
  let usedTokens = 0;
  for (const log of logs) {
    usedTokens += Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
    usedTokens += Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
  }

  if (usedTokens >= company.monthlyTokenQuota) {
    throw new Error(`Monthly token quota of ${company.monthlyTokenQuota.toLocaleString()} tokens exceeded (${usedTokens.toLocaleString()} used). Responses are paused until the next billing cycle or quota increase.`);
  }

  return { usedTokens, quota: company.monthlyTokenQuota };
}
