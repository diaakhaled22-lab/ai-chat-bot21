import { useState } from "react";
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
import { Coins, TrendingUp, MessageSquare, DollarSign, Info, CalendarRange, ChevronDown } from "lucide-react";

interface UsageData {
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
}

type Preset = "today" | "week" | "month" | "last_month" | "all";

const CHANNEL_COLORS: Record<string, string> = {
  telegram: "#2AABEE",
  whatsapp: "#25D366",
  website: "#8B5CF6",
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

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "all", label: "All Time" },
];

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
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
  const [preset, setPreset] = useState<Preset>("month");
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(toIso(new Date(Date.now() - 7 * 86400000)));
  const [customTo, setCustomTo] = useState(toIso(new Date()));

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
  const hasModel = data?.aiModel && (data?.pricingPer1MTokens.input ?? 0) > 0;

  const modelLabel = data?.aiModel
    ? `${data.aiProvider ?? ""} / ${data.aiModel}`.trim().replace(/^\/\s*/, "")
    : "No model configured";

  const tokenSplitData = [
    { name: "Input (Customer)", value: data?.estimatedInputTokens ?? 0 },
    { name: "Output (Bot)", value: data?.estimatedOutputTokens ?? 0 },
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
          <h1 className="text-2xl font-bold">Token Usage & Cost</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Estimated usage · ~4 characters per token
          </p>
        </div>

        {/* Date filter */}
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPreset(p.key); setShowCustom(false); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
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
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                showCustom
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Custom <ChevronDown className="w-3 h-3" />
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={MessageSquare}
          label="Total Messages"
          value={isLoading ? "—" : (data?.totalMessages ?? 0).toLocaleString()}
          sub="all channels combined"
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          icon={Coins}
          label="Total Tokens"
          value={isLoading ? "—" : fmt(totalTokens)}
          sub={
            isLoading || !data
              ? ""
              : `${fmt(data.estimatedInputTokens)} in · ${fmt(data.estimatedOutputTokens)} out`
          }
          color="bg-violet-500/10 text-violet-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Active Model"
          value={data?.aiModel ?? "—"}
          sub={data?.aiProvider ?? "provider not set"}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          icon={DollarSign}
          label="Estimated Cost"
          value={
            isLoading
              ? "—"
              : hasModel
              ? `$${data!.estimatedCostUsd.toFixed(4)}`
              : "—"
          }
          sub={
            hasModel
              ? `$${data!.pricingPer1MTokens.input}/M in · $${data!.pricingPer1MTokens.output}/M out`
              : "configure a model to see cost"
          }
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      {/* Loading / error / empty states */}
      {isLoading && (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Loading usage data…
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <Info className="w-8 h-8 opacity-40" />
          <p>No usage data available. Set up your company and start chatting first.</p>
        </div>
      )}

      {!isLoading && !isError && totalTokens === 0 && (
        <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center gap-3 text-muted-foreground">
          <Coins className="w-12 h-12 opacity-20" />
          <p className="text-lg font-medium">No token usage in this period</p>
          <p className="text-sm">Try a different date range or wait for new messages.</p>
        </div>
      )}

      {!isLoading && !isError && totalTokens > 0 && (
        <>
          {/* Pie charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-base font-semibold mb-1">Input vs Output Tokens</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Customer messages (input) vs bot responses (output)
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
              <h2 className="text-base font-semibold mb-1">Token Usage by Channel</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Total tokens consumed across each messaging channel
              </p>
              {channelData.length === 0 ? (
                <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
                  No channel data in this period
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
                <h2 className="text-base font-semibold">Breakdown by Channel</h2>
                <span className="text-xs text-muted-foreground">{rangeLabel}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channel</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Messages</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Input Tokens</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Output Tokens</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.byChannel.map((ch, i) => {
                    const chCost =
                      (ch.inputTokens / 1_000_000) * data!.pricingPer1MTokens.input +
                      (ch.outputTokens / 1_000_000) * data!.pricingPer1MTokens.output;
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
                        <td className="px-6 py-4 text-right tabular-nums text-amber-400">
                          {hasModel ? `$${chCost.toFixed(4)}` : "—"}
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
          Token counts are estimated (~4 chars per token). Pricing is based on published rates for{" "}
          <strong className="text-foreground">{modelLabel}</strong>. Actual costs may vary based on
          system prompt length, API overhead, and provider billing adjustments.
        </span>
      </div>
    </div>
  );
}
