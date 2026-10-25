import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Coins,
  Cpu,
  MessageSquare,
  DollarSign,
  Info,
  CalendarRange,
  ChevronDown,
  LayoutDashboard,
  LifeBuoy,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface UsageData {
  hasQuota: boolean;
  monthlyTokenQuota: number | null;
  quotaAiProvider?: string | null;
  quotaAiModel?: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  totalMessages: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  pricingPer1MTokens: { input: number; output: number };
  byChannel: Array<{
    channel: string;
    messages: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  quota?: number | null;
  usedTokens?: number;
  percentUsed?: number;
  warning?: "exceeded" | "near" | "ok" | "none";
}

type Preset = "today" | "week" | "month" | "last_month" | "all";

const CHANNEL_COLORS: Record<string, string> = {
  telegram: "#2AABEE",
  whatsapp: "#25D366",
  website: "#8B5CF6",
  messenger: "#1877F2",
};
const CHANNEL_FALLBACK_COLORS = ["#6366f1", "#f59e0b", "#ec4899"];
const TOKEN_COLORS = ["#3b82f6", "#10b981"];

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getPresetDates(preset: Preset): { from: string; to: string } | null {
  const now = new Date();
  if (preset === "all") return null;
  if (preset === "today") {
    const s = toIso(now);
    return { from: s, to: s };
  }
  if (preset === "week") {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    return { from: toIso(start), to: toIso(now) };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toIso(start), to: toIso(now) };
  }
  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toIso(start), to: toIso(end) };
  }
  return null;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-start gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border-l-4 border-l-[#102A6B]">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner border ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground tabular-nums truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 truncate font-medium">{sub}</p>}
      </div>
    </div>
  );
}

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="font-medium capitalize">{name}</p>
      <p className="text-muted-foreground">{fmt(value)} tokens</p>
    </div>
  );
};

export default function ClientUsage() {
  const { t, lang } = useLanguage();
  const [preset, setPreset] = useState<Preset>("month");
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(toIso(new Date(Date.now() - 7 * 86400000)));
  const [customTo, setCustomTo] = useState(toIso(new Date()));

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "today", label: t("usage_period_today") },
    { key: "week", label: t("usage_period_week") },
    { key: "month", label: t("usage_period_month") },
    { key: "last_month", label: t("usage_period_last_month") },
    { key: "all", label: t("usage_period_all") },
  ];

  const dates = showCustom
    ? { from: customFrom, to: customTo }
    : getPresetDates(preset);

  const queryParams = dates ? `?from=${dates.from}&to=${dates.to}` : "";

  const { data, isLoading, isError } = useQuery<UsageData>({
    queryKey: ["client-usage", dates],
    queryFn: () => customFetch(`/api/client/usage${queryParams}`),
    retry: false,
  });

  const totalTokens = (data?.estimatedInputTokens ?? 0) + (data?.estimatedOutputTokens ?? 0);
  const quota = data?.monthlyTokenQuota ?? null;
  const usedTokens = data?.usedTokens ?? totalTokens;
  const quotaPercent = quota && quota > 0 ? Math.min((usedTokens / quota) * 100, 100) : null;
  const remainingTokens = quota !== null && quota > 0 ? Math.max(quota - usedTokens, 0) : null;
  const remainingPercent = quota !== null && quota > 0 && quotaPercent !== null ? Math.max(100 - quotaPercent, 0) : null;
  const hasQuota = !!(data?.hasQuota && quota !== null && quota > 0);

  const modelLabel = data?.quotaAiModel || data?.aiModel
    ? `${data?.quotaAiProvider || data?.aiProvider || "openai"} / ${data?.quotaAiModel || data?.aiModel}`
    : "openai / gpt-4o-mini";

  const tokenSplitData = [
    { name: lang === "ar" ? "المدخلات (العميل)" : "Input (Customer)", value: data?.estimatedInputTokens ?? 0 },
    { name: lang === "ar" ? "المخرجات (البوت)" : "Output (Bot)", value: data?.estimatedOutputTokens ?? 0 },
  ];

  const channelData = (data?.byChannel ?? []).map((ch) => ({
    name: ch.channel,
    value: ch.inputTokens + ch.outputTokens,
    messages: ch.messages,
  }));

  const rangeLabel = showCustom
    ? `${customFrom} → ${customTo}`
    : PRESETS.find((p) => p.key === preset)?.label ?? "";

  return (
    <div className="space-y-6">
      {/* Hero Operations Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-500/10">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-blue-400/20 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] shrink-0">
              <i className="fa-solid fa-coins text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-xs font-semibold tracking-wide uppercase text-blue-100 mb-1.5 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {lang === "ar" ? "الحصة الشهرية واستهلاك الرموز" : "Token Quota & Usage"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-sm">
                {lang === "ar" ? "استهلاك الحصة المخصصة (Token Quota)" : "Admin Assigned Quota Usage"}
              </h1>
              <p className="text-blue-100 text-xs sm:text-sm mt-1 max-w-xl font-normal opacity-90">
                {lang === "ar"
                  ? "متابعة استهلاك الحصة الشهرية المخصصة لشركتك من قِبل مسؤول النظام بالرموز والرسائل"
                  : "Track consumption under the administrator-assigned monthly token quota"}
              </p>
            </div>
          </div>

          {/* Quick Period Switcher in Hero */}
          {hasQuota && (
            <div className="flex flex-col gap-2 items-start md:items-end shrink-0">
              <div className="flex items-center gap-1.5 bg-black/20 backdrop-blur-md border border-white/20 p-1.5 rounded-xl max-w-full overflow-x-auto scrollbar-hide">
                <CalendarRange className="w-4 h-4 text-blue-200 ml-1.5 mr-0.5 shrink-0" />
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { setPreset(p.key); setShowCustom(false); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                      !showCustom && preset === p.key
                        ? "bg-white text-blue-700 shadow-md font-bold"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustom((v) => !v)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                    showCustom
                      ? "bg-white text-blue-700 shadow-md font-bold"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {lang === "ar" ? "مخصص" : "Custom"} <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {showCustom && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/20 rounded-xl px-3 py-2 text-white">
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-transparent text-xs text-white outline-none font-mono"
                  />
                  <span className="text-blue-200 text-xs">→</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={toIso(new Date())}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-transparent text-xs text-white outline-none font-mono"
                  />
                </div>
              )}

              {!showCustom && (
                <p className="text-xs text-blue-100/80 font-medium px-1">{rangeLabel}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6 h-28 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 h-24 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <Info className="w-8 h-8 opacity-40" />
          <p>{lang === "ar" ? "حدث خطأ أثناء تحميل بيانات الحصة." : "Error loading quota usage data."}</p>
        </div>
      )}

      {/* NO QUOTA STATE: Only display data if admin has assigned a quota to the client */}
      {!isLoading && !isError && !hasQuota && (
        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto my-8 shadow-sm hover:shadow-md transition-all">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-5 shadow-inner">
            <Coins className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold mb-2 tracking-tight">
            {lang === "ar"
              ? "لم يتم تعيين حصة رموز (Quota) لشركتك من قِبل المسؤول"
              : "No Admin Quota Assigned"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-lg mx-auto">
            {lang === "ar"
              ? "هذه الصفحة مخصصة حصرياً لعرض وتتبع استهلاك الحصة الشهرية المحددة من مسؤول النظام. نظراً لعدم تخصيص حصة لحسابك حالياً، لا تتوفر أي بيانات استهلاك حصة لعرضها هنا."
              : "This page is dedicated exclusively to tracking consumption under an administrator-assigned monthly quota. Since no quota is currently assigned to your company, no quota data is available."}
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/client/dashboard"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/25 transition-all inline-flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>{lang === "ar" ? "الانتقال إلى لوحة التحكم" : "Go to Dashboard"}</span>
            </Link>
            <Link
              href="/client/support"
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-foreground font-semibold text-xs sm:text-sm transition-all inline-flex items-center gap-2 border border-[#DCE7FF] dark:border-slate-700"
            >
              <LifeBuoy className="w-4 h-4" />
              <span>{lang === "ar" ? "طلب تخصيص حصة من الإدارة" : "Request Admin Quota"}</span>
            </Link>
          </div>
        </div>
      )}

      {/* HAS QUOTA: Full Quota Usage Display */}
      {!isLoading && !isError && hasQuota && (
        <>
          {/* Quota Progress Banner */}
          <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                    {lang === "ar" ? "الحصة الشهرية المخصصة من المسؤول" : "Admin Assigned Monthly Quota"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lang === "ar" ? "النموذج النشط:" : "Active Model:"}{" "}
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{modelLabel}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black px-3 py-1 rounded-full border ${
                  quotaPercent! > 90
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                    : quotaPercent! > 75
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                }`}>
                  {quotaPercent!.toFixed(1)}% {lang === "ar" ? "مستهلك" : "Used"}
                </span>
              </div>
            </div>

            <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-700 shadow-sm ${
                  quotaPercent! > 90 
                    ? "bg-gradient-to-r from-amber-500 to-rose-500" 
                    : quotaPercent! > 75 
                    ? "bg-gradient-to-r from-blue-500 to-amber-500" 
                    : "bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500"
                }`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs">
              <div>
                <span className="text-muted-foreground block">{lang === "ar" ? "المستهلك هذا الشهر" : "Used this period"}</span>
                <strong className="text-base font-extrabold text-foreground tabular-nums">{fmt(data?.usedTokens ?? totalTokens)}</strong>
              </div>
              <div>
                <span className="text-muted-foreground block">{lang === "ar" ? "الحد الأقصى للحصة" : "Assigned Limit"}</span>
                <strong className="text-base font-extrabold text-foreground tabular-nums">{fmt(quota!)}</strong>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-muted-foreground block">{lang === "ar" ? "الرصيد المتبقي" : "Remaining Quota"}</span>
                <strong className={`text-base font-extrabold tabular-nums ${
                  remainingTokens === 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"
                }`}>
                  {remainingTokens !== null ? fmt(remainingTokens) : "0"} ({remainingPercent?.toFixed(1)}%)
                </strong>
              </div>
            </div>

            {quotaPercent! > 90 && (
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl px-4 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {lang === "ar"
                  ? "تنبيه: لقد اقتربت من استنفاذ الحصة الشهرية المخصصة لك من قِبل المسؤول! يمكنك طلب زيادة الحصة عبر الدعم الفني."
                  : "Warning: You are close to exhausting your monthly quota! Contact support to request an increase."}
              </div>
            )}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={MessageSquare}
              label={t("usage_stat_messages")}
              value={(data?.totalMessages ?? 0).toLocaleString()}
              sub={lang === "ar" ? "رسائل عبر الحصة المخصصة" : "messages under quota"}
              color="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
            />
            <StatCard
              icon={Coins}
              label={lang === "ar" ? "إجمالي الرموز" : "Total Tokens"}
              value={fmt(totalTokens)}
              sub={`${fmt(data?.estimatedInputTokens ?? 0)} ${lang === "ar" ? "مدخل" : "in"} · ${fmt(data?.estimatedOutputTokens ?? 0)} ${lang === "ar" ? "مخرج" : "out"}`}
              color="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
            />
            <StatCard
              icon={Cpu}
              label={lang === "ar" ? "نموذج الحصة المعتمد" : "Quota AI Model"}
              value={data?.quotaAiModel || data?.aiModel || "gpt-4o-mini"}
              sub={`${data?.quotaAiProvider || data?.aiProvider || "openai"} · ${lang === "ar" ? "حصة المنصة" : "Platform Quota"}`}
              color="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            />
            <StatCard
              icon={Sparkles}
              label={lang === "ar" ? "الرصيد المتبقي من الحصة" : "Remaining Quota"}
              value={remainingTokens !== null ? fmt(remainingTokens) : (lang === "ar" ? "غير محدد" : "None")}
              sub={
                quota !== null && quota > 0
                  ? (lang === "ar"
                      ? `${remainingPercent?.toFixed(1)}% متبقي من ${fmt(quota)}`
                      : `${remainingPercent?.toFixed(1)}% left of ${fmt(quota)}`)
                  : (lang === "ar" ? "لم يتم تعيين حصة" : "No quota assigned")
              }
              color={
                remainingTokens === 0
                  ? "bg-rose-500/10 text-rose-400"
                  : remainingTokens !== null && quota !== null && remainingTokens < quota * 0.2
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-emerald-500/10 text-emerald-400"
              }
            />
          </div>

          {totalTokens === 0 && (
            <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Coins className="w-12 h-12 opacity-20" />
              <p className="text-lg font-medium">{lang === "ar" ? "لا يوجد استهلاك للرموز في هذه الفترة" : "No token usage in this period"}</p>
              <p className="text-sm">{lang === "ar" ? "جرب فترة زمنية أخرى أو انتظر وصول رسائل جديدة." : "Try a different date range or wait for new messages."}</p>
            </div>
          )}

          {totalTokens > 0 && (
            <>
              {/* Pie charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                  <h2 className="text-base font-semibold mb-1">{t("usage_tokens_chart")}</h2>
                  <p className="text-xs text-muted-foreground mb-4">
                    {lang === "ar" ? "رسائل العملاء (مدخلات) مقابل ردود البوت (مخرجات)" : "Customer messages (input) vs bot responses (output)"}
                  </p>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={tokenSplitData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {tokenSplitData.map((_, i) => (
                          <Cell key={i} fill={TOKEN_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                      <Legend
                        formatter={(value) => (
                          <span className="text-xs text-foreground">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                  <h2 className="text-base font-semibold mb-1">{t("usage_channel_breakdown")}</h2>
                  <p className="text-xs text-muted-foreground mb-4">
                    {lang === "ar" ? "إجمالي الرموز المستهلكة عبر كل قناة تواصل" : "Total tokens consumed across each messaging channel"}
                  </p>
                  {channelData.length === 0 ? (
                    <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
                      {lang === "ar" ? "لا توجد بيانات للقنوات في هذه الفترة" : "No channel data in this period"}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={channelData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={110}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                        >
                          {channelData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={
                                CHANNEL_COLORS[entry.name] ??
                                CHANNEL_FALLBACK_COLORS[i % CHANNEL_FALLBACK_COLORS.length]
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                        <Legend
                          formatter={(value) => (
                            <span className="text-xs text-foreground capitalize">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Breakdown table */}
              {data!.byChannel.length > 0 && (
                <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                  <div className="px-6 py-4 border-b border-[#DCE7FF] dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
                    <h2 className="text-base font-semibold">{t("usage_channel_breakdown")}</h2>
                    <span className="text-xs text-muted-foreground">{rangeLabel}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{lang === "ar" ? "القناة" : "Channel"}</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{lang === "ar" ? "الرسائل" : "Messages"}</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("usage_stat_input_tokens")}</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("usage_stat_output_tokens")}</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{lang === "ar" ? "حالة الفوترة" : "Billing Status"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.byChannel.map((ch, i) => {
                        const color =
                          CHANNEL_COLORS[ch.channel] ??
                          CHANNEL_FALLBACK_COLORS[i % CHANNEL_FALLBACK_COLORS.length];
                        return (
                          <tr
                            key={ch.channel}
                            className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="capitalize font-medium">{ch.channel}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right tabular-nums">{ch.messages.toLocaleString()}</td>
                            <td className="px-6 py-4 text-right tabular-nums text-blue-400">{fmt(ch.inputTokens)}</td>
                            <td className="px-6 py-4 text-right tabular-nums text-emerald-400">{fmt(ch.outputTokens)}</td>
                            <td className="px-6 py-4 text-right tabular-nums">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" />
                                {lang === "ar" ? "مغطى بالحصة ($0.00)" : "Covered ($0.00)"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Pricing/Quota note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-4">
            <Info className="w-4 h-4 shrink-0 mt-0.5 opacity-60" />
            <span>
              {lang === "ar"
                ? `يتم استهلاك الرموز من الحصة الشهرية المخصصة لشركتك من قِبل مسؤول النظام مجاناً ($0.00). يتم تشغيل الذكاء الاصطناعي عبر نموذج المنصة المعتمد (`
                : "Tokens are consumed from your administrator-allocated monthly quota at $0.00 cost to you. Chatbot requests are processed by the central platform model ("}
              <strong className="text-foreground">{modelLabel}</strong>).
              {lang === "ar"
                ? " في حال استنفاذ الحصة الشهرية، يمكنك التواصل مع إدارة المنصة لترقية أو زيادة الحصة الشهرية المخصصة لشركتك."
                : " If your monthly quota is exhausted, you can contact the platform administration to upgrade or increase your allocated quota."}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
