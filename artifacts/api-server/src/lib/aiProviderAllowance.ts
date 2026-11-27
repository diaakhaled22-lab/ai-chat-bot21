import { db, chatLogsTable, companiesTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, gte } from "drizzle-orm";
import { getAdminConfigMap, upsertAdminConfig } from "./adminConfig";
import { dispatchAdminNotificationEmail } from "./email";
import {
  getModelPricing,
  isAnthropicFreeModel,
  isGoogleFreeModel,
  isOpenAiFreeModel,
  isOpenRouterFreeModel,
  sanitizeAnthropicModel,
  sanitizeGoogleModel,
  sanitizeOpenAiModel,
  sanitizeOpenRouterModel,
} from "./aiModels";
import { logger } from "./logger";

const CHARS_PER_TOKEN = 4;
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000;

export type AllowanceScope = "quota" | "support";
export type ProviderConnectionStatus =
  | "ok"
  | "no_key"
  | "invalid_key"
  | "quota_exceeded"
  | "insufficient_credits"
  | "error";

export interface ProviderLiveQuotaInfo {
  source: "openrouter_api" | "openai_headers" | "anthropic_headers" | "google_metadata" | "unavailable";
  isFreeTier?: boolean;
  creditLimitUsd?: number | null;
  creditRemainingUsd?: number | null;
  usageDailyUsd?: number | null;
  usageWeeklyUsd?: number | null;
  usageMonthlyUsd?: number | null;
  rateLimitRequests?: number | null;
  rateLimitInterval?: string | null;
  tokensLimitPerWindow?: number | null;
  tokensRemainingPerWindow?: number | null;
  tokensResetAt?: string | null;
  requestsLimitPerWindow?: number | null;
  requestsRemainingPerWindow?: number | null;
  requestsResetAt?: string | null;
  modelInputTokenLimit?: number | null;
  modelOutputTokenLimit?: number | null;
  error?: string;
}

export interface AllowanceWindowStats {
  usedTokens: number;
  limitTokens: number;
  remainingTokens: number;
  remainingPercent: number;
  usedPercent: number;
  requests: number;
  costUsd: number;
  limitSource: "custom" | "provider_api" | "tier_default";
}

export interface AiProviderAllowanceResponse {
  scope: AllowanceScope;
  provider: string;
  model: string;
  planTier: "free" | "paid";
  hasApiKey: boolean;
  connectionStatus: ProviderConnectionStatus;
  daily: AllowanceWindowStats;
  weekly: AllowanceWindowStats;
  liveProvider: ProviderLiveQuotaInfo;
  checkedAt: string;
}

interface ProbeCacheEntry {
  cacheKey: string;
  expiresAt: number;
  connectionStatus: ProviderConnectionStatus;
  liveProvider: ProviderLiveQuotaInfo;
}

const probeCache = new Map<string, ProbeCacheEntry>();

export function clearAiProviderAllowanceCache(scope?: AllowanceScope): void {
  if (!scope) {
    probeCache.clear();
    return;
  }
  for (const key of probeCache.keys()) {
    if (key.startsWith(`${scope}:`)) {
      probeCache.delete(key);
    }
  }
}

function parseOptionalHeaderInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isModelFree(provider: string, model: string): boolean {
  if (provider === "openrouter") return isOpenRouterFreeModel(model);
  if (provider === "google") return isGoogleFreeModel(model);
  if (provider === "anthropic") return isAnthropicFreeModel(model);
  return isOpenAiFreeModel(model);
}

function getDefaultLimits(planTier: "free" | "paid"): { daily: number; weekly: number } {
  if (planTier === "free") {
    return { daily: 250_000, weekly: 1_500_000 };
  }
  return { daily: 2_000_000, weekly: 14_000_000 };
}

function computeWindowStats(
  usedTokens: number,
  limitTokens: number,
  requests: number,
  costUsd: number,
  limitSource: AllowanceWindowStats["limitSource"]
): AllowanceWindowStats {
  const safeLimit = Math.max(1, Math.round(limitTokens));
  const safeUsed = Math.max(0, Math.round(usedTokens));
  const remainingTokens = Math.max(0, safeLimit - safeUsed);
  const usedPercent = Math.min(100, Math.max(0, Math.round((safeUsed / safeLimit) * 1000) / 10));
  const remainingPercent = Math.max(0, Math.round((100 - usedPercent) * 10) / 10);

  return {
    usedTokens: safeUsed,
    limitTokens: safeLimit,
    remainingTokens,
    remainingPercent,
    usedPercent,
    requests,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    limitSource,
  };
}

async function probeProviderLive(
  provider: string,
  model: string,
  apiKey: string
): Promise<{ connectionStatus: ProviderConnectionStatus; liveProvider: ProviderLiveQuotaInfo }> {
  try {
    if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/key", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "BotManager/1.0",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 401 || res.status === 403) {
        return {
          connectionStatus: "invalid_key",
          liveProvider: { source: "openrouter_api", error: "Invalid or revoked OpenRouter API key" },
        };
      }

      if (res.ok) {
        const json = (await res.json()) as {
          data?: {
            limit?: number | null;
            limit_remaining?: number | null;
            usage_daily?: number | null;
            usage_weekly?: number | null;
            usage_monthly?: number | null;
            is_free_tier?: boolean;
            rate_limit?: { requests?: number; interval?: string };
          };
        };
        const d = json?.data ?? {};
        const creditLimit = typeof d.limit === "number" ? d.limit : null;
        const creditRemaining = typeof d.limit_remaining === "number" ? d.limit_remaining : null;
        const isInsufficient = creditLimit !== null && creditLimit > 0 && creditRemaining !== null && creditRemaining <= 0;

        return {
          connectionStatus: isInsufficient ? "insufficient_credits" : "ok",
          liveProvider: {
            source: "openrouter_api",
            isFreeTier: Boolean(d.is_free_tier),
            creditLimitUsd: creditLimit,
            creditRemainingUsd: creditRemaining,
            usageDailyUsd: typeof d.usage_daily === "number" ? d.usage_daily : null,
            usageWeeklyUsd: typeof d.usage_weekly === "number" ? d.usage_weekly : null,
            usageMonthlyUsd: typeof d.usage_monthly === "number" ? d.usage_monthly : null,
            rateLimitRequests: typeof d.rate_limit?.requests === "number" ? d.rate_limit.requests : null,
            rateLimitInterval: d.rate_limit?.interval ?? null,
          },
        };
      }

      return {
        connectionStatus: res.status === 402 ? "insufficient_credits" : res.status === 429 ? "quota_exceeded" : "error",
        liveProvider: { source: "openrouter_api", error: `OpenRouter returned HTTP ${res.status}` },
      };
    }

    if (provider === "openai") {
      const cleanModel = sanitizeOpenAiModel(model);
      const isReasoning = cleanModel.startsWith("o1") || cleanModel.startsWith("o3");
      const bodyPayload: Record<string, any> = {
        model: cleanModel,
        messages: [{ role: "user", content: "hi" }],
      };
      if (isReasoning) bodyPayload.max_completion_tokens = 1;
      else bodyPayload.max_tokens = 1;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(10000),
      });

      const liveProvider: ProviderLiveQuotaInfo = {
        source: "openai_headers",
        tokensLimitPerWindow: parseOptionalHeaderInt(res.headers, "x-ratelimit-limit-tokens"),
        tokensRemainingPerWindow: parseOptionalHeaderInt(res.headers, "x-ratelimit-remaining-tokens"),
        tokensResetAt: res.headers.get("x-ratelimit-reset-tokens"),
        requestsLimitPerWindow: parseOptionalHeaderInt(res.headers, "x-ratelimit-limit-requests"),
        requestsRemainingPerWindow: parseOptionalHeaderInt(res.headers, "x-ratelimit-remaining-requests"),
        requestsResetAt: res.headers.get("x-ratelimit-reset-requests"),
      };

      if (res.ok) return { connectionStatus: "ok", liveProvider };
      if (res.status === 401 || res.status === 403) {
        return { connectionStatus: "invalid_key", liveProvider: { ...liveProvider, error: "Invalid OpenAI API key" } };
      }
      if (res.status === 429) {
        return { connectionStatus: "quota_exceeded", liveProvider: { ...liveProvider, error: "OpenAI rate limit / quota exceeded" } };
      }
      return { connectionStatus: "error", liveProvider: { ...liveProvider, error: `OpenAI returned HTTP ${res.status}` } };
    }

    if (provider === "anthropic") {
      const cleanModel = sanitizeAnthropicModel(model);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cleanModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10000),
      });

      const liveProvider: ProviderLiveQuotaInfo = {
        source: "anthropic_headers",
        tokensLimitPerWindow:
          parseOptionalHeaderInt(res.headers, "anthropic-ratelimit-tokens-limit") ??
          parseOptionalHeaderInt(res.headers, "anthropic-ratelimit-input-tokens-limit"),
        tokensRemainingPerWindow:
          parseOptionalHeaderInt(res.headers, "anthropic-ratelimit-tokens-remaining") ??
          parseOptionalHeaderInt(res.headers, "anthropic-ratelimit-input-tokens-remaining"),
        tokensResetAt:
          res.headers.get("anthropic-ratelimit-tokens-reset") ??
          res.headers.get("anthropic-ratelimit-input-tokens-reset"),
        requestsLimitPerWindow: parseOptionalHeaderInt(res.headers, "anthropic-ratelimit-requests-limit"),
        requestsRemainingPerWindow: parseOptionalHeaderInt(res.headers, "anthropic-ratelimit-requests-remaining"),
        requestsResetAt: res.headers.get("anthropic-ratelimit-requests-reset"),
      };

      if (res.ok) return { connectionStatus: "ok", liveProvider };
      if (res.status === 401 || res.status === 403) {
        return { connectionStatus: "invalid_key", liveProvider: { ...liveProvider, error: "Invalid Anthropic API key" } };
      }
      if (res.status === 429) {
        return { connectionStatus: "quota_exceeded", liveProvider: { ...liveProvider, error: "Anthropic rate limit / quota exceeded" } };
      }
      return { connectionStatus: "error", liveProvider: { ...liveProvider, error: `Anthropic returned HTTP ${res.status}` } };
    }

    if (provider === "google") {
      const cleanModel = sanitizeGoogleModel(model).replace(/^models\//, "");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(8000),
        }
      );

      if (res.ok) {
        const meta = (await res.json()) as { inputTokenLimit?: number; outputTokenLimit?: number };
        return {
          connectionStatus: "ok",
          liveProvider: {
            source: "google_metadata",
            modelInputTokenLimit: typeof meta.inputTokenLimit === "number" ? meta.inputTokenLimit : null,
            modelOutputTokenLimit: typeof meta.outputTokenLimit === "number" ? meta.outputTokenLimit : null,
          },
        };
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        return {
          connectionStatus: "invalid_key",
          liveProvider: { source: "google_metadata", error: "Invalid Google AI API key or model unavailable" },
        };
      }
      if (res.status === 429) {
        return {
          connectionStatus: "quota_exceeded",
          liveProvider: { source: "google_metadata", error: "Google AI quota exceeded" },
        };
      }
      return {
        connectionStatus: "error",
        liveProvider: { source: "google_metadata", error: `Google AI returned HTTP ${res.status}` },
      };
    }
  } catch (err) {
    logger.warn({ err, provider, model }, "Error probing AI provider live allowance");
    return {
      connectionStatus: "error",
      liveProvider: {
        source: "unavailable",
        error: err instanceof Error ? err.message : "Network error",
      },
    };
  }

  return {
    connectionStatus: "error",
    liveProvider: { source: "unavailable", error: `Unsupported provider: ${provider}` },
  };
}

export async function getAiProviderAllowance(
  scope: AllowanceScope,
  forceRefresh = false
): Promise<AiProviderAllowanceResponse> {
  const dailyKey = `ai_allowance_daily_tokens_${scope}`;
  const weeklyKey = `ai_allowance_weekly_tokens_${scope}`;
  const cfgMap = await getAdminConfigMap([
    "quota_ai_api_key",
    "quota_ai_provider",
    "quota_ai_model",
    "support_ai_api_key",
    "support_ai_provider",
    "support_ai_model",
    dailyKey,
    weeklyKey,
  ]);

  const provider =
    scope === "quota"
      ? cfgMap.get("quota_ai_provider") || "openai"
      : cfgMap.get("support_ai_provider") || "openai";

  const defaultModel =
    provider === "anthropic"
      ? "claude-3-5-haiku-20241022"
      : provider === "google"
      ? "gemini-2.0-flash"
      : provider === "openrouter"
      ? "openrouter/free"
      : "gpt-4o-mini";

  const rawModel =
    (scope === "quota" ? cfgMap.get("quota_ai_model") : cfgMap.get("support_ai_model")) || defaultModel;
  const model = provider === "openrouter" ? sanitizeOpenRouterModel(rawModel) : rawModel;

  let apiKey =
    (scope === "quota" ? cfgMap.get("quota_ai_api_key") : cfgMap.get("support_ai_api_key"))?.trim() || "";
  if (!apiKey) {
    if (provider === "openai" && process.env.OPENAI_API_KEY) apiKey = process.env.OPENAI_API_KEY.trim();
    else if (provider === "google" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
      apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!.trim();
    } else if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      apiKey = process.env.ANTHROPIC_API_KEY.trim();
    } else if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
      apiKey = process.env.OPENROUTER_API_KEY.trim();
    } else if (scope === "quota" && cfgMap.get("support_ai_api_key")?.trim()) {
      apiKey = cfgMap.get("support_ai_api_key")!.trim();
    }
  }

  let connectionStatus: ProviderConnectionStatus = "no_key";
  let liveProvider: ProviderLiveQuotaInfo = { source: "unavailable" };

  if (apiKey) {
    const cacheKey = `${scope}:${provider}:${model}`;
    const cached = probeCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      connectionStatus = cached.connectionStatus;
      liveProvider = cached.liveProvider;
    } else {
      const probed = await probeProviderLive(provider, model, apiKey);
      connectionStatus = probed.connectionStatus;
      liveProvider = probed.liveProvider;
      probeCache.set(cacheKey, {
        cacheKey,
        expiresAt: Date.now() + PROBE_CACHE_TTL_MS,
        connectionStatus,
        liveProvider,
      });
    }
  }

  let planTier: "free" | "paid" = isModelFree(provider, model) ? "free" : "paid";
  if (provider === "openrouter" && liveProvider.source === "openrouter_api") {
    if (typeof liveProvider.creditLimitUsd === "number" && liveProvider.creditLimitUsd > 0) {
      planTier = "paid";
    } else if (liveProvider.isFreeTier === true && isModelFree(provider, model)) {
      planTier = "free";
    } else if (liveProvider.isFreeTier === false && !isModelFree(provider, model)) {
      planTier = "paid";
    }
  }

  // Compute real daily & weekly token consumption from chatLogsTable for this connected provider
  const now = new Date();
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [companies, recentLogs] = await Promise.all([
    db
      .select({
        id: companiesTable.id,
        monthlyTokenQuota: companiesTable.monthlyTokenQuota,
        aiProvider: companiesTable.aiProvider,
        aiModel: companiesTable.aiModel,
      })
      .from(companiesTable),
    db
      .select({
        companyId: chatLogsTable.companyId,
        customerMessage: chatLogsTable.customerMessage,
        botResponse: chatLogsTable.botResponse,
        createdAt: chatLogsTable.createdAt,
      })
      .from(chatLogsTable)
      .where(gte(chatLogsTable.createdAt, sevenDaysAgo)),
  ]);

  const companyMap = new Map(companies.map((c) => [c.id, c]));
  const quotaProvider = cfgMap.get("quota_ai_provider") || "openai";
  const quotaModel = cfgMap.get("quota_ai_model") || "gpt-4o-mini";

  let dailyTokens = 0;
  let dailyRequests = 0;
  let dailyCostUsd = 0;
  let weeklyTokens = 0;
  let weeklyRequests = 0;
  let weeklyCostUsd = 0;

  for (const log of recentLogs) {
    const company = companyMap.get(log.companyId);
    if (!company) continue;

    const hasQuota = typeof company.monthlyTokenQuota === "number" && company.monthlyTokenQuota > 0;
    const logModel = company.aiModel || (hasQuota ? quotaModel : "gpt-4o-mini");
    const logProvider = (company.aiModel ? company.aiProvider : null) || (hasQuota ? quotaProvider : (company.aiProvider ?? "openai"));

    if (logProvider !== provider) continue;

    const tokens =
      Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN) +
      Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
    const mp = getModelPricing(logModel);
    const inputTokens = Math.ceil((log.customerMessage?.length ?? 0) / CHARS_PER_TOKEN);
    const outputTokens = Math.ceil((log.botResponse?.length ?? 0) / CHARS_PER_TOKEN);
    const cost = (inputTokens / 1_000_000) * mp.input + (outputTokens / 1_000_000) * mp.output;

    weeklyTokens += tokens;
    weeklyRequests += 1;
    weeklyCostUsd += cost;

    if (log.createdAt && new Date(log.createdAt) >= startOfTodayUtc) {
      dailyTokens += tokens;
      dailyRequests += 1;
      dailyCostUsd += cost;
    }
  }

  const customDailyRaw = Number(cfgMap.get(dailyKey) ?? "");
  const customWeeklyRaw = Number(cfgMap.get(weeklyKey) ?? "");
  const defaults = getDefaultLimits(planTier);

  const dailyLimit = Number.isFinite(customDailyRaw) && customDailyRaw > 0 ? customDailyRaw : defaults.daily;
  const weeklyLimit = Number.isFinite(customWeeklyRaw) && customWeeklyRaw > 0 ? customWeeklyRaw : defaults.weekly;

  const dailySource: AllowanceWindowStats["limitSource"] =
    Number.isFinite(customDailyRaw) && customDailyRaw > 0 ? "custom" : "tier_default";
  const weeklySource: AllowanceWindowStats["limitSource"] =
    Number.isFinite(customWeeklyRaw) && customWeeklyRaw > 0 ? "custom" : "tier_default";

  const result: AiProviderAllowanceResponse = {
    scope,
    provider,
    model,
    planTier,
    hasApiKey: Boolean(apiKey),
    connectionStatus,
    daily: computeWindowStats(dailyTokens, dailyLimit, dailyRequests, dailyCostUsd, dailySource),
    weekly: computeWindowStats(weeklyTokens, weeklyLimit, weeklyRequests, weeklyCostUsd, weeklySource),
    liveProvider,
    checkedAt: new Date().toISOString(),
  };

  void checkAndNotifyLowAllowance(result).catch((err) => {
    logger.warn({ err, scope }, "Low AI allowance notification check failed");
  });

  return result;
}

const LOW_ALLOWANCE_THRESHOLD_PCT = 15;
const LOW_ALLOWANCE_ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

async function checkAndNotifyLowAllowance(result: AiProviderAllowanceResponse): Promise<void> {
  if (!result.hasApiKey) return;

  const windows: Array<{ key: "daily" | "weekly"; labelAr: string; labelEn: string; stats: AllowanceWindowStats }> = [
    { key: "daily", labelAr: "اليومي", labelEn: "Daily", stats: result.daily },
    { key: "weekly", labelAr: "الأسبوعي", labelEn: "Weekly", stats: result.weekly },
  ];

  const triggered = windows.filter((w) => w.stats.remainingPercent < LOW_ALLOWANCE_THRESHOLD_PCT);
  if (triggered.length === 0) return;

  const cooldownKeys = triggered.map((w) => `ai_allowance_alert_last_${result.scope}_${w.key}`);
  const cfgMap = await getAdminConfigMap(cooldownKeys);
  const now = Date.now();

  const dueWindows = triggered.filter((w) => {
    const lastIso = cfgMap.get(`ai_allowance_alert_last_${result.scope}_${w.key}`);
    if (!lastIso) return true;
    const lastMs = Date.parse(lastIso);
    return !Number.isFinite(lastMs) || now - lastMs >= LOW_ALLOWANCE_ALERT_COOLDOWN_MS;
  });

  if (dueWindows.length === 0) return;

  const scopeLabelEn = result.scope === "quota" ? "Quota AI" : "Support AI";
  const scopeLabelAr = result.scope === "quota" ? "وكيل ذكاء الحصص" : "وكيل الدعم";

  const summaryEn = dueWindows
    .map((w) => `${w.labelEn}: ${w.stats.remainingPercent}% remaining (${w.stats.remainingTokens.toLocaleString()} / ${w.stats.limitTokens.toLocaleString()} tokens)`)
    .join(" | ");
  const summaryAr = dueWindows
    .map((w) => `${w.labelAr}: متبقي ${w.stats.remainingPercent}% (${w.stats.remainingTokens.toLocaleString()} / ${w.stats.limitTokens.toLocaleString()} توكن)`)
    .join(" | ");

  const title = `⚠️ Low AI Token Allowance (${scopeLabelEn})`;
  const message = `${scopeLabelEn} (${result.provider} / ${result.model}) dropped below ${LOW_ALLOWANCE_THRESHOLD_PCT}%: ${summaryEn}. (${scopeLabelAr}: ${summaryAr})`;

  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map((admin) => ({
          userId: admin.id,
          type: "ai_allowance_low",
          title,
          message,
          companyId: null,
          isRead: false,
        }))
      );
    }
  } catch (dbErr) {
    logger.warn({ err: dbErr }, "Failed to insert low AI allowance admin notification");
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
      <h2 style="margin:0 0 8px;color:#92400e;">⚠️ Low AI Token Allowance (${scopeLabelEn})</h2>
      <p style="margin:0 0 12px;color:#78350f;font-size:14px;">
        Provider: <strong>${result.provider}</strong> · Model: <strong>${result.model}</strong> (${result.planTier.toUpperCase()} Plan)
      </p>
      <p style="margin:0 0 14px;color:#451a03;font-size:14px;">${summaryEn}</p>
      <p style="margin:0;color:#78350f;font-size:13px;" dir="rtl">${summaryAr}</p>
    </div>
  `;

  await dispatchAdminNotificationEmail({
    subject: `[Alert] Low ${scopeLabelEn} Token Allowance (<${LOW_ALLOWANCE_THRESHOLD_PCT}%)`,
    html,
  });

  const nowIso = new Date(now).toISOString();
  for (const w of dueWindows) {
    await upsertAdminConfig(`ai_allowance_alert_last_${result.scope}_${w.key}`, nowIso);
  }
}

export async function checkAllAiProviderAllowances(): Promise<void> {
  await Promise.all([
    getAiProviderAllowance("quota").catch(() => {}),
    getAiProviderAllowance("support").catch(() => {}),
  ]);
}

export async function saveAiProviderAllowanceLimits(
  scope: AllowanceScope,
  dailyTokenLimit?: number | null,
  weeklyTokenLimit?: number | null
): Promise<void> {
  if (dailyTokenLimit !== undefined) {
    const val = dailyTokenLimit && dailyTokenLimit > 0 ? String(Math.round(dailyTokenLimit)) : "";
    await upsertAdminConfig(`ai_allowance_daily_tokens_${scope}`, val);
  }
  if (weeklyTokenLimit !== undefined) {
    const val = weeklyTokenLimit && weeklyTokenLimit > 0 ? String(Math.round(weeklyTokenLimit)) : "";
    await upsertAdminConfig(`ai_allowance_weekly_tokens_${scope}`, val);
  }
  clearAiProviderAllowanceCache(scope);
}
