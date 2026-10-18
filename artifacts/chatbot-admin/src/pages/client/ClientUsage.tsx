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
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-bold tabular-nums truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
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
  const quotaPercent = quota && quota > 0 ? Math.min(((data?.usedTokens ?? totalTokens) / quota) * 100, 100) : null;
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {lang === "ar" ? "استهلاك الحصة المخصصة (Tokens)" : "Admin Assigned Quota Usage"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar"
              ? "متابعة استهلاك الحصة الشهرية المخصصة لشركتك من قِبل مسؤول النظام"
              : "Track consumption under the administrator-assigned monthly token quota"}
          </p>
        </div>

        {hasQuota && (
          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto max-w-full scrollbar-hide justify-start sm:justify-end pb-1">
              <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setPreset(p.key); setShowCustom(false); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    !showCustom && preset === p.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setShowCustom((v) => !v)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  showCustom
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {lang === "ar" ? "مخصص" : "Custom"} <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Custom date pickers */}
            {showCustom && (
              <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-xs text-foreground outline-none"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={toIso(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-xs text-foreground outline-none"
                />
              </div>
            )}

            {!showCustom && (
              <p className="text-xs text-muted-foreground">{rangeLabel}</p>
            )}
          </div>
        )}
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
        <div className="bg-card border border-border/80 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto my-8 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-5 shadow-inner">
            <Coins className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">
            {lang === "ar"
              ? "لم يتم تعيين حصة رموز (Quota) لشركتك من قِبل المسؤول"
              : "No Admin Quota Assigned"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            {lang === "ar"
              ? "هذه الصفحة مخصصة حصرياً لعرض وتتبع استهلاك الحصة الشهرية المحددة من مسؤول النظام. نظراً لعدم تخصيص حصة لحسابك حالياً، لا تتوفر أي بيانات استهلاك حصة لعرضها هنا."
              : "This page is dedicated exclusively to tracking consumption under an administrator-assigned monthly quota. Since no quota is currently assigned to your company, no quota data is available."}
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/client/dashboard"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>{lang === "ar" ? "الانتقال إلى لوحة التحكم" : "Go to Dashboard"}</span>
            </Link>
            <Link
              href="/client/support"
              className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs sm:text-sm font-medium transition-colors inline-flex items-center gap-2 border border-border"
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
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-sm">
                  {lang === "ar" ? "الحصة الشهرية المخصصة من المسؤول" : "Admin Assigned Monthly Quota"}
                </span>
                <span className="text-[11px] font-mono bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20">
                  {modelLabel}
                </span>
              </div>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                quotaPercent! > 90
                  ? "bg-rose-500/20 text-rose-400"
                  : quotaPercent! > 75
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-emerald-500/20 text-emerald-400"
              }`}>
                {quotaPercent!.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  quotaPercent! > 90 ? "bg-rose-500" : quotaPercent! > 75 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                {lang === "ar" ? "المستهلك هذا الشهر:" : "Used this period:"}{" "}
                <strong className="text-foreground">{fmt(data?.usedTokens ?? totalTokens)}</strong>
              </span>
              <span>
                {lang === "ar" ? "الحد الأقصى للحصة:" : "Assigned Limit:"}{" "}
                <strong className="text-foreground">{fmt(quota!)}</strong>
              </span>
            </div>
            {quotaPercent! > 90 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {lang === "ar"
                  ? "تنبيه: لقد اقتربت من استنفاذ الحصة الشهرية المخصصة لك من قِبل المسؤول!"
                  : "Warning: You are close to exhausting your monthly quota!"}
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
              color="bg-blue-500/10 text-blue-400"
            />
            <StatCard
              icon={Coins}
              label={lang === "ar" ? "إجمالي الرموز" : "Total Tokens"}
              value={fmt(totalTokens)}
              sub={`${fmt(data?.estimatedInputTokens ?? 0)} ${lang === "ar" ? "مدخل" : "in"} · ${fmt(data?.estimatedOutputTokens ?? 0)} ${lang === "ar" ? "مخرج" : "out"}`}
              color="bg-violet-500/10 text-violet-400"
            />
            <StatCard
              icon={Cpu}
              label={lang === "ar" ? "نموذج الحصة المعتمد" : "Quota AI Model"}
              value={data?.quotaAiModel || data?.aiModel || "gpt-4o-mini"}
              sub={`${data?.quotaAiProvider || data?.aiProvider || "openai"} · ${lang === "ar" ? "حصة المنصة" : "Platform Quota"}`}
              color="bg-amber-500/10 text-amber-400"
            />
            <StatCard
              icon={DollarSign}
              label={lang === "ar" ? "التكلفة على العميل" : "Cost to Client"}
              value="$0.00"
              sub={lang === "ar" ? "مغطى بالكامل عبر الحصة المخصصة" : "Covered by assigned quota"}
              color="bg-emerald-500/10 text-emerald-400"
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
                <div className="bg-card border border-border rounded-xl p-6">
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

                <div className="bg-card border border-border rounded-xl p-6">
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
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
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
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{lang === "ar" ? "التكلفة على العميل" : "Cost"}</th>
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
                            <td className="px-6 py-4 text-right tabular-nums text-emerald-400 font-medium">
                              $0.00
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
