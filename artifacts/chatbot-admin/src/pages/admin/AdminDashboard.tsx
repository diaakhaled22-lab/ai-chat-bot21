import { useState } from "react";
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
  "gpt-4-turbo":                "#059669",
  "gpt-3.5-turbo":              "#6ee7b7",
  "claude-3-5-sonnet-20241022": "#8b5cf6",
  "claude-3-5-haiku-20241022":  "#a78bfa",
  "claude-3-opus-20240229":     "#6d28d9",
  "claude-3-haiku-20240307":    "#c4b5fd",
  "gemini-1.5-pro":             "#3b82f6",
  "gemini-1.5-flash":           "#60a5fa",
  "gemini-2.0-flash":           "#93c5fd",
  "unknown":                    "#6b7280",
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

function getDateRange(preset: RangePreset): { from?: string; to?: string } {
  const now = new Date();
  const toISO = now.toISOString();
  if (preset === "all") return {};
  if (preset === "today") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    return { from: s.toISOString(), to: toISO };
  }
  if (preset === "7d")  return { from: new Date(now.getTime() - 7  * 864e5).toISOString(), to: toISO };
  if (preset === "30d") return { from: new Date(now.getTime() - 30 * 864e5).toISOString(), to: toISO };
  if (preset === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: toISO };
  }
  return {};
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
  const [activeRange, setActiveRange] = useState<RangePreset>("30d");
  const [sortKey, setSortKey]   = useState<SortKey>("costUsd");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");

  const { from, to } = getDateRange(activeRange);
  const queryParams = new URLSearchParams();
  if (from) queryParams.set("from", from);
  if (to)   queryParams.set("to",   to);
  const qs = queryParams.toString();

  const { data: usage, isLoading: usageLoading } = useQuery<UsageCostData>({
    queryKey: ["admin-usage-cost", activeRange],
    queryFn: () => customFetch(`/api/admin/usage-cost${qs ? `?${qs}` : ""}`),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: ticketStats, isLoading: ticketStatsLoading } = useQuery<TicketAnalytics>({
    queryKey: ["admin-ticket-analytics"],
    queryFn: () => customFetch("/api/admin/ticket-analytics"),
    refetchInterval: 60 * 1000,
  });

  const pieData = (usage?.byModel ?? []).map((m) => ({
    ...m,
    name: m.model,
    value: m.costUsd > 0 ? m.costUsd : m.inputTokens + m.outputTokens,
  }));

  const hasUsage = (usage?.totalTokens ?? 0) > 0;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

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
    a.download = `usage-report-${activeRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sortedCompanies = [...(usage?.byCompany ?? [])].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  const rangeLabel = RANGE_OPTIONS.find((o) => o.key === activeRange)?.label ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-2">Platform statistics and metrics.</p>
      </div>

      {/* Platform stat cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
            <Building2 className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold">{stats?.totalCompanies || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Companies</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold">{stats?.activeCompanies || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Inactive Companies</CardTitle>
            <XCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold">{stats?.inactiveCompanies || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-3xl font-bold">{stats?.totalClients || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage & Cost Section */}
      <div>
        {/* Header + range picker */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            AI Usage &amp; Cost Estimation
          </h2>

          <div className="flex items-center gap-1 bg-muted/40 border border-border/50 rounded-lg p-1">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground ml-1.5 shrink-0" />
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setActiveRange(opt.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeRange === opt.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-6">
          <Card className="bg-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total Tokens Used</CardTitle>
              <Zap className="w-4 h-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              {usageLoading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <div className="text-3xl font-bold">{formatTokens(usage?.totalTokens ?? 0)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTokens(usage?.totalInputTokens ?? 0)} in · {formatTokens(usage?.totalOutputTokens ?? 0)} out
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Estimated Total Cost</CardTitle>
              <Coins className="w-4 h-4 text-emerald-400" />
            </CardHeader>
            <CardContent>
              {usageLoading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <div className="text-3xl font-bold">{formatCost(usage?.totalCostUsd ?? 0)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Based on official API pricing rates</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Models in Use</CardTitle>
              <Activity className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              {usageLoading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <div className="text-3xl font-bold">{usage?.byModel?.length ?? 0}</div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {usage?.byModel?.map((m) => m.model).join(", ") || "No models used yet"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pie chart + model table */}
        <Card className="bg-card border-border/50 mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost Breakdown by Model</CardTitle>
            <p className="text-xs text-muted-foreground">Estimated USD cost per AI model · {rangeLabel}</p>
          </CardHeader>
          <CardContent>
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
                      <Legend formatter={(value) => <span className="text-xs text-foreground">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full lg:w-1/2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border/50">
                        <th className="text-left pb-2 font-medium">Model</th>
                        <th className="text-right pb-2 font-medium">Tokens</th>
                        <th className="text-right pb-2 font-medium">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {(usage?.byModel ?? []).map((m) => (
                        <tr key={m.model} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MODEL_COLORS[m.model] ?? MODEL_COLORS["unknown"] }} />
                              <span className="font-medium truncate">{m.model}</span>
                              <span className="text-muted-foreground/60 capitalize shrink-0">({m.provider})</span>
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums">{formatTokens(m.inputTokens + m.outputTokens)}</td>
                          <td className="py-2 text-right tabular-nums font-medium text-emerald-400">{formatCost(m.costUsd)}</td>
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
        <Card className="bg-card border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Usage by Company
              </CardTitle>
              <button
                onClick={exportCSV}
                disabled={sortedCompanies.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <tr className="border-b border-border/50 bg-muted/20">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Company</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Model</th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("messages")}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          Messages <SortIcon col="messages" sortKey={sortKey} sortDir={sortDir} />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("inputTokens")}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          Input Tokens <SortIcon col="inputTokens" sortKey={sortKey} sortDir={sortDir} />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort("outputTokens")}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          Output Tokens <SortIcon col="outputTokens" sortKey={sortKey} sortDir={sortDir} />
                        </span>
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
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
                        <tr key={c.companyId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                                {i + 1}
                              </span>
                              <div>
                                <p className="font-medium text-foreground">{c.companyName}</p>
                                <p className="text-muted-foreground/60 capitalize">{c.provider}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: MODEL_COLORS[c.model] ?? MODEL_COLORS["unknown"] }} />
                              <span className="font-mono">{c.model}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{c.messages.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatTokens(c.inputTokens)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatTokens(c.outputTokens)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="tabular-nums font-semibold text-emerald-400">{formatCost(c.costUsd)}</span>
                              <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${Math.min(share, 100)}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/10">
                      <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground" colSpan={2}>Total</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                        {sortedCompanies.reduce((s, c) => s + c.messages, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                        {formatTokens(usage?.totalInputTokens ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                        {formatTokens(usage?.totalOutputTokens ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-400 tabular-nums">
                        {formatCost(usage?.totalCostUsd ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ticket Analytics Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Ticket className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Support Ticket Analytics</h2>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="bg-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">AI Solve Rate</CardTitle>
              <Sparkles className="w-4 h-4 text-violet-400" />
            </CardHeader>
            <CardContent>
              {ticketStatsLoading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <div className="text-3xl font-bold">{ticketStats?.aiSolveRate ?? 0}%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ticketStats?.aiSolved ?? 0} of {ticketStats?.total ?? 0} tickets answered by AI
                  </p>
                  {/* progress bar */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/70 transition-all"
                      style={{ width: `${ticketStats?.aiSolveRate ?? 0}%` }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Avg. Resolution Time</CardTitle>
              <Clock className="w-4 h-4 text-amber-400" />
            </CardHeader>
            <CardContent>
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
                    <div className="text-3xl font-bold">{label}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Across {ticketStats?.resolved ?? 0} resolved tickets
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="bg-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Open vs Resolved</CardTitle>
              <Bot className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              {ticketStatsLoading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <div className="text-3xl font-bold">{ticketStats?.resolved ?? 0} <span className="text-base font-normal text-muted-foreground">/ {ticketStats?.total ?? 0}</span></div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ticketStats?.open ?? 0} still open
                  </p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/70 transition-all"
                      style={{ width: ticketStats?.total ? `${(ticketStats.resolved / ticketStats.total) * 100}%` : "0%" }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Model breakdown */}
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-400" />
              AI Models Used for Support
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Which models handled AI-solved tickets</p>
          </CardHeader>
          <CardContent>
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
              <div className="space-y-3">
                {ticketStats.byModel.map((m) => {
                  const providerColor =
                    m.provider === "anthropic" ? "bg-orange-500/70"
                    : m.provider === "google"   ? "bg-blue-500/70"
                    : "bg-emerald-500/70";
                  const providerBadgeColor =
                    m.provider === "anthropic" ? "text-orange-400 bg-orange-500/10 border-orange-500/30"
                    : m.provider === "google"   ? "text-blue-400 bg-blue-500/10 border-blue-500/30"
                    : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
                  const providerLabel =
                    m.provider === "anthropic" ? "Anthropic"
                    : m.provider === "google"   ? "Google"
                    : "OpenAI";
                  return (
                    <div key={`${m.provider}::${m.model}`} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium font-mono truncate">{m.model}</span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold shrink-0 ${providerBadgeColor}`}>
                            {providerLabel}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${providerColor}`} style={{ width: `${m.share}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-20">
                        <p className="text-xs font-semibold tabular-nums">{m.count} ticket{m.count !== 1 ? "s" : ""}</p>
                        <p className="text-[10px] text-muted-foreground">{m.share}% of AI</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System status */}
      <div className="mt-2 p-6 bg-card border border-border/50 rounded-lg">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-medium">System Status</h3>
            <p className="text-sm text-muted-foreground">All systems operational</p>
          </div>
        </div>
      </div>
    </div>
  );
}
