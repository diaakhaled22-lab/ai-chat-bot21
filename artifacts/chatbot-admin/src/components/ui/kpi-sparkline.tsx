import React, { useId, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
export type TrendDirection = "up" | "down";

export interface KpiTrendProps {
  trend?: TrendDirection;
  value?: string | number;
  label?: string;
  className?: string;
}

export interface KpiSparklineProps {
  data?: number[];
  trend?: TrendDirection;
  height?: number;
  className?: string;
  seed?: number | string;
}

// ── Trend Arrow Component ───────────────────────────────────────────────────
// Upward green arrow to indicate growth, downward red arrow to indicate decline
export function KpiTrend({
  trend = "up",
  value,
  label,
  className = "",
}: KpiTrendProps) {
  const isUp = trend === "up";
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;

  const formattedValue =
    typeof value === "number"
      ? `${isUp ? "+" : ""}${value}%`
      : value !== undefined
      ? String(value)
      : isUp
      ? "+12.5%"
      : "-4.2%";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold border transition-colors shadow-xs select-none shrink-0",
        isUp
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        className
      )}
      title={isUp ? "Growth / Upward Trend" : "Decline / Downward Trend"}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
      <span>{formattedValue}</span>
      {label && <span className="text-[10px] opacity-75 font-normal ms-0.5">{label}</span>}
    </div>
  );
}

// ── High-density Data Generator matching the reference waveform ────────────
function generateSparklineData(trend: TrendDirection, seedStr: string = "default"): number[] {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const random = () => {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };

  // 26 data points to produce the exact rhythm and multiple peaks seen in the reference image
  const count = 26;
  const points: number[] = [];
  const base = trend === "up" ? 42 : 58;

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    // General slope according to trend
    const slope = (trend === "up" ? 1 : -1) * (progress * 18 - 9);
    // Dynamic harmonic wave oscillations mimicking the reference image
    const wave1 = Math.sin(i * 1.45 + (hash % 11)) * 16;
    const wave2 = Math.cos(i * 2.35 + (hash % 7)) * 11;
    const wave3 = Math.sin(i * 0.7 + (hash % 5)) * 8;
    const jitter = (random() - 0.5) * 14;

    const val = Math.max(10, Math.min(90, base + slope + wave1 + wave2 + wave3 + jitter));
    points.push(Math.round(val));
  }
  return points;
}

// ── Dark Glass-like Blue Sparkline Chart (Matching Reference Image) ─────────
export function KpiSparkline({
  data,
  trend = "up",
  height = 36,
  className = "",
  seed,
}: KpiSparklineProps) {
  const reactId = useId();
  const gradId = `spark-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const resolvedData = useMemo(() => {
    if (data && data.length >= 2) return data;
    return generateSparklineData(trend, String(seed ?? trend));
  }, [data, trend, seed]);

  const { pathD, areaD } = useMemo(() => {
    const width = 240;
    const h = 40;
    const paddingTop = 5;
    const paddingBottom = 4;

    const min = Math.min(...resolvedData);
    const max = Math.max(...resolvedData);
    const range = max - min || 1;

    // Edge-to-edge points from x=0 to x=width
    const coords: [number, number][] = resolvedData.map((val, idx) => {
      const x = (idx / (resolvedData.length - 1)) * width;
      const normalizedY = (val - min) / range;
      const y = h - paddingBottom - normalizedY * (h - paddingTop - paddingBottom);
      return [x, y];
    });

    // Smooth spline curve through points with tension matching the reference image
    const tension = 0.28;
    let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];

      const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      const cp2y = p2[1] - (p3[1] - p1[1]) * tension;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }

    const last = coords[coords.length - 1];
    const area = `${d} L ${last[0].toFixed(1)} ${h} L ${coords[0][0].toFixed(1)} ${h} Z`;

    return { pathD: d, areaD: area };
  }, [resolvedData]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden mt-2.5 rounded-xl border border-blue-200/50 dark:border-blue-900/40 bg-gradient-to-b from-[#e5edfa]/80 to-[#d8e5f8]/90 dark:from-slate-900/60 dark:to-blue-950/40 backdrop-blur-xs px-1 py-0.5 pointer-events-none shadow-[inset_0_1px_2px_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.06)]",
        className
      )}
      style={{ height }}
    >
      <svg
        viewBox="0 0 240 40"
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          {/* Dark Glassy Blue Gradient matching reference image */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#1e40af" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#172554" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Shaded Area under the curve */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Main Line: Dark Glass-like Blue */}
        <path
          d={pathD}
          fill="none"
          stroke="#1e3a8a"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="dark:stroke-blue-400"
        />
      </svg>
    </div>
  );
}
