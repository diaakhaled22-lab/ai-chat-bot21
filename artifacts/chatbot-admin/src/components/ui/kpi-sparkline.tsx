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

// ── Deterministic Data Generator for Default Sparklines ─────────────────────
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

  const count = 9;
  const points: number[] = [];
  let current = trend === "up" ? 35 : 75;

  for (let i = 0; i < count; i++) {
    const step = (trend === "up" ? 1 : -1) * (random() * 8 + 2);
    const noise = (random() - 0.48) * 10;
    current = Math.max(15, Math.min(95, current + step + noise));
    points.push(Math.round(current));
  }
  return points;
}

// ── Dark Glassy Blue Sparkline Chart ────────────────────────────────────────
export function KpiSparkline({
  data,
  trend = "up",
  height = 34,
  className = "",
  seed,
}: KpiSparklineProps) {
  const reactId = useId();
  const gradId = `spark-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const resolvedData = useMemo(() => {
    if (data && data.length >= 2) return data;
    return generateSparklineData(trend, String(seed ?? trend));
  }, [data, trend, seed]);

  const { pathD, areaD, lastPoint } = useMemo(() => {
    const width = 160;
    const h = 40;
    const paddingX = 4;
    const paddingTop = 6;
    const paddingBottom = 6;

    const min = Math.min(...resolvedData);
    const max = Math.max(...resolvedData);
    const range = max - min || 1;

    const coords: [number, number][] = resolvedData.map((val, idx) => {
      const x = paddingX + (idx / (resolvedData.length - 1)) * (width - paddingX * 2);
      const normalizedY = (val - min) / range;
      const y = h - paddingBottom - normalizedY * (h - paddingTop - paddingBottom);
      return [x, y];
    });

    // Cubic Bezier curve
    let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];

      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }

    const last = coords[coords.length - 1];
    const area = `${d} L ${last[0].toFixed(1)} ${h} L ${coords[0][0].toFixed(1)} ${h} Z`;

    return { pathD: d, areaD: area, lastPoint: { x: last[0], y: last[1] } };
  }, [resolvedData]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden mt-3 pt-1 pointer-events-none rounded-b-xl",
        className
      )}
      style={{ height }}
    >
      <svg
        viewBox="0 0 160 40"
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          {/* Dark Glassy Blue Gradient */}
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#1e40af" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#172554" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Shaded Area */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Main Line: Dark Glassy Blue */}
        <path
          d={pathD}
          fill="none"
          stroke="#1e3a8a"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="dark:stroke-blue-400"
        />

        {/* Pulse End Dot */}
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="3"
          className="fill-blue-800 dark:fill-blue-400"
        />
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r="1.5"
          className="fill-sky-300 dark:fill-white"
        />
      </svg>
    </div>
  );
}
