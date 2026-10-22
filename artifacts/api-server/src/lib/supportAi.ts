import { db, adminConfigTable, companiesTable, chatLogsTable } from "@workspace/db";
import { eq, sql, and, gte, lte, or } from "drizzle-orm";
import { logger } from "./logger";
import { notifyQuota75PercentConsumed, notifyQuotaAmberLowBalance, notifyQuotaRedDepleted } from "./companyNotification";
import { sanitizeOpenRouterModel, sanitizeGoogleModel, sanitizeOpenAiModel, sanitizeAnthropicModel } from "./aiModels";

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

    const provider = (cfg["support_ai_provider"] as any) || "openai";
    const rawModel = cfg["support_ai_model"] || "gpt-4o-mini";
    const model = provider === "google"
      ? sanitizeGoogleModel(rawModel)
      : provider === "openrouter"
      ? sanitizeOpenRouterModel(rawModel)
      : provider === "openai"
      ? sanitizeOpenAiModel(rawModel)
      : provider === "anthropic"
      ? sanitizeAnthropicModel(rawModel)
      : rawModel;

    return {
      apiKey: key,
      provider,
      model,
    };
  } catch (err) {
    logger.error({ err }, "Failed to get Support AI settings");
    return null;
  }
}

/**
 * Retrieves Quota AI model and provider info configured on the AI / Quota page.
 * Strictly decoupled from Customer Problems (support_ai_...) settings.
 * Does not require an API key to be set, ensuring that UI components and dashboards
 * always display the administrator's configured quota model.
 */
export async function getQuotaAiModelInfo(): Promise<{
  provider: "openai" | "anthropic" | "google" | "openrouter";
  model: string;
}> {
  try {
    const rows = await db.select().from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('quota_ai_provider', 'quota_ai_model')`);
    
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value ?? ""]));
    const provider = (cfg["quota_ai_provider"] as any) || "openai";
    const defaultModel =
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini";
    const rawModel = cfg["quota_ai_model"]?.trim() || defaultModel;
    const model = provider === "google"
      ? sanitizeGoogleModel(rawModel)
      : provider === "openrouter"
      ? sanitizeOpenRouterModel(rawModel)
      : provider === "openai"
      ? sanitizeOpenAiModel(rawModel)
      : provider === "anthropic"
      ? sanitizeAnthropicModel(rawModel)
      : rawModel;

    return { provider, model };
  } catch (err) {
    logger.error({ err }, "Failed to get Quota AI model info");
    return { provider: "openai", model: "gpt-4o-mini" };
  }
}

export async function getQuotaAiSettings(): Promise<{
  apiKey: string;
  provider: "openai" | "anthropic" | "google" | "openrouter";
  model: string;
} | null> {
  try {
    const rows = await db.select().from(adminConfigTable)
      .where(sql`${adminConfigTable.key} IN ('quota_ai_api_key', 'quota_ai_provider', 'quota_ai_model', 'support_ai_api_key')`);
    
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value ?? ""]));
    
    // Model and Provider strictly from Quota AI settings:
    const provider = (cfg["quota_ai_provider"] as any) || "openai";
    const defaultModel =
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini";
    const rawModel = cfg["quota_ai_model"]?.trim() || defaultModel;
    const model = provider === "google"
      ? sanitizeGoogleModel(rawModel)
      : provider === "openrouter"
      ? sanitizeOpenRouterModel(rawModel)
      : provider === "openai"
      ? sanitizeOpenAiModel(rawModel)
      : provider === "anthropic"
      ? sanitizeAnthropicModel(rawModel)
      : rawModel;

    // Resolve API key
    let key = cfg["quota_ai_api_key"]?.trim();
    if (!key) {
      if (provider === "openai" && process.env.OPENAI_API_KEY) key = process.env.OPENAI_API_KEY;
      else if (provider === "google" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      else if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) key = process.env.ANTHROPIC_API_KEY;
      else if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) key = process.env.OPENROUTER_API_KEY;
      else if (cfg["support_ai_api_key"]?.trim()) key = cfg["support_ai_api_key"]?.trim();
    }

    if (!key) return null;

    return {
      apiKey: key,
      provider,
      model,
    };
  } catch (err) {
    logger.error({ err }, "Failed to get Quota AI settings");
    return null;
  }
}


/**
 * Resolves the AI credentials for a company.
 * - IF aiExecutionMode === "tokens":
 *   Usage is drawn strictly from the company's own configured aiAgentApiKey and model.
 * - IF aiExecutionMode === "quota" (or default):
 *   Usage is drawn from the Platform Quota AI Agent credentials (configured on AI / Quota page)
 *   provided that the company has a valid monthlyTokenQuota assigned.
 *   If no quota has been assigned by the admin yet, falls back to personal key if configured.
 */
export async function resolveCompanyAi(
  company: typeof companiesTable.$inferSelect
): Promise<ResolvedAiConfig> {
  const mode = (company as any).aiExecutionMode || "quota";

  // Case 1: Company explicitly selected "tokens" (Own API key / BYOK mode)
  if (mode === "tokens") {
    if (company.aiAgentApiKey) {
      const provider = (company.aiProvider as any) || "openai";
      const defaultModel =
        provider === "anthropic" ? "claude-3-5-haiku-20241022" :
        provider === "google" ? "gemini-2.0-flash" :
        provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini";
      const rawModel = company.aiModel || defaultModel;
      const model = provider === "google"
        ? sanitizeGoogleModel(rawModel)
        : provider === "openrouter"
        ? sanitizeOpenRouterModel(rawModel)
        : provider === "openai"
        ? sanitizeOpenAiModel(rawModel)
        : provider === "anthropic"
        ? sanitizeAnthropicModel(rawModel)
        : rawModel;

      return {
        apiKey: company.aiAgentApiKey,
        provider,
        model,
        isSupportAgent: false,
      };
    }
    throw new Error("نمط العمل محدد على رموز API الخاصة، ولكن لم يتم إدخال مفتاح API في قسم إعدادات الذكاء الاصطناعي.");
  }

  // Case 2: Company selected "quota" (Platform Quota mode)
  const hasQuota = company.monthlyTokenQuota !== null && company.monthlyTokenQuota !== undefined && company.monthlyTokenQuota > 0;
  if (hasQuota) {
    const quotaAi = await getQuotaAiSettings();
    if (quotaAi && quotaAi.apiKey) {
      let effectiveApiKey = quotaAi.apiKey;
      let effectiveProvider = quotaAi.provider;
      let effectiveModel = quotaAi.model;

      if (company.aiModel && company.aiModel.trim()) {
        const rawModel = company.aiModel.trim();
        const customProvider = (company.aiProvider as any) || quotaAi.provider;

        if (company.aiAgentApiKey) {
          effectiveApiKey = company.aiAgentApiKey;
          effectiveProvider = customProvider;
        } else if (customProvider === quotaAi.provider) {
          effectiveProvider = customProvider;
        } else if (quotaAi.provider === "openrouter") {
          effectiveProvider = "openrouter";
        } else {
          const envKey =
            customProvider === "google" ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || process.env.GOOGLE_API_KEY) :
            customProvider === "openai" ? process.env.OPENAI_API_KEY :
            customProvider === "anthropic" ? process.env.ANTHROPIC_API_KEY :
            customProvider === "openrouter" ? process.env.OPENROUTER_API_KEY : null;
          if (envKey) {
            effectiveApiKey = envKey;
            effectiveProvider = customProvider;
          }
        }

        effectiveModel = effectiveProvider === "google"
          ? sanitizeGoogleModel(rawModel)
          : effectiveProvider === "openrouter"
          ? sanitizeOpenRouterModel(rawModel)
          : effectiveProvider === "openai"
          ? sanitizeOpenAiModel(rawModel)
          : effectiveProvider === "anthropic"
          ? sanitizeAnthropicModel(rawModel)
          : rawModel;
      }

      return {
        apiKey: effectiveApiKey,
        provider: effectiveProvider,
        model: effectiveModel,
        isSupportAgent: true,
      };
    } else {
      throw new Error("لم يتم إعداد مفتاح وكيل حصص الشركات (Company Quota AI Agent) في صفحة AI / Quota حتى الآن.");
    }
  }

  // If in quota mode, but no admin quota has been assigned yet:
  if (company.aiAgentApiKey) {
    const provider = (company.aiProvider as any) || "openai";
    const defaultModel =
      provider === "anthropic" ? "claude-3-5-haiku-20241022" :
      provider === "google" ? "gemini-2.0-flash" :
      provider === "openrouter" ? "openrouter/free" : "gpt-4o-mini";
    const rawModel = company.aiModel || defaultModel;
    const model = provider === "google"
      ? sanitizeGoogleModel(rawModel)
      : provider === "openrouter"
      ? sanitizeOpenRouterModel(rawModel)
      : provider === "openai"
      ? sanitizeOpenAiModel(rawModel)
      : provider === "anthropic"
      ? sanitizeAnthropicModel(rawModel)
      : rawModel;

    return {
      apiKey: company.aiAgentApiKey,
      provider,
      model,
      isSupportAgent: false,
    };
  }

  // No quota and no personal key
  throw new Error("لم يتم تخصيص حصة رموز (Token Quota) لهذه الشركة، ولا يوجد مفتاح API خاص بها. يرجى مراجعة إدارة المنصة لتحديد حصة أو إدخال مفتاحك الخاص.");
}

/**
 * Checks whether the company has exceeded its monthly token quota or has no quota allocated.
 * When in "tokens" mode, platform token quota restrictions do not apply.
 */
export async function assertCompanyQuotaNotExceeded(
  company: typeof companiesTable.$inferSelect
): Promise<{ usedTokens: number; quota: number | null }> {
  const mode = (company as any).aiExecutionMode || "quota";

  // If company is operating on their own API tokens (BYOK):
  if (mode === "tokens") {
    if (company.aiAgentApiKey) {
      return { usedTokens: 0, quota: null };
    }
    throw new Error("نمط العمل محدد على رموز API الخاصة، ولكن لم يتم إدخال مفتاح API خاص بالشركة بعد.");
  }

  // Otherwise, operating on Admin Quota:
  const hasQuota = company.monthlyTokenQuota !== null && company.monthlyTokenQuota !== undefined && company.monthlyTokenQuota > 0;

  // If no quota is set:
  if (!hasQuota) {
    if (company.aiAgentApiKey) {
      return { usedTokens: 0, quota: null };
    }
    throw new Error("لم يتم تخصيص حصة رموز (Token Quota) لهذه الشركة. يرجى تحديد حصة من لوحة الإدارة أولاً لتفعيل الردود أو التبديل إلى نمط رموز API الخاصة.");
  }

  // Quota Validity Period Check (Independent from Subscription activationStart/activationEnd):
  const now = new Date();
  if (company.quotaStartDate && now < new Date(company.quotaStartDate)) {
    throw new Error(
      `فترة صلاحية استخدام حصة الذكاء الاصطناعي (AI Quota) المخصصة لهذه الشركة لم تبدأ بعد (تبدأ بتاريخ ${new Date(company.quotaStartDate).toLocaleDateString("ar-EG")}).`
    );
  }
  if (company.quotaEndDate && now > new Date(company.quotaEndDate)) {
    throw new Error(
      `انتهت فترة صلاحية استخدام حصة الذكاء الاصطناعي (AI Quota) المخصصة لهذه الشركة بتاريخ (${new Date(company.quotaEndDate).toLocaleDateString("ar-EG")}). يرجى تجديد أو تمديد صلاحية الحصة.`
    );
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // If company has quotaStartDate, respect it as the starting window if later than monthStart
  let effectiveStart = monthStart;
  if (company.quotaStartDate) {
    const qStart = new Date(company.quotaStartDate);
    if (!isNaN(qStart.getTime()) && qStart > effectiveStart) {
      effectiveStart = qStart;
    }
  }

  // Check reset timestamps from admin_config
  const resetConfig = await db
    .select({ key: adminConfigTable.key, value: adminConfigTable.value })
    .from(adminConfigTable)
    .where(or(
      eq(adminConfigTable.key, `quota_reset_company_${company.id}`),
      eq(adminConfigTable.key, "quota_reset_all")
    ));

  for (const r of resetConfig) {
    if (r.value) {
      const d = new Date(r.value);
      if (!isNaN(d.getTime()) && d > effectiveStart) {
        effectiveStart = d;
      }
    }
  }

  const logConditions = [
    eq(chatLogsTable.companyId, company.id),
    gte(chatLogsTable.createdAt, effectiveStart),
  ];
  if (company.quotaEndDate) {
    const qEnd = new Date(company.quotaEndDate);
    if (!isNaN(qEnd.getTime())) {
      logConditions.push(lte(chatLogsTable.createdAt, qEnd));
    }
  }

  const logs = await db
    .select({ customerMessage: chatLogsTable.customerMessage, botResponse: chatLogsTable.botResponse })
    .from(chatLogsTable)
    .where(and(...logConditions));

  const CHARS_PER_TOKEN = 4;
  let usedTokens = 0;
  for (const log of logs) {
    usedTokens += Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
    usedTokens += Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
  }

  // Trigger automated threshold warnings for Client Notification Panel & Email:
  if (company.monthlyTokenQuota && company.monthlyTokenQuota > 0 && company.clientId) {
    await checkAndTriggerQuotaNotifications({
      company: { id: company.id, name: company.name, clientId: company.clientId },
      monthlyQuota: company.monthlyTokenQuota,
      usedTokens,
      effectiveStart,
    });
  }

  if (usedTokens >= company.monthlyTokenQuota!) {
    throw new Error(`تم استنفاد كامل حصة الرموز الشهرية المحددة للشركة (${company.monthlyTokenQuota!.toLocaleString()} رمز). توقفت الردود التلقائية مؤقتاً حتى التجديد أو شحن رصيد إضافي.`);
  }

  return { usedTokens, quota: company.monthlyTokenQuota };
}

/**
 * Checks quota threshold levels and sends in-app notifications + emails:
 * 🟡 Amber: Automatically triggers a warning when the balance drops below 20% (>= 80% consumed).
 * 🔴 Red: Triggers an urgent alert when the balance is completely depleted (0 remaining / >= 100% consumed).
 */
export async function checkAndTriggerQuotaNotifications(params: {
  company: { id: number; name: string; clientId: number };
  monthlyQuota: number;
  usedTokens: number;
  effectiveStart: Date;
}) {
  const { company, monthlyQuota, usedTokens, effectiveStart } = params;
  if (!monthlyQuota || monthlyQuota <= 0 || !company.clientId) return;

  const cycleTimestamp = effectiveStart.getTime();
  const remainingTokens = Math.max(monthlyQuota - usedTokens, 0);
  const percentUsed = Math.min(Math.round((usedTokens / monthlyQuota) * 100), 100);

  // 1. Red Alert (🔴): Completely depleted (0 remaining / >= 100% used)
  if (usedTokens >= monthlyQuota) {
    const redKey = `quota_red_alert_${company.id}_${cycleTimestamp}`;
    try {
      const [existing] = await db
        .select({ key: adminConfigTable.key })
        .from(adminConfigTable)
        .where(eq(adminConfigTable.key, redKey))
        .limit(1);

      if (!existing) {
        await db.insert(adminConfigTable).values({ key: redKey, value: new Date().toISOString() }).onConflictDoNothing().catch(() => {});
        await notifyQuotaRedDepleted(company, {
          usedTokens,
          monthlyQuota,
          remainingTokens: 0,
          percentUsed: 100,
        });
      }
    } catch (err) {
      logger.warn({ err, companyId: company.id }, "Error checking/triggering red depleted quota alert");
    }
    return;
  }

  // 2. Amber Alert (🟡): Balance drops below 20% (>= 80% used)
  if ((usedTokens / monthlyQuota) >= 0.80) {
    const amberKey = `quota_amber_alert_${company.id}_${cycleTimestamp}`;
    try {
      const [existing] = await db
        .select({ key: adminConfigTable.key })
        .from(adminConfigTable)
        .where(eq(adminConfigTable.key, amberKey))
        .limit(1);

      if (!existing) {
        await db.insert(adminConfigTable).values({ key: amberKey, value: new Date().toISOString() }).onConflictDoNothing().catch(() => {});
        await notifyQuotaAmberLowBalance(company, {
          usedTokens,
          monthlyQuota,
          remainingTokens,
          percentUsed,
        });
      }
    } catch (err) {
      logger.warn({ err, companyId: company.id }, "Error checking/triggering amber low quota alert");
    }
  }
}
