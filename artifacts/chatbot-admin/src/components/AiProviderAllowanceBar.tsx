import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  Check,
  Gauge,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

export type AllowanceScope = "quota" | "support";

interface ProviderLiveQuotaInfo {
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

interface AllowanceWindowStats {
  usedTokens: number;
  limitTokens: number;
  remainingTokens: number;
  remainingPercent: number;
  usedPercent: number;
  requests: number;
  costUsd: number;
  limitSource: "custom" | "provider_api" | "tier_default";
}

interface AiProviderAllowanceResponse {
  scope: AllowanceScope;
  provider: string;
  model: string;
  planTier: "free" | "paid";
  hasApiKey: boolean;
  connectionStatus: "ok" | "no_key" | "invalid_key" | "quota_exceeded" | "insufficient_credits" | "error";
  daily: AllowanceWindowStats;
  weekly: AllowanceWindowStats;
  liveProvider: ProviderLiveQuotaInfo;
  checkedAt: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

export function AiProviderAllowanceBar({ scope }: { scope: AllowanceScope }) {
  const { lang } = useLanguage();
  const isAr = lang === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [editing, setEditing] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const queryKey = ["admin-ai-provider-allowance", scope];

  const { data, isLoading, isError } = useQuery<AiProviderAllowanceResponse>({
    queryKey,
    queryFn: () => customFetch(`/api/admin/ai-provider-allowance?scope=${scope}`),
    staleTime: 60_000,
  });

  const saveLimitMutation = useMutation({
    mutationFn: (payload: { dailyTokenLimit?: number | null; weeklyTokenLimit?: number | null }) =>
      customFetch("/api/admin/ai-provider-allowance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, ...payload }),
      }),
    onSuccess: (updated: AiProviderAllowanceResponse) => {
      queryClient.setQueryData(queryKey, updated);
      setEditing(false);
      toast({
        title: isAr ? "تم تحديث حد التوكنات بنجاح" : "Token allowance limit updated",
      });
    },
    onError: () => {
      toast({
        title: isAr ? "تعذر تحديث الحد" : "Failed to update token limit",
        variant: "destructive",
      });
    },
  });

  const handleForceRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const fresh = await customFetch<AiProviderAllowanceResponse>(
        `/api/admin/ai-provider-allowance?scope=${scope}&refresh=1`,
      );
      queryClient.setQueryData(queryKey, fresh);
    } catch {
      toast({
        title: isAr ? "تعذر تحديث بيانات المزود" : "Failed to refresh provider allowance",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const openEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    const active = period === "daily" ? data?.daily : data?.weekly;
    setLimitInput(active ? String(active.limitTokens) : "");
    setEditing(true);
  };

  const handleSaveLimit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = limitInput.trim();
    if (!trimmed) {
      saveLimitMutation.mutate(
        period === "daily" ? { dailyTokenLimit: null } : { weeklyTokenLimit: null },
      );
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({
        title: isAr ? "أدخل رقماً صحيحاً أكبر من 0" : "Enter a valid number greater than 0",
        variant: "destructive",
      });
      return;
    }
    saveLimitMutation.mutate(
      period === "daily"
        ? { dailyTokenLimit: Math.floor(parsed) }
        : { weeklyTokenLimit: Math.floor(parsed) },
    );
  };

  if (isLoading) {
    return (
      <div
        className="mx-6 mb-4 rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 animate-pulse"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-3.5 w-48 rounded bg-secondary/70 mb-2.5" />
        <div className="h-2.5 w-full rounded-full bg-secondary/60" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="mx-6 mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-amber-400"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {isAr
            ? "تعذر تحميل رصيد التوكنات من السيرفر (تأكد من إعادة تشغيل السيرفر)"
            : "Could not load token allowance from server (restart/rebuild server if needed)"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleForceRefresh}
          className="h-6 px-2 text-xs text-amber-300 hover:text-amber-200"
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          {isAr ? "إعادة المحاولة" : "Retry"}
        </Button>
      </div>
    );
  }

  const windowStats = period === "daily" ? data.daily : data.weekly;
  const remainingPct = Math.max(0, Math.min(100, windowStats.remainingPercent));

  const barColorClass =
    !data.hasApiKey
      ? "bg-muted-foreground/40"
      : remainingPct > 50
        ? "bg-emerald-500"
        : remainingPct > 20
          ? "bg-amber-500"
          : "bg-red-500";

  const remainingTextClass =
    !data.hasApiKey
      ? "text-muted-foreground"
      : remainingPct > 50
        ? "text-emerald-400"
        : remainingPct > 20
          ? "text-amber-400"
          : "text-red-400";

  const limitSourceLabel =
    windowStats.limitSource === "provider_api"
      ? isAr
        ? "من API المزود"
        : "Provider API"
      : windowStats.limitSource === "custom"
        ? isAr
          ? "حد مخصص"
          : "Custom Limit"
        : isAr
          ? "افتراضي حسب الباقة"
          : "Plan Default";

  const live = data.liveProvider;

  return (
    <div
      className="mx-6 mb-4 rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 space-y-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Row: Title, Plan Tier, Daily/Weekly Switcher, Refresh & Limit Editor */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Gauge className="w-4 h-4 text-violet-400 shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            {isAr ? "الرصيد المتبقي من التوكنات" : "Remaining Token Allowance"}
          </span>

          {/* Free vs Paid Badge */}
          <Badge
            variant="outline"
            className={
              data.planTier === "free"
                ? "text-[11px] border-sky-500/30 bg-sky-500/10 text-sky-400 gap-1"
                : "text-[11px] border-violet-500/30 bg-violet-500/10 text-violet-300 gap-1"
            }
          >
            {data.planTier === "free" ? (
              <Sparkles className="w-3 h-3" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            {data.planTier === "free"
              ? isAr
                ? "باقة مجانية"
                : "Free Plan"
              : isAr
                ? "باقة مدفوعة"
                : "Paid Plan"}
          </Badge>

          <span className="text-[11px] text-muted-foreground">· {limitSourceLabel}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Daily / Weekly Toggle */}
          <div className="inline-flex rounded-lg border border-border/60 bg-background/60 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setPeriod("daily");
                setEditing(false);
              }}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                period === "daily"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? "يومي" : "Daily"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriod("weekly");
                setEditing(false);
              }}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                period === "weekly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? "أسبوعي" : "Weekly"}
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openEditor}
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
            title={isAr ? "تعديل الحد" : "Set token limit"}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span className="hidden sm:inline">{isAr ? "تعديل الحد" : "Set Limit"}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleForceRefresh}
            disabled={isRefreshing}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title={isAr ? "تحديث من API المزود" : "Sync from Provider API"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Inline Limit Editor */}
      {editing && (
        <form
          onSubmit={handleSaveLimit}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/60 p-2"
        >
          <span className="text-[11px] text-muted-foreground">
            {period === "daily"
              ? isAr
                ? "الحد اليومي للتوكنات:"
                : "Daily token limit:"
              : isAr
                ? "الحد الأسبوعي للتوكنات:"
                : "Weekly token limit:"}
          </span>
          <Input
            type="number"
            min={1}
            step={1000}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            placeholder={isAr ? "مثال: 250000" : "e.g. 250000"}
            className="h-7 w-36 text-xs bg-secondary/40"
          />
          <Button
            type="submit"
            size="sm"
            disabled={saveLimitMutation.isPending}
            className="h-7 px-2.5 text-xs gap-1"
          >
            {saveLimitMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {isAr ? "حفظ" : "Save"}
          </Button>
          {windowStats.limitSource === "custom" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saveLimitMutation.isPending}
              onClick={() =>
                saveLimitMutation.mutate(
                  period === "daily" ? { dailyTokenLimit: null } : { weeklyTokenLimit: null },
                )
              }
              className="h-7 px-2 text-[11px]"
            >
              {isAr ? "إعادة للتلقائي" : "Auto"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(false)}
            className="h-7 w-7 p-0 text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </form>
      )}

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full h-2.5 rounded-full bg-secondary/80 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
            style={{ width: `${remainingPct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className={`font-semibold tabular-nums ${remainingTextClass}`}>
              {remainingPct}% {isAr ? "متبقي" : "remaining"}
            </span>
            <span className="text-muted-foreground tabular-nums">
              ({formatTokens(windowStats.remainingTokens)} / {formatTokens(windowStats.limitTokens)}{" "}
              {isAr ? "توكن" : "tokens"})
            </span>
          </div>

          <div className="text-[11px] text-muted-foreground tabular-nums">
            {isAr ? "المستخدم:" : "Used:"} {formatTokens(windowStats.usedTokens)} ·{" "}
            {windowStats.requests.toLocaleString()} {isAr ? "طلب" : "req"}
            {windowStats.costUsd > 0 && ` · ~${formatUsd(windowStats.costUsd)}`}
          </div>
        </div>
      </div>

      {/* Live Provider API Telemetry Row */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
        {!data.hasApiKey && (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {isAr
              ? "لا يوجد مفتاح API مضبوط — يتم استخدام الحد الافتراضي"
              : "No API key configured — using plan default limit"}
          </span>
        )}

        {data.hasApiKey &&
          (data.connectionStatus === "quota_exceeded" ||
            data.connectionStatus === "insufficient_credits") && (
            <span className="inline-flex items-center gap-1 text-red-400 font-medium">
              <AlertTriangle className="w-3 h-3" />
              {data.connectionStatus === "insufficient_credits"
                ? isAr
                  ? "رصيد المزود نفد"
                  : "Provider credits exhausted"
                : isAr
                  ? "تم تجاوز حصة المزود"
                  : "Provider quota exceeded"}
            </span>
          )}

        {live.source === "openrouter_api" && (
          <>
            {typeof live.creditRemainingUsd === "number" && (
              <span className="rounded-md bg-background/60 px-2 py-0.5 border border-border/50">
                {isAr ? "رصيد OpenRouter المتبقي:" : "OpenRouter Credit Left:"}{" "}
                <strong className="text-foreground">{formatUsd(live.creditRemainingUsd)}</strong>
                {typeof live.creditLimitUsd === "number" && ` / ${formatUsd(live.creditLimitUsd)}`}
              </span>
            )}
            {typeof live.usageDailyUsd === "number" && (
              <span className="rounded-md bg-background/60 px-2 py-0.5 border border-border/50">
                {isAr ? "استهلاك اليوم/الأسبوع:" : "API Spend (D/W):"}{" "}
                <strong className="text-foreground">
                  {formatUsd(live.usageDailyUsd)} / {formatUsd(live.usageWeeklyUsd ?? 0)}
                </strong>
              </span>
            )}
            {typeof live.rateLimitRequests === "number" && live.rateLimitInterval && (
              <span className="rounded-md bg-background/60 px-2 py-0.5 border border-border/50">
                {isAr ? "حد السرعة:" : "Rate Limit:"}{" "}
                <strong className="text-foreground">
                  {live.rateLimitRequests} req / {live.rateLimitInterval}
                </strong>
              </span>
            )}
          </>
        )}

        {(live.source === "openai_headers" || live.source === "anthropic_headers") && (
          <>
            {typeof live.tokensRemainingPerWindow === "number" &&
              typeof live.tokensLimitPerWindow === "number" && (
                <span className="rounded-md bg-background/60 px-2 py-0.5 border border-border/50">
                  {isAr ? "توكنات النافذة المتبقية (API):" : "API Window Tokens Left:"}{" "}
                  <strong className="text-foreground">
                    {formatTokens(live.tokensRemainingPerWindow)} /{" "}
                    {formatTokens(live.tokensLimitPerWindow)}
                  </strong>
                </span>
              )}
            {typeof live.requestsRemainingPerWindow === "number" &&
              typeof live.requestsLimitPerWindow === "number" && (
                <span className="rounded-md bg-background/60 px-2 py-0.5 border border-border/50">
                  {isAr ? "الطلبات المتبقية (API):" : "API Requests Left:"}{" "}
                  <strong className="text-foreground">
                    {live.requestsRemainingPerWindow.toLocaleString()} /{" "}
                    {live.requestsLimitPerWindow.toLocaleString()}
                  </strong>
                </span>
              )}
          </>
        )}

        {live.source === "google_metadata" && typeof live.modelInputTokenLimit === "number" && (
          <span className="rounded-md bg-background/60 px-2 py-0.5 border border-border/50">
            {isAr ? "سعة النموذج:" : "Model Context:"}{" "}
            <strong className="text-foreground">
              {formatTokens(live.modelInputTokenLimit)} in /{" "}
              {formatTokens(live.modelOutputTokenLimit ?? 0)} out
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}
