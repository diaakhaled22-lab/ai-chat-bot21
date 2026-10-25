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
  KeyRound,
  MessageSquare,
  DollarSign,
  Info,
  CalendarRange,
  ChevronDown,
  ExternalLink,
  Coins,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface ApiTokensData {
  hasOwnApiKey: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  totalMessages: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  pricingPer1MTokens: { input: number; output: number };
  byChannel: Array<{
    channel: string;
    messages: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}

type Preset = "today" | "week" | "month" | "last_month" | "all";

const CHANNEL_COLORS: Record<string, string> = {
  telegram: "#2AABEE",
  whatsapp: "#25D366",
  website: "#8B5CF6",
  messenger: "#1877F2",
};
const CHANNEL_FALLBACK_COLORS = ["#6366f1", "#f59e0b", "#ec4899", "#14b8a6"];
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
    <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-xl p-5 flex items-start gap-4 shadow-sm border-l-4 border-l-[#2D5BE3]">
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

export default function ClientApiTokens() {
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

  const { data, isLoading, isError } = useQuery<ApiTokensData>({
    queryKey: ["client-api-tokens", dates],
    queryFn: () => customFetch(`/api/client/api-tokens${queryParams}`),
    retry: false,
  });

  const totalTokens = (data?.estimatedInputTokens ?? 0) + (data?.estimatedOutputTokens ?? 0);
  const hasModel = data?.aiModel && (data?.pricingPer1MTokens.input ?? 0) > 0;

  const modelLabel = data?.aiModel
    ? `${data.aiProvider ?? ""} / ${data.aiModel}`.trim().replace(/^\/\s*/, "")
    : (lang === "ar" ? "لم يتم تحديد نموذج" : "No model configured");

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-primary" />
            <span>{lang === "ar" ? "رموز API (المفتاح الخاص)" : "API Tokens"}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar"
              ? "متابعة استهلاك الرموز والتكاليف لنموذج مفتاح API الخاص بشركتك (BYOK)"
              : "Track token usage and direct provider costs for your company's own API Key (BYOK)"}
          </p>
        </div>

        {/* Date filter */}
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
      </div>

      {/* Own API Key Status Banner */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between flex-wrap gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${
            data?.hasOwnApiKey ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"
          }`}>
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">
                {data?.hasOwnApiKey
                  ? (lang === "ar" ? "مفتاح API الخاص بك متصل ومحفوظ" : "Your API Key is Connected")
                  : (lang === "ar" ? "لم تقم بضبط مفتاح API خاص بك بعد" : "No Own API Key Configured Yet")}
              </h4>
              {data?.hasOwnApiKey ? (
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {lang === "ar" ? "نشط ومحمي" : "Saved & Active"}
                </span>
              ) : (
                <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
                  {lang === "ar" ? "غير متوفر" : "Not Set"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data?.hasOwnApiKey
                ? (lang === "ar"
                    ? `المزود: ${data.aiProvider || "—"} · النموذج: ${data.aiModel || "—"} · فواتير مباشرة حسب الاستهلاك مع المزود بدون قيود حصة`
                    : `Provider: ${data.aiProvider || "—"} · Model: ${data.aiModel || "—"} · Direct pay-as-you-go billing with your provider`)
                : (lang === "ar"
                    ? "أدخل مفتاحك الخاص في صفحة مزود ونموذج الذكاء الاصطناعي لتمكين الردود بنموذجك المفضل."
                    : "Configure your API key in AI Model & Provider to enable AI with your preferred model.")}
            </p>
          </div>
        </div>
        <Link
          href="/client/ai-model"
          className="text-xs px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-1.5"
        >
          <span>{data?.hasOwnApiKey ? (lang === "ar" ? "تعديل المفتاح والمزود" : "Manage Key & Provider") : (lang === "ar" ? "إدخال مفتاح API" : "Configure Key")}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && isError && (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <Info className="w-8 h-8 opacity-40" />
          <p>{lang === "ar" ? "لا توجد بيانات استهلاك متاحة. قم بتهيئة بيانات الشركة وإدخال مفتاح API الخاص بك." : "No usage data available. Configure your company API key first."}</p>
        </div>
      )}

      {/* Main Content */}
      {!isLoading && !isError && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={MessageSquare}
              label={t("usage_stat_messages")}
              value={(data?.totalMessages ?? 0).toLocaleString()}
              sub={lang === "ar" ? "إجمالي الرسائل" : "all channels"}
              color="bg-blue-500/10 text-blue-400"
            />
            <StatCard
              icon={Coins}
              label={lang === "ar" ? "إجمالي الرموز" : "Total Tokens"}
              value={fmt(totalTokens)}
              sub={`${fmt(data?.estimatedInputTokens ?? 0)} in · ${fmt(data?.estimatedOutputTokens ?? 0)} out`}
              color="bg-violet-500/10 text-violet-400"
            />
            <StatCard
              icon={KeyRound}
              label={lang === "ar" ? "نموذج مفتاحك الخاص" : "Own Key Model"}
              value={data?.aiModel ?? (lang === "ar" ? "غير محدد" : "—")}
              sub={data?.aiProvider ?? (lang === "ar" ? "لم يتم تحديد مزود" : "provider not set")}
              color="bg-emerald-500/10 text-emerald-400"
            />
            <StatCard
              icon={DollarSign}
              label={t("usage_stat_cost")}
              value={
                hasModel
                  ? (data!.estimatedCostUsd > 0 && data!.estimatedCostUsd < 0.0001
                      ? `$${data!.estimatedCostUsd.toFixed(6)}`
                      : `$${data!.estimatedCostUsd.toFixed(4)}`)
                  : "—"
              }
              sub={
                hasModel
                  ? `$${data!.pricingPer1MTokens.input}/M in · $${data!.pricingPer1MTokens.output}/M out`
                  : (lang === "ar" ? "حسب تسعيرة المزود المباشرة" : "per provider rates")
              }
              color="bg-amber-500/10 text-amber-400"
            />
          </div>

          {totalTokens === 0 && (
            <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center gap-3 text-muted-foreground">
              <KeyRound className="w-12 h-12 opacity-20" />
              <p className="text-lg font-medium">{lang === "ar" ? "لا يوجد استهلاك للرموز في هذه الفترة" : "No token usage in this period"}</p>
              <p className="text-sm">{lang === "ar" ? "ستظهر الإحصائيات هنا فور بدء المحادثات عبر مفتاح API الخاص بك." : "Usage stats will appear here as conversations process through your API key."}</p>
            </div>
          )}

          {totalTokens > 0 && (
            <>
              {/* Pie charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border-l-4 border-l-[#2D5BE3]">
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

                <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border-l-4 border-l-[#2D5BE3]">
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
                <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-xl overflow-hidden shadow-sm border-l-4 border-l-[#2D5BE3]">
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
                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("usage_stat_cost")}</th>
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
                            <td className="px-6 py-4 text-right tabular-nums text-amber-400 font-medium">
                              ${ch.costUsd.toFixed(4)}
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

          {/* Pricing note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-4">
            <Info className="w-4 h-4 shrink-0 mt-0.5 opacity-60" />
            <span>
              {lang === "ar"
                ? `تقدير عدد الرموز (~4 أحرف لكل رمز). التكلفة محسوبة بناءً على الأسعار الرسمية لمزود الخدمة لنموذج `
                : "Token counts are estimated (~4 chars per token). Pricing is calculated based on published provider rates for "}
              <strong className="text-foreground">{modelLabel}</strong>.
              {lang === "ar"
                ? " تتم الفوترة المباشرة عبر حسابك لدى مزود الذكاء الاصطناعي دون حدود لحصة المنصة."
                : " Billing is processed directly on your AI provider account without platform quota caps."}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
