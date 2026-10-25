import { useState, useMemo } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useGetAdminStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, CheckCircle2, XCircle, Activity, Coins, Zap, TrendingUp, Calendar, ArrowUpDown, ChevronUp, ChevronDown, Download, Bot, Ticket, Clock, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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

interface ModelUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface CompanyUsage {
  companyId: number;
  companyName: string;
  provider: string;
  model: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface UsageCostData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  byModel: ModelUsage[];
  byCompany: CompanyUsage[];
}

interface TicketModelStat {
  model: string;
  provider: string;
  count: number;
  share: number;
}

interface TicketAnalytics {
  total: number;
  open: number;
  resolved: number;
  aiSolved: number;
  aiSolveRate: number;
  avgResolutionMs: number;
  byModel: TicketModelStat[];
}

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o":                     "#10b981",
  "gpt-4o-mini":                "#34d399",
  "chatgpt-4o-latest":          "#047857",
  "gpt-4-turbo":                "#059669",
  "gpt-4":                      "#065f46",
  "gpt-3.5-turbo":              "#6ee7b7",
  "o1":                         "#0d9488",
  "o1-mini":                    "#14b8a6",
  "o3":                         "#0f766e",
  "o3-mini":                    "#2dd4bf",
  "claude-3-7-sonnet-20250219": "#7c3aed",
  "claude-3-5-sonnet-20241022": "#8b5cf6",
  "claude-3-5-haiku-20241022":  "#a78bfa",
  "claude-3-opus-20240229":     "#6d28d9",
  "claude-3-haiku-20240307":    "#c4b5fd",
  "claude-3-sonnet-20240229":   "#9333ea",
  "gemini-1.5-pro":             "#3b82f6",
  "gemini-1.5-pro-latest":      "#2563eb",
  "gemini-2.0-pro-exp-02-05":   "#1d4ed8",
  "gemini-2.5-pro":             "#1e40af",
  "gemini-1.5-flash":           "#60a5fa",
  "gemini-1.5-flash-8b":        "#93c5fd",
  "gemini-2.5-flash":           "#38bdf8",
  "google/gemini-2.5-flash":    "#38bdf8",
  "google/gemini-2.5-flash:free": "#38bdf8",
  "gemini-2.0-flash":           "#38bdf8",
  "gemini-2.0-flash-lite":      "#7dd3fc",
  "openrouter/free":                        "#ec4899",
  "google/gemma-4-31b-it:free":             "#f43f5e",
  "nvidia/nemotron-3.5-lightning:free":     "#fb7185",
  "deepseek/deepseek-r1:free":              "#a855f7",
  "meta-llama/llama-3.3-70b-instruct:free": "#d946ef",
  "meta-llama/llama-3.1-8b-instruct:free":  "#e879f9",
  "deepseek/deepseek-v4-flash":             "#06b6d4",
  "deepseek/deepseek-v3":                   "#0ea5e9",
  "deepseek/deepseek-chat":                 "#0ea5e9",
  "deepseek/deepseek-r1":                   "#8b5cf6",
  "deepseek/deepseek-r1-0528":              "#8b5cf6",
  "anthropic/claude-3.7-sonnet":            "#d97706",
  "anthropic/claude-3.5-sonnet":            "#f59e0b",
  "anthropic/claude-sonnet-4.5":            "#d97706",
  "anthropic/claude-haiku-4.5":             "#f59e0b",
  "openai/gpt-4o":                          "#10b981",
  "openai/gpt-4o-mini":                     "#34d399",
  "openai/o3-mini":                         "#059669",
  "openai/o1":                              "#047857",
  "google/gemini-2.5-pro":                  "#2563eb",
  "google/gemini-pro-1.5":                  "#3b82f6",
  "mistralai/mistral-large":                "#f97316",
  "meta-llama/llama-3.3-70b-instruct":      "#a21caf",
  "unknown":                                "#6b7280",
};

type RangePreset = "today" | "7d" | "30d" | "month" | "all";
type SortKey = "costUsd" | "messages" | "inputTokens" | "outputTokens";
type SortDir = "asc" | "desc";

const RANGE_OPTIONS: { key: RangePreset; label: string }[] = [
  { key: "today",  label: "Today" },
  { key: "7d",     label: "Last 7 days" },
  { key: "30d",    label: "Last 30 days" },
  { key: "month",  label: "This month" },
  { key: "all",    label: "All time" },
];

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n === 0)    return "$0.00";
  if (n < 0.0001) return `<$0.0001`;
  if (n < 0.01)  return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ModelUsage & { name: string; value: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs space-y-1">
      <p className="font-semibold text-foreground">{d.model}</p>
      <p className="text-muted-foreground">Cost: <span className="text-foreground font-medium">{formatCost(d.costUsd)}</span></p>
      <p className="text-muted-foreground">Input tokens: <span className="text-foreground font-medium">{formatTokens(d.inputTokens)}</span></p>
      <p className="text-muted-foreground">Output tokens: <span className="text-foreground font-medium">{formatTokens(d.outputTokens)}</span></p>
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "desc"
    ? <ChevronDown className="w-3 h-3 text-primary" />
    : <ChevronUp className="w-3 h-3 text-primary" />;
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  const { lang } = useLanguage();
  const [activeRange, setActiveRange] = useState<RangePreset>("30d");
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(toIso(new Date(Date.now() - 30 * 86400000)));
  const [customTo, setCustomTo] = useState(toIso(new Date()));
  const [sortKey, setSortKey]   = useState<SortKey>("costUsd");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");

  const queryParams = useMemo(() => {
    if (showCustom && customFrom && customTo) {
      return `from=${customFrom}&to=${customTo}`;
    }
    return `range=${activeRange}`;
  }, [showCustom, customFrom, customTo, activeRange]);

  const queryKeyParam = showCustom ? `custom:${customFrom}:${customTo}` : activeRange;

  const { data: usage, isLoading: usageLoading } = useQuery<UsageCostData>({
    queryKey: ["admin-usage-cost", queryKeyParam],
    queryFn: () => customFetch(`/api/admin/usage-cost?${queryParams}`),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: ticketStats, isLoading: ticketStatsLoading } = useQuery<TicketAnalytics>({
    queryKey: ["admin-ticket-analytics", queryKeyParam],
    queryFn: () => customFetch(`/api/admin/ticket-analytics?${queryParams}`),
    refetchInterval: 60 * 1000,
  });

  const { data: companies, isLoading: companiesLoading } = useQuery<any[]>({
    queryKey: ["admin-companies"],
    queryFn: () => customFetch("/api/admin/companies"),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: quotaSettings } = useQuery<{ aiProvider: string; aiModel: string }>({
    queryKey: ["admin-quota-ai-settings"],
    queryFn: () => customFetch("/api/admin/quota-ai-settings"),
    refetchInterval: 5 * 60 * 1000,
  });

  const pieData = useMemo(() => {
    return (usage?.byModel ?? []).map((m) => ({
      ...m,
      name: m.model,
      value: m.costUsd > 0 ? m.costUsd : m.inputTokens + m.outputTokens,
    }));
  }, [usage]);

  const hasUsage = (usage?.totalTokens ?? 0) > 0;

  const quotaCompanies = useMemo(() => {
    const defaultModel = quotaSettings?.aiModel || "gpt-4o-mini";
    const defaultProvider = quotaSettings?.aiProvider || "openai";
    return (companies ?? [])
      .filter((c) => c.monthlyTokenQuota != null && Number(c.monthlyTokenQuota) > 0)
      .map((c) => {
        const u = (usage?.byCompany ?? []).find((x) => x.companyId === c.id);
        const resolvedModel = c.aiModel || u?.model || defaultModel;
        const resolvedProvider = (c.aiModel ? c.aiProvider : null) || u?.provider || defaultProvider;
        return {
          ...c,
          model: resolvedModel,
          provider: resolvedProvider,
          messages: u?.messages ?? 0,
          inputTokens: u?.inputTokens ?? 0,
          outputTokens: u?.outputTokens ?? 0,
          costUsd: u?.costUsd ?? 0,
        };
      })
      .sort((a, b) => Number(b.monthlyTokenQuota || 0) - Number(a.monthlyTokenQuota || 0));
  }, [companies, usage, quotaSettings]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedCompanies = useMemo(() => {
    return [...(usage?.byCompany ?? [])].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
  }, [usage, sortKey, sortDir]);

  const rangeLabel = useMemo(() => {
    if (showCustom) {
      return `${customFrom} → ${customTo}`;
    }
    return RANGE_OPTIONS.find((o) => o.key === activeRange)?.label ?? "";
  }, [showCustom, customFrom, customTo, activeRange]);

  function exportCSV() {
    const rows: string[][] = [
      ["Company", "Provider", "Model", "Messages", "Input Tokens", "Output Tokens", "Total Tokens", "Est. Cost (USD)"],
    ];
    for (const c of sortedCompanies) {
      rows.push([
        c.companyName,
        c.provider,
        c.model,
        String(c.messages),
        String(c.inputTokens),
        String(c.outputTokens),
        String(c.inputTokens + c.outputTokens),
        c.costUsd.toFixed(6),
      ]);
    }
    rows.push([
      "TOTAL", "", "",
      String(sortedCompanies.reduce((s, c) => s + c.messages, 0)),
      String(usage?.totalInputTokens ?? 0),
      String(usage?.totalOutputTokens ?? 0),
      String(usage?.totalTokens ?? 0),
      (usage?.totalCostUsd ?? 0).toFixed(6),
    ]);

    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-report-${showCustom ? `${customFrom}-to-${customTo}` : activeRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-7">
      {/* 1. Hero Operations Banner matching Bot Manager Login aesthetic */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        {/* Soft atmospheric blurred circles */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Robot Badge (exact style as Login page) */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-robot text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {lang === "ar" ? "مركز العمليات وإدارة المنصة" : "Bot Manager · Operations Center"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "لوحة تحكم المسؤول" : "Admin Operations Dashboard"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "متابعة استهلاك رموز الذكاء الاصطناعي، أداء الشركات، وتذاكر الدعم الفني المباشرة."
                  : "Platform telemetry, AI token consumption, company deployments, and customer support analytics."}
              </p>
            </div>
          </div>

          {/* Global Date Filter Controls (Translucent frosted glass inside hero) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 self-start lg:self-auto shrink-0">
            <div className="flex items-center gap-1 bg-black/20 backdrop-blur-md border border-white/20 rounded-xl p-1 overflow-x-auto max-w-full scrollbar-hide">
              <Calendar className="w-3.5 h-3.5 text-blue-200 ml-1.5 shrink-0" />
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setActiveRange(opt.key); setShowCustom(false); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                    !showCustom && activeRange === opt.key
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustom((v) => !v)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  showCustom
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                <span>Custom</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {showCustom && (
              <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl px-3 py-1.5 shadow-sm text-xs text-white">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-white outline-none text-xs [color-scheme:dark]"
                />
                <span className="text-white/70">→</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={toIso(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-white outline-none text-xs [color-scheme:dark]"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Platform Stat Cards (Rounded 2xl with soft shadows & vibrant badges) */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Companies */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl border-l-4 border-l-[#2D5BE3]">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Companies</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          {isLoading ? <Skeleton className="h-8 w-20" /> : (
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {stats?.totalCompanies || 0}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">Registered organizations</p>
        </div>

        {/* Active Companies */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl border-l-4 border-l-[#2D5BE3]">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Companies</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          {isLoading ? <Skeleton className="h-8 w-20" /> : (
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {stats?.activeCompanies || 0}
            </div>
          )}
          <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live & responding
          </p>
        </div>

        {/* Inactive Companies */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl border-l-4 border-l-[#2D5BE3]">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Inactive Companies</span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shadow-xs">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          {isLoading ? <Skeleton className="h-8 w-20" /> : (
            <div className="text-3xl font-extrabold text-slate-600 dark:text-slate-300 tracking-tight">
              {stats?.inactiveCompanies || 0}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">Paused / setup pending</p>
        </div>

        {/* Quota Assigned */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl border-l-4 border-l-[#2D5BE3]">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Quota Assigned</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center shadow-xs">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          {isLoading ? <Skeleton className="h-8 w-20" /> : (
            <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
              {(stats as any)?.quotaCompanies || 0}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">Monthly token limits active</p>
        </div>

        {/* Total Clients */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl border-l-4 border-l-[#2D5BE3]">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Clients</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <Users className="w-4 h-4" />
            </div>
          </div>
          {isLoading ? <Skeleton className="h-8 w-20" /> : (
            <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 tracking-tight">
              {stats?.totalClients || 0}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">Client portal accounts</p>
        </div>
      </div>

      {/* 3. AI Usage & Cost Section */}
      <div>
        {/* Section Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            AI Usage &amp; Cost Estimation
          </h2>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border border-[#DCE7FF] dark:border-slate-700 px-3 py-1 rounded-lg flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            Showing: {rangeLabel}
          </span>
        </div>

        {/* Summary cards */}
        <div className="grid gap-5 md:grid-cols-3 mb-6">
          <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Tokens Used</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            {usageLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{formatTokens(usage?.totalTokens ?? 0)}</div>
                <p className="text-xs text-slate-400 mt-1.5 font-medium">
                  {formatTokens(usage?.totalInputTokens ?? 0)} in · {formatTokens(usage?.totalOutputTokens ?? 0)} out
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Estimated Total Cost</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 flex items-center justify-center shadow-xs">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            {usageLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">{formatCost(usage?.totalCostUsd ?? 0)}</div>
                <p className="text-xs text-slate-400 mt-1.5">Based on official API pricing rates</p>
              </>
            )}
          </div>

          <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Models in Use</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shadow-xs">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            {usageLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">{usage?.byModel?.length ?? 0}</div>
                <p className="text-xs text-slate-400 mt-1.5 truncate">
                  {usage?.byModel?.map((m) => m.model).join(", ") || "No models used yet"}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Pie chart + model table */}
        <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 mb-6 overflow-hidden border-l-4 border-l-[#2D5BE3]">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Cost Breakdown by Model</CardTitle>
            <p className="text-xs text-muted-foreground">Estimated USD cost per AI model · {rangeLabel}</p>
          </CardHeader>
          <CardContent className="pt-6">
            {usageLoading ? (
              <div className="flex items-center justify-center h-64">
                <Skeleton className="h-48 w-48 rounded-full" />
              </div>
            ) : !hasUsage ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                <Zap className="w-10 h-10 opacity-20" />
                <p className="text-sm text-center">No chat activity in this period — cost data will appear once messages are processed.</p>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="w-full lg:w-1/2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                        {pieData.map((entry) => (
                          <Cell key={entry.model} fill={MODEL_COLORS[entry.model] ?? MODEL_COLORS["unknown"]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend formatter={(value) => <span className="text-xs text-foreground font-medium">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full lg:w-1/2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/50">
                        <th className="text-left pb-2 font-semibold">Model</th>
                        <th className="text-right pb-2 font-semibold">Tokens</th>
                        <th className="text-right pb-2 font-semibold">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {(usage?.byModel ?? []).map((m) => (
                        <tr key={m.model} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MODEL_COLORS[m.model] ?? MODEL_COLORS["unknown"] }} />
                              <span className="font-semibold truncate">{m.model}</span>
                              <span className="text-muted-foreground/60 capitalize shrink-0">({m.provider})</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right tabular-nums">{formatTokens(m.inputTokens + m.outputTokens)}</td>
                          <td className="py-2.5 text-right tabular-nums font-bold text-emerald-500 dark:text-emerald-400">{formatCost(m.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-company breakdown table */}
        <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 overflow-hidden mb-6 border-l-4 border-l-[#2D5BE3]">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Building2 className="w-4 h-4 text-blue-600" />
                Usage by Company
              </CardTitle>
              <button
                onClick={exportCSV}
                disabled={sortedCompanies.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#DCE7FF] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Click column headers to sort · {rangeLabel}</p>
          </CardHeader>
          <CardContent className="p-0">
            {usageLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : sortedCompanies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                <Building2 className="w-8 h-8 opacity-20" />
                <p className="text-xs">No company activity in this period.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-slate-50/70 dark:bg-slate-800/40">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Company</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Model</th>
                      <th
                        className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("messages")}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          Messages <SortIcon col="messages" sortKey={sortKey} sortDir={sortDir} />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("inputTokens")}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          Input Tokens <SortIcon col="inputTokens" sortKey={sortKey} sortDir={sortDir} />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("outputTokens")}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          Output Tokens <SortIcon col="outputTokens" sortKey={sortKey} sortDir={sortDir} />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-3 font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("costUsd")}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          Est. Cost <SortIcon col="costUsd" sortKey={sortKey} sortDir={sortDir} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {sortedCompanies.map((c, i) => {
                      const totalTokens = usage?.totalTokens ?? 0;
                      const share = totalTokens > 0 ? ((c.inputTokens + c.outputTokens) / totalTokens) * 100 : 0;
                      return (
                        <tr key={c.companyId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {i + 1}
                              </span>
                              <div>
                                <p className="font-semibold text-foreground">{c.companyName}</p>
                                <p className="text-muted-foreground/60 capitalize text-[10px]">{c.provider}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: MODEL_COLORS[c.model] ?? MODEL_COLORS["unknown"] }} />
                              <span className="font-mono text-[11px]">{c.model}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-medium">{c.messages.toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-medium">{formatTokens(c.inputTokens)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-medium">{formatTokens(c.outputTokens)}</td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="tabular-nums font-bold text-emerald-500 dark:text-emerald-400">{formatCost(c.costUsd)}</span>
                              <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-slate-50/50 dark:bg-slate-800/50">
                      <td className="px-4 py-3 text-xs font-bold text-foreground" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-right text-xs font-bold tabular-nums">
                        {sortedCompanies.reduce((s, c) => s + c.messages, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold tabular-nums">
                        {formatTokens(usage?.totalInputTokens ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold tabular-nums">
                        {formatTokens(usage?.totalOutputTokens ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-extrabold text-emerald-500 dark:text-emerald-400 tabular-nums">
                        {formatCost(usage?.totalCostUsd ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quota Assigned Companies table */}
        <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 overflow-hidden border-l-4 border-l-[#2D5BE3]">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Coins className="w-4 h-4 text-amber-500" />
                Quota Assigned Companies
              </CardTitle>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 border border-[#DCE7FF] dark:border-slate-700">
                <Calendar className="w-3 h-3 text-blue-600" />
                {rangeLabel}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Companies with an active monthly token quota · Usage in {rangeLabel}</p>
          </CardHeader>
          <CardContent className="p-0">
            {companiesLoading || usageLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : quotaCompanies.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                <Coins className="w-8 h-8 opacity-20" />
                <p className="text-xs">No companies have assigned quotas.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-slate-50/70 dark:bg-slate-800/40">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Company</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Model</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Quota Assigned</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Messages</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Tokens Used</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {quotaCompanies.map((c, i) => {
                      const totalUsed = c.inputTokens + c.outputTokens;
                      const quotaShare = c.monthlyTokenQuota > 0 ? (totalUsed / c.monthlyTokenQuota) * 100 : 0;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {i + 1}
                              </span>
                              <div>
                                <p className="font-semibold text-foreground">{c.name}</p>
                                <p className="text-muted-foreground/60 capitalize text-[10px]">{c.provider ?? "unknown"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: MODEL_COLORS[c.model ?? ""] ?? MODEL_COLORS["unknown"] }} />
                              <span className="font-mono text-[11px]">{c.model ?? "unknown"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-medium">{formatTokens(c.monthlyTokenQuota)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-medium">{c.messages.toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-medium">{formatTokens(totalUsed)}</span>
                              <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full ${quotaShare > 90 ? 'bg-rose-500' : quotaShare > 75 ? 'bg-amber-500' : 'bg-emerald-500/80'}`} style={{ width: `${Math.min(quotaShare, 100)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="tabular-nums font-bold text-emerald-500 dark:text-emerald-400">{formatCost(c.costUsd)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Ticket Analytics Section */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Support Ticket Analytics</h2>
          </div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg flex items-center gap-1.5 border border-[#DCE7FF] dark:border-slate-700">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            Showing: {rangeLabel}
          </span>
        </div>

        {/* Summary cards */}
        <div className="grid gap-5 md:grid-cols-3 mb-6">
          <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">AI Solve Rate</span>
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/30 text-violet-500 flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            {ticketStatsLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-3xl font-extrabold text-violet-600 dark:text-violet-400 tracking-tight">{ticketStats?.aiSolveRate ?? 0}%</div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {ticketStats?.aiSolved ?? 0} of {ticketStats?.total ?? 0} tickets answered by AI
                </p>
                {/* progress bar */}
                <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all"
                    style={{ width: `${ticketStats?.aiSolveRate ?? 0}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Avg. Resolution Time</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center shadow-xs">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            {ticketStatsLoading ? <Skeleton className="h-8 w-24" /> : (() => {
              const ms  = ticketStats?.avgResolutionMs ?? 0;
              const mins = Math.floor(ms / 60000);
              const hrs  = Math.floor(mins / 60);
              const days = Math.floor(hrs / 24);
              const label = ms === 0 ? "—"
                : days > 0 ? `${days}d ${hrs % 24}h`
                : hrs  > 0 ? `${hrs}h ${mins % 60}m`
                : mins > 0 ? `${mins}m`
                : "<1m";
              return (
                <>
                  <div className="text-3xl font-extrabold text-amber-500 dark:text-amber-400 tracking-tight">{label}</div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Across {ticketStats?.resolved ?? 0} resolved tickets
                  </p>
                </>
              );
            })()}
          </div>

          <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 transition-all hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
            <div className="flex items-center justify-between pb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Open vs Resolved</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shadow-xs">
                <Bot className="w-4 h-4" />
              </div>
            </div>
            {ticketStatsLoading ? <Skeleton className="h-8 w-24" /> : (
              <>
                <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{ticketStats?.resolved ?? 0} <span className="text-base font-normal text-muted-foreground">/ {ticketStats?.total ?? 0}</span></div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {ticketStats?.open ?? 0} still open
                </p>
                <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                    style={{ width: ticketStats?.total ? `${(ticketStats.resolved / ticketStats.total) * 100}%` : "0%" }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Model breakdown */}
        <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 overflow-hidden border-l-4 border-l-[#2D5BE3]">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <Bot className="w-4 h-4 text-violet-500" />
              AI Models Used for Support
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Which models handled AI-solved tickets</p>
          </CardHeader>
          <CardContent className="pt-5">
            {ticketStatsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !ticketStats?.byModel?.length ? (
              <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
                <Bot className="w-8 h-8 opacity-20" />
                <p className="text-xs">No AI-solved tickets yet. Use the AI Solve button on any ticket to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {ticketStats.byModel.map((m) => {
                  const providerColor =
                    m.provider === "anthropic" ? "bg-orange-500"
                    : m.provider === "google"   ? "bg-blue-500"
                    : "bg-emerald-500";
                  const providerBadgeColor =
                    m.provider === "anthropic" ? "text-orange-500 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800"
                    : m.provider === "google"   ? "text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800"
                    : "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800";
                  const providerLabel =
                    m.provider === "anthropic" ? "Anthropic"
                    : m.provider === "google"   ? "Google"
                    : "OpenAI";
                  return (
                    <div key={`${m.provider}::${m.model}`} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold font-mono text-foreground truncate">{m.model}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 ${providerBadgeColor}`}>
                            {providerLabel}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${providerColor}`} style={{ width: `${m.share}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-24">
                        <p className="text-xs font-bold tabular-nums text-foreground">{m.count} ticket{m.count !== 1 ? "s" : ""}</p>
                        <p className="text-[10px] font-medium text-slate-400">{m.share}% of AI</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. System Status Operations Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE7FF] dark:border-slate-800 shadow-lg shadow-slate-200/40 dark:shadow-black/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-l-[#2D5BE3]">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Bot Manager Operational Telemetry</h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                All Systems Normal
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Live AI gateways, automated webhooks, database clusters, and customer response engines are running at 100% capacity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}