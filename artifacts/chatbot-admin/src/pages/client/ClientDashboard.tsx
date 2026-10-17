import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  MessageSquare,
  Coins,
  TrendingUp,
  DollarSign,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart2,
  KeyRound,
  ExternalLink,
  Sparkles,
  Cpu,
  Layers,
  ShieldCheck,
  Info,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useLanguage } from "@/hooks/use-language";

interface DashboardData {
  companyName: string;
  aiProvider: string | null;
  aiModel: string | null;
  isActive: boolean;
  monthlyTokenQuota: number | null;
  hasOwnApiKey: boolean;
  hasQuota: boolean;
  activeExecutionMode: "quota" | "own_key" | "none";
  quotaAiProvider: string | null;
  quotaAiModel: string | null;
  totalMessages: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  pricingPer1MTokens: { input: number; output: number };
  byChannel: Array<{ channel: string; messages: number; inputTokens: number; outputTokens: number }>;
  periodLabel: string;
  sentiments: { positive: number; neutral: number; negative: number; angry: number };
  intents: Array<{ name: string; count: number }>;
  hasCompany: boolean;
}

const CHANNEL_COLORS: Record<string, string> = {
  telegram: "#2AABEE",
  whatsapp: "#25D366",
  website: "#8B5CF6",
  messenger: "#1877F2",
};
const FALLBACK_COLORS = ["#6366f1", "#f59e0b", "#ec4899", "#14b8a6"];

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
    <Card className="bg-card border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium truncate pr-2">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${color.replace('bg-', 'text-').replace('/10', '')}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums truncate">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
      </CardContent>
    </Card>
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

export default function ClientDashboard() {
  const { lang } = useLanguage();

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["client-dashboard"],
    queryFn: () => customFetch("/api/client/dashboard"),
    refetchInterval: 60 * 1000,
    retry: false,
  });

  const [filterMode, setFilterMode] = useState<"own_key" | "quota">("own_key");
  const [userSelected, setUserSelected] = useState(false);

  useEffect(() => {
    if (data && !userSelected) {
      if (data.activeExecutionMode === "quota" || data.hasQuota) {
        setFilterMode("quota");
      } else if (data.activeExecutionMode === "own_key" || data.hasOwnApiKey) {
        setFilterMode("own_key");
      }
    }
  }, [data, userSelected]);

  const totalTokens = (data?.estimatedInputTokens ?? 0) + (data?.estimatedOutputTokens ?? 0);
  const quota = data?.monthlyTokenQuota ?? null;
  const quotaPercent = quota && quota > 0 ? Math.min((totalTokens / quota) * 100, 100) : null;
  const hasQuota = !!(data?.hasQuota || (quota !== null && quota > 0));

  const channelPieData = (data?.byChannel ?? []).map((ch) => ({
    name: ch.channel,
    value: ch.inputTokens + ch.outputTokens,
  }));

  const tokenSplitData = [
    { name: lang === "ar" ? "مدخلات (العميل)" : "Input (Customer)", value: data?.estimatedInputTokens ?? 0 },
    { name: lang === "ar" ? "مخرجات (البوت)" : "Output (Bot)", value: data?.estimatedOutputTokens ?? 0 },
  ];

  const sentiments = data?.sentiments;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">
            {lang === "ar" ? "لوحة التحكم" : "Dashboard"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar"
              ? "نظرة عامة على استهلاك الذكاء الاصطناعي والإحصائيات والتحليلات"
              : "AI usage overview, model analytics, and conversation statistics"}
          </p>
        </div>
        {data && (
          <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border ${
            data.isActive
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400"
          }`}>
            {data.isActive
              ? <><CheckCircle2 className="w-4 h-4" /> {lang === "ar" ? "نشط" : "Active"}</>
              : <><XCircle className="w-4 h-4" /> {lang === "ar" ? "غير نشط" : "Inactive"}</>
            }
          </div>
        )}
      </div>

      {/* Filter Buttons Group */}
      <div className="bg-card border border-border/70 rounded-2xl p-2.5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 p-1 bg-muted/70 rounded-xl border border-border/50">
            {/* Filter 1: Own API Key Model */}
            <button
              type="button"
              onClick={() => {
                setUserSelected(true);
                setFilterMode("own_key");
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                filterMode === "own_key"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>{lang === "ar" ? "نموذج مفتاح API الخاص" : "Own API Key Model"}</span>
              {data?.activeExecutionMode === "own_key" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {lang === "ar" ? "نشط حالياً" : "Active"}
                </span>
              )}
            </button>

            {/* Filter 2: Admin Assigned Quota */}
            <button
              type="button"
              onClick={() => {
                setUserSelected(true);
                setFilterMode("quota");
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                filterMode === "quota"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <Coins className="w-4 h-4 shrink-0" />
              <span>{lang === "ar" ? "الحصة المخصصة من المسؤول" : "Admin Assigned Quota"}</span>
              {data?.activeExecutionMode === "quota" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {lang === "ar" ? "نشط حالياً" : "Active"}
                </span>
              )}
              {hasQuota && quotaPercent !== null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  filterMode === "quota"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted-foreground/20 text-foreground"
                }`}>
                  {quotaPercent.toFixed(0)}%
                </span>
              )}
            </button>
          </div>

          {/* Active System Mode Indicator Badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1.5 bg-muted/40 rounded-xl border border-border/40">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              {lang === "ar" ? "المسار الفعلي في النظام:" : "Current System Routing:"}{" "}
              <strong className="text-foreground">
                {data?.activeExecutionMode === "quota"
                  ? (lang === "ar" ? "حصة المسؤول المخصصة" : "Admin Assigned Quota")
                  : data?.activeExecutionMode === "own_key"
                  ? (lang === "ar" ? "مفتاح API الخاص" : "Own API Key")
                  : (lang === "ar" ? "غير مفعل" : "Inactive")}
              </strong>
            </span>
          </div>
        </div>

        {/* Dynamic Mode Explanation Banner */}
        {filterMode === "quota" ? (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-muted-foreground">
            <Coins className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-foreground">
                  {lang === "ar"
                    ? "عرض استهلاك الحصة المخصصة من المسؤول (النموذج المركزي للمنصة)"
                    : "Admin Assigned Quota Usage (Platform Central Model)"}
                </span>
                <span className="text-[11px] font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  {data?.quotaAiProvider ?? "openai"} / {data?.quotaAiModel ?? "gpt-4o-mini"}
                </span>
              </div>
              <p>
                {lang === "ar"
                  ? "يتم تشغيل المحادثات مجاناً للعميل اعتماداً على حصة الرموز المحددة من الإدارة. لا تتحمل أي تكلفة مباشرة حتى استهلاك كامل الحصة المخصصة."
                  : "Conversations are processed through the central AI agent allocated by the system administrator at $0.00 cost to you, up to your monthly quota limit."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-muted-foreground">
            <KeyRound className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold text-foreground">
                  {lang === "ar"
                    ? "عرض استهلاك نموذج مفتاح API الخاص بالشركة (BYOK)"
                    : "Company's Own API Key Usage (BYOK)"}
                </span>
                <Link
                  href="/client/company"
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <span>{lang === "ar" ? "إعدادات المفتاح والمزود" : "Key & Provider Settings"}</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <p>
                {lang === "ar"
                  ? "تتم الفوترة مباشرة بينك وبين مزود الذكاء الاصطناعي (مثل OpenAI أو Anthropic أو Gemini) بناءً على أسعار الرموز الفعلية وبدون قيود حصة المنصة."
                  : "Usage is billed directly by your AI provider account (OpenAI, Anthropic, Gemini) per token rates without platform quota restrictions."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Middle Status Section (Quota progress bar OR Own Key Status Card) */}
      {!isLoading && (
        <>
          {filterMode === "quota" ? (
            hasQuota ? (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold text-sm">
                      {lang === "ar" ? "الحصة الشهرية المخصصة من المسؤول" : "Admin Assigned Monthly Quota"}
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
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
                    {lang === "ar" ? "المستهلك:" : "Used:"}{" "}
                    <strong className="text-foreground">{fmt(totalTokens)}</strong>
                  </span>
                  <span>
                    {lang === "ar" ? "الحد الأقصى للحصة:" : "Assigned Quota:"}{" "}
                    <strong className="text-foreground">{fmt(quota!)}</strong>
                  </span>
                </div>
                {quotaPercent! > 90 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {lang === "ar"
                      ? "تنبيه: لقد اقتربت من استنفاذ الحصة الشهرية المخصصة لك من قِبل المسؤول!"
                      : "Warning: You are close to exhausting your administrator-allocated monthly quota!"}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-card border border-dashed border-border/80 rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">
                      {lang === "ar" ? "لم يتم تخصيص حصة شهرية لك بعد" : "No Monthly Quota Assigned Yet"}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "ar"
                        ? "يمكن للمسؤول تعيين رصيد رموز شهري مجاني لشركتك من لوحة تحكم المسؤول."
                        : "The administrator has not set a monthly token quota for your company yet."}
                    </p>
                  </div>
                </div>
                <Link
                  href="/client/support"
                  className="text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors font-medium"
                >
                  {lang === "ar" ? "طلب حصة من الإدارة" : "Request Quota"}
                </Link>
              </div>
            )
          ) : (
            <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between flex-wrap gap-4">
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
                        ? (lang === "ar" ? "مفتاح API الخاص بك متصل" : "Your API Key is Connected")
                        : (lang === "ar" ? "لم يتم ضبط مفتاح API خاص بك بعد" : "No Own API Key Configured Yet")}
                    </h4>
                    {data?.hasOwnApiKey ? (
                      <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {lang === "ar" ? "محفوظ ومحمي" : "Saved & Masked"}
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
                          ? `المزود: ${data.aiProvider || "—"} · النموذج: ${data.aiModel || "—"} · فواتير مباشرة حسب الاستهلاك دون سقف حصة`
                          : `Provider: ${data.aiProvider || "—"} · Model: ${data.aiModel || "—"} · Pay-as-you-go with no quota cap`)
                      : (lang === "ar"
                          ? "أدخل مفتاحك الخاص في بيانات الشركة لتمكين الذكاء الاصطناعي بنموذجك المفضل."
                          : "Configure your API key in Company Profile to enable AI with your preferred model.")}
                  </p>
                </div>
              </div>
              <Link
                href="/client/company"
                className="text-xs px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center gap-1.5"
              >
                <span>{data?.hasOwnApiKey ? (lang === "ar" ? "تعديل الإعدادات" : "Manage Key") : (lang === "ar" ? "إدخال مفتاح API" : "Configure Key")}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </>
      )}

      {/* Main stat cards — dynamically adjusted based on filterMode */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Notice when no company or error */}
          {(isError || !data?.hasCompany) && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-400">
              <BarChart2 className="w-4 h-4 shrink-0" />
              <span>
                {lang === "ar"
                  ? "لم تقم بإعداد ملف الشركة بعد. توجه إلى 'بيانات الشركة' لضبط النموذج ومزود الخدمة."
                  : "Company profile not set up yet. Go to 'Company Profile' to configure your AI provider and model."}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={MessageSquare}
              label={lang === "ar" ? "إجمالي الرسائل" : "Total Messages"}
              value={(data?.totalMessages ?? 0).toLocaleString()}
              sub={lang === "ar" ? "إجمالي السجلات" : "all time"}
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
              icon={filterMode === "quota" ? Cpu : KeyRound}
              label={
                filterMode === "quota"
                  ? (lang === "ar" ? "نموذج الحصة المعتمد" : "Quota Assigned Model")
                  : (lang === "ar" ? "نموذج مفتاحك الخاص" : "Own Key Model")
              }
              value={
                filterMode === "quota"
                  ? (data?.quotaAiModel ?? "gpt-4o-mini")
                  : (data?.aiModel ?? (lang === "ar" ? "غير محدد" : "—"))
              }
              sub={
                filterMode === "quota"
                  ? `${data?.quotaAiProvider ?? "openai"} · ${lang === "ar" ? "حصة المنصة" : "Platform Quota"}`
                  : `${data?.aiProvider ?? (lang === "ar" ? "لم يحدد مزود" : "provider not set")} · ${lang === "ar" ? "مفتاحك الخاص" : "Own Key"}`
              }
              color={filterMode === "quota" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}
            />
            <StatCard
              icon={DollarSign}
              label={
                filterMode === "quota"
                  ? (lang === "ar" ? "التكلفة على العميل" : "Cost to Client")
                  : (lang === "ar" ? "التكلفة التقديرية" : "Est. Cost")
              }
              value={
                filterMode === "quota"
                  ? "$0.00"
                  : (data?.pricingPer1MTokens.input ?? 0) > 0
                  ? `$${data!.estimatedCostUsd.toFixed(4)}`
                  : "—"
              }
              sub={
                filterMode === "quota"
                  ? (lang === "ar" ? "مغطى بالكامل عبر الحصة المخصصة" : "Covered by assigned quota")
                  : (data?.pricingPer1MTokens.input ?? 0) > 0
                  ? `$${data!.pricingPer1MTokens.input}/M in · $${data!.pricingPer1MTokens.output}/M out`
                  : (lang === "ar" ? "النموذج المجاني / حسب المزود" : "free / provider rates")
              }
              color={filterMode === "quota" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}
            />
          </div>

          {/* Charts row — only when there's actual data */}
          {totalTokens > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Token split pie */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-base font-semibold mb-1">
                  {lang === "ar" ? "توزيع الرموز" : "Token Split"}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {lang === "ar" ? "مدخلات مقابل مخرجات" : "Input vs Output tokens"}
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={tokenSplitData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={3} dataKey="value">
                      {tokenSplitData.map((_, i) => (
                        <Cell key={i} fill={["#3b82f6", "#10b981"][i]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend formatter={(v) => <span className="text-xs text-foreground">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Channel breakdown pie */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-base font-semibold mb-1">
                  {lang === "ar" ? "توزيع القنوات" : "By Channel"}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {lang === "ar" ? "الرموز حسب قناة التواصل" : "Tokens consumed per channel"}
                </p>
                {channelPieData.length === 0 ? (
                  <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">
                    {lang === "ar" ? "لا توجد بيانات" : "No data"}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={channelPieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name">
                        {channelPieData.map((entry, i) => (
                          <Cell key={i} fill={CHANNEL_COLORS[entry.name] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                      <Legend formatter={(v) => <span className="text-xs text-foreground capitalize">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Channel breakdown table */}
          {(data?.byChannel ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold">
                  {lang === "ar" ? "تفصيل حسب القناة" : "Channel Breakdown"}
                </h2>
                <span className="ml-auto text-xs text-muted-foreground">{data?.periodLabel}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {lang === "ar" ? "القناة" : "Channel"}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {lang === "ar" ? "الرسائل" : "Messages"}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {lang === "ar" ? "رموز المدخل" : "Input Tokens"}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {lang === "ar" ? "رموز المخرج" : "Output Tokens"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data!.byChannel.map((ch, i) => {
                    const color = CHANNEL_COLORS[ch.channel] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                    return (
                      <tr key={ch.channel} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className="capitalize font-medium">{ch.channel}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right tabular-nums">{ch.messages.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-blue-400">{fmt(ch.inputTokens)}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-emerald-400">{fmt(ch.outputTokens)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sentiment Analysis Card */}
          {sentiments && (
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center">
                    {lang === "ar" ? "تحليل مشاعر العملاء (ذكاء اصطناعي)" : "Customer Sentiment (AI)"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center h-[300px]">
                  
                  {(sentiments.positive + sentiments.neutral + sentiments.negative + sentiments.angry) === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <BarChart2 className="w-8 h-8 opacity-20" />
                      <p className="text-sm">{lang === "ar" ? "لا توجد بيانات مشاعر بعد. تحدث مع البوت لتبدأ!" : "No sentiment data yet. Chat with the bot!"}</p>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: lang === "ar" ? "إيجابي" : "Positive", value: sentiments.positive, color: "#10b981" },
                          { name: lang === "ar" ? "محايد" : "Neutral", value: sentiments.neutral, color: "#94a3b8" },
                          { name: lang === "ar" ? "سلبي" : "Negative", value: sentiments.negative, color: "#f59e0b" },
                          { name: lang === "ar" ? "غاضب" : "Angry", value: sentiments.angry, color: "#ef4444" },
                        ].filter(d => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {
                          [
                            { name: "Positive", value: sentiments.positive, color: "#10b981" },
                            { name: "Neutral", value: sentiments.neutral, color: "#94a3b8" },
                            { name: "Negative", value: sentiments.negative, color: "#f59e0b" },
                            { name: "Angry", value: sentiments.angry, color: "#ef4444" }
                          ].filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))
                        }
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty state when no messages */}
          {totalTokens === 0 && (
            <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Coins className="w-12 h-12 opacity-20" />
              <p className="text-lg font-medium">
                {lang === "ar" ? "لا يوجد استهلاك هذا الشهر" : "No usage this month"}
              </p>
              <p className="text-sm">
                {lang === "ar" ? "ستظهر الإحصائيات هنا بعد أول محادثة." : "Stats will appear here after the first conversation."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}


