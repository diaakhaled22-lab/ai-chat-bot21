import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import QuotaAICard from "@/components/QuotaAICard";
import { AI_PROVIDERS, getModelPricingDetails, type AiProvider } from "@/lib/ai-models";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  Building2,
  Search,
  Loader2,
  X,
  Coins,
  Cpu,
  Calculator,
  Zap,
  RotateCcw,
  Download,
  PieChart,
  ArrowUpDown,
  BarChart3,
  Plus,
  PackagePlus,
  Sparkles,
  CreditCard,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Receipt,
  Printer,
  Copy,
  Calendar,
  Check,
  CheckCircle2,
  AlertCircle,
  FileText,
  Share2,
  Send,
  Mail,
  MoreVertical,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

interface Company {
  id: number;
  name: string;
  clientId: number;
  clientName?: string;
  clientUsername?: string;
  aiProvider?: string;
  aiModel?: string;
  monthlyTokenQuota?: number | null;
  isActive: boolean;
  activationStart?: string | null;
  activationEnd?: string | null;
  quotaStartDate?: string | null;
  quotaEndDate?: string | null;
  notificationEmail?: string | null;
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
  byCompany: CompanyUsage[];
  byModel: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }[];
}

const QUOTA_PRESETS = [
  { label: "100K", value: 100_000 },
  { label: "500K", value: 500_000 },
  { label: "1M", value: 1_000_000 },
  { label: "2M", value: 2_000_000 },
  { label: "5M", value: 5_000_000 },
  { label: "10M", value: 10_000_000 },
];

export type CurrencyCode = "USD" | "SAR" | "EGP";

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  nameAr: string;
  nameEn: string;
  flag: string;
  exchangeRate: number; // exchange rate relative to 1 USD
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: {
    code: "USD",
    symbol: "$",
    nameAr: "USD",
    nameEn: "US Dollar",
    flag: "🇺🇸",
    exchangeRate: 1.0,
  },
  SAR: {
    code: "SAR",
    symbol: "SAR",
    nameAr: "SAR",
    nameEn: "Saudi Riyal",
    flag: "🇸🇦",
    exchangeRate: 3.75,
  },
  EGP: {
    code: "EGP",
    symbol: "EGP",
    nameAr: "EGP",
    nameEn: "Egyptian Pound",
    flag: "🇪🇬",
    exchangeRate: 48.50,
  },
};

export interface TopupPreset {
  label: string;
  tokens: number;
  defaultPrice: string;
}

const TOPUP_PRESETS: TopupPreset[] = [
  { label: "+25K ($5)", tokens: 25_000, defaultPrice: "5.00" },
  { label: "+50K ($10)", tokens: 50_000, defaultPrice: "10.00" },
  { label: "+100K ($18)", tokens: 100_000, defaultPrice: "18.00" },
  { label: "+250K ($40)", tokens: 250_000, defaultPrice: "40.00" },
  { label: "+500K ($75)", tokens: 500_000, defaultPrice: "75.00" },
  { label: "+1M ($140)", tokens: 1_000_000, defaultPrice: "140.00" },
];

export interface TopupInvoiceData {
  invoiceNumber: string;
  companyId: number;
  companyName: string;
  clientName: string;
  recipientEmail?: string;
  previousQuota: number;
  addedTokens: number;
  newTotalQuota: number;
  price: number;
  currency: string;
  date: string;
  previousEndDate?: string | null;
  newEndDate?: string | null;
  notes?: string;
}

function formatQuota(num: number | null | undefined): string {
  if (!num) return "No Quota";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toLocaleString();
}

function formatCost(amount: number | null | undefined, currency: CurrencyCode = "USD"): string {
  const cfg = CURRENCIES[currency] || CURRENCIES.USD;
  const prefix = cfg.code === "USD" ? "$" : "";
  if (amount == null || isNaN(amount) || amount === 0) return `${prefix}0.0000 ${cfg.code}`;
  const converted = amount * cfg.exchangeRate;
  if (converted > 0 && converted < 0.0001) {
    return `${prefix}${converted.toFixed(6)} ${cfg.code}`;
  }
  return `${prefix}${converted.toFixed(4)} ${cfg.code}`;
}

type SortKey = "name" | "messages" | "inputTokens" | "outputTokens" | "quota" | "tokens" | "cost" | "percent" | "startDate" | "endDate";
type SortDir = "asc" | "desc";

type RangePreset = "today" | "7d" | "30d" | "month" | "quota_period" | "all";

const RANGE_OPTIONS: { key: RangePreset; labelAr: string; labelEn: string }[] = [
  { key: "today",  labelAr: "اليوم", labelEn: "Today" },
  { key: "7d",     labelAr: "آخر 7 أيام", labelEn: "Last 7 days" },
  { key: "30d",    labelAr: "آخر 30 يوم", labelEn: "Last 30 days" },
  { key: "month",  labelAr: "هذا الشهر", labelEn: "This month" },
  { key: "quota_period", labelAr: "فترة صلاحية الحصة", labelEn: "Quota Validity Period" },
  { key: "all",    labelAr: "كل الأوقات", labelEn: "All time" },
];

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function applyDatePreset(
  type: "30d" | "endOfMonth" | "90d" | "clear",
  setStart: (v: string) => void,
  setEnd: (v: string) => void,
  currentStart?: string
) {
  if (type === "clear") {
    setStart("");
    setEnd("");
    return;
  }
  const today = new Date();
  const startDate = currentStart && !isNaN(new Date(currentStart).getTime()) ? new Date(currentStart) : today;
  const sStr = toIso(startDate);
  setStart(sStr);

  const base = new Date(sStr);
  if (type === "30d") {
    const e = new Date(base);
    e.setDate(e.getDate() + 30);
    setEnd(toIso(e));
  } else if (type === "90d") {
    const e = new Date(base);
    e.setDate(e.getDate() + 90);
    setEnd(toIso(e));
  } else if (type === "endOfMonth") {
    const e = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    setEnd(toIso(e));
  }
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

function generateBillInvoiceCanvas(data: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  rangeLabel: string;
  effectiveModel: string;
  effectiveProvider: string;
  quotaFormatted: string;
  validityPeriod?: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  percent: number;
  remaining: number | null;
  cost: number;
  isExceeded: boolean;
  currency?: CurrencyCode;
}): string {
  const invCurr = CURRENCIES[data.currency || "USD"] || CURRENCIES.USD;
  const width = 640;
  const height = 660;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#ffffff";
  drawRoundRect(ctx, 0, 0, width, height, 16);
  ctx.fill();

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  drawRoundRect(ctx, 0, 0, width, height, 16);
  ctx.stroke();

  // Header Banner
  const grad = ctx.createLinearGradient(0, 0, width, 110);
  grad.addColorStop(0, "#10b981");
  grad.addColorStop(1, "#059669");
  ctx.fillStyle = grad;
  drawRoundRect(ctx, 0, 0, width, 110, [16, 16, 0, 0]);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("فاتورة استهلاك الحصة (Quota Usage Bill)", width / 2, 40);

  ctx.font = "12px monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(`Invoice #: ${data.invoiceNumber}`, width / 2, 65);

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  drawRoundRect(ctx, width / 2 - 140, 76, 280, 24, 12);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(`الفترة / Period: ${data.rangeLabel}`, width / 2, 92);

  // Info Cards
  const drawCard = (x: number, y: number, w: number, h: number, title: string, value: string, color = "#111827") => {
    ctx.fillStyle = "#f9fafb";
    ctx.strokeStyle = "#f3f4f6";
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#6b7280";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(title, x + w - 12, y + 18);

    ctx.fillStyle = color;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(value, x + w - 12, y + 38);
  };

  const cardW = 286;
  const cardH = 50;
  const startY = 126;
  drawCard(334, startY, cardW, cardH, "الشركة (Company)", data.companyName);
  drawCard(20, startY, cardW, cardH, "العميل (Client)", data.clientName);
  drawCard(334, startY + 58, cardW, cardH, "الحصة المخصصة (Allocated Quota)", `${data.quotaFormatted} tokens`, "#2563eb");
  drawCard(20, startY + 58, cardW, cardH, "النموذج النشط (Active Model)", `${data.effectiveModel} (${data.effectiveProvider.toUpperCase()})`, "#d97706");

  let currentY = startY + 116;
  if (data.validityPeriod) {
    ctx.fillStyle = "#f0fdf4";
    ctx.strokeStyle = "#dcfce7";
    drawRoundRect(ctx, 20, currentY, 600, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#166534";
    ctx.fillText(`📅 فترة صلاحية الحصة (Quota Validity): ${data.validityPeriod}`, width / 2, currentY + 18);
    currentY += 36;
  }

  // Quota Utilization
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e5e7eb";
  drawRoundRect(ctx, 20, currentY, 600, 68, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.fillStyle = "#374151";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("مستوى استهلاك الحصة (Quota Utilization):", 608, currentY + 20);

  ctx.textAlign = "left";
  ctx.fillStyle = data.isExceeded ? "#ef4444" : data.percent >= 80 ? "#f59e0b" : "#10b981";
  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.fillText(`${data.percent.toFixed(1)}%${data.isExceeded ? " (تجاوز الحصة)" : ""}`, 32, currentY + 20);

  ctx.fillStyle = "#e5e7eb";
  drawRoundRect(ctx, 32, currentY + 30, 576, 8, 4);
  ctx.fill();

  const barWidth = Math.min(576, Math.max(4, (Math.min(100, data.percent) / 100) * 576));
  ctx.fillStyle = data.isExceeded ? "#ef4444" : data.percent >= 80 ? "#f59e0b" : "#10b981";
  drawRoundRect(ctx, 32, currentY + 30, barWidth, 8, 4);
  ctx.fill();

  ctx.textAlign = "right";
  ctx.fillStyle = "#6b7280";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText(`المستهلك: ${data.totalTokens.toLocaleString()} tokens`, 608, currentY + 54);

  ctx.textAlign = "left";
  ctx.fillText(`المتبقي: ${data.remaining != null ? data.remaining.toLocaleString() : "غير محدود"}`, 32, currentY + 54);

  currentY += 80;
  const tableX = 20;
  const tableW = 600;

  // Table Header
  ctx.fillStyle = "#f9fafb";
  drawRoundRect(ctx, tableX, currentY, tableW, 28, [6, 6, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = "#e5e7eb";
  ctx.stroke();

  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = "#4b5563";
  ctx.textAlign = "right";
  ctx.fillText("البند (Item)", tableX + tableW - 14, currentY + 18);
  ctx.textAlign = "center";
  ctx.fillText("الاستهلاك (Usage)", tableX + tableW / 2, currentY + 18);
  ctx.textAlign = "left";
  ctx.fillText("التكلفة (Est. Cost)", tableX + 14, currentY + 18);

  currentY += 28;
  const drawRow = (item: string, usage: string, costStr: string, isTotal = false) => {
    ctx.fillStyle = isTotal ? "#f0fdf4" : "#ffffff";
    ctx.fillRect(tableX, currentY, tableW, 30);
    ctx.strokeStyle = isTotal ? "#bbf7d0" : "#f3f4f6";
    ctx.beginPath();
    ctx.moveTo(tableX, currentY + 30);
    ctx.lineTo(tableX + tableW, currentY + 30);
    ctx.stroke();

    ctx.font = isTotal ? "bold 12px system-ui, sans-serif" : "12px system-ui, sans-serif";
    ctx.fillStyle = isTotal ? "#166534" : "#1f2937";
    ctx.textAlign = "right";
    ctx.fillText(item, tableX + tableW - 14, currentY + 20);

    ctx.textAlign = "center";
    ctx.font = "11px monospace";
    ctx.fillText(usage, tableX + tableW / 2, currentY + 20);

    ctx.textAlign = "left";
    ctx.font = isTotal ? "bold 13px monospace" : "11px monospace";
    ctx.fillText(costStr, tableX + 14, currentY + 20);
    currentY += 30;
  };

  const inCost = data.totalTokens > 0 && data.cost > 0 ? (data.inputTokens / data.totalTokens) * data.cost : 0;
  const outCost = data.totalTokens > 0 && data.cost > 0 ? (data.outputTokens / data.totalTokens) * data.cost : 0;

  drawRow("رسائل المحادثة (Total Messages)", `${data.messages.toLocaleString()} msgs`, "—");
  drawRow("رموز المدخلات (Input Tokens)", `${data.inputTokens.toLocaleString()} tokens`, formatCost(inCost, invCurr.code));
  drawRow("رموز المخرجات (Output Tokens)", `${data.outputTokens.toLocaleString()} tokens`, formatCost(outCost, invCurr.code));
  drawRow("إجمالي الاستهلاك والتكلفة", `${data.totalTokens.toLocaleString()} tokens`, formatCost(data.cost, invCurr.code), true);

  currentY += 12;
  ctx.fillStyle = "#ecfdf5";
  ctx.strokeStyle = "#a7f3d0";
  drawRoundRect(ctx, tableX, currentY, tableW, 54, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.fillStyle = "#065f46";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("إجمالي الفاتورة المستحقة للفترة:", tableX + tableW - 16, currentY + 22);
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "#047857";
  ctx.fillText(data.isExceeded ? "تجاوز استهلاك الحصة المسموحة" : "مغطى بالكامل ضمن الحصة الشهرية", tableX + tableW - 16, currentY + 40);

  ctx.textAlign = "left";
  ctx.fillStyle = "#059669";
  ctx.font = "bold 22px monospace";
  ctx.fillText(formatCost(data.cost, invCurr.code), tableX + 16, currentY + 34);
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(invCurr.code, tableX + 16, currentY + 47);

  ctx.textAlign = "center";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("نظام إدارة الحصص والذكاء الاصطناعي — Bot Manager AI Quota System", width / 2, height - 12);

  return canvas.toDataURL("image/png");
}

function generateTopupInvoiceCanvas(data: TopupInvoiceData): string {
  const invCurr = CURRENCIES[(data.currency as CurrencyCode) || "USD"] || CURRENCIES.USD;
  const width = 640;
  const height = 580;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#ffffff";
  drawRoundRect(ctx, 0, 0, width, height, 16);
  ctx.fill();

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  drawRoundRect(ctx, 0, 0, width, height, 16);
  ctx.stroke();

  // Header Banner (Teal to Cyan Gradient)
  const grad = ctx.createLinearGradient(0, 0, width, 110);
  grad.addColorStop(0, "#0f766e");
  grad.addColorStop(1, "#0d9488");
  ctx.fillStyle = grad;
  drawRoundRect(ctx, 0, 0, width, 110, [16, 16, 0, 0]);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("فاتورة شحن باقة إضافية (Top-up Quota Invoice)", width / 2, 40);

  ctx.font = "12px monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(`Invoice #: ${data.invoiceNumber}`, width / 2, 65);

  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  drawRoundRect(ctx, width / 2 - 130, 76, 260, 24, 12);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillText("✓ مدفوعة ومفعلة فوراً (PAID & ACTIVATED)", width / 2, 92);

  // Info Cards
  const drawCard = (x: number, y: number, w: number, h: number, title: string, value: string, color = "#111827") => {
    ctx.fillStyle = "#f9fafb";
    ctx.strokeStyle = "#f3f4f6";
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#6b7280";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(title, x + w - 12, y + 18);

    ctx.fillStyle = color;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(value, x + w - 12, y + 38);
  };

  const cardW = 286;
  const cardH = 50;
  const startY = 126;
  drawCard(334, startY, cardW, cardH, "الشركة (Company)", data.companyName);
  drawCard(20, startY, cardW, cardH, "العميل (Client)", data.clientName);

  drawCard(334, startY + 58, cardW, cardH, "تاريخ الفاتورة (Invoice Date)", new Date(data.date).toLocaleDateString("en-GB"));
  drawCard(20, startY + 58, cardW, cardH, "صلاحية الباقة (Validity End)", data.newEndDate ? data.newEndDate : "نفس الصلاحية السابقة", "#0d9488");

  let currentY = startY + 120;
  const tableX = 20;
  const tableW = 600;

  // Table Header
  ctx.fillStyle = "#f9fafb";
  drawRoundRect(ctx, tableX, currentY, tableW, 28, [6, 6, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = "#e5e7eb";
  ctx.stroke();

  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = "#4b5563";
  ctx.textAlign = "right";
  ctx.fillText("البند (Package Item)", tableX + tableW - 14, currentY + 18);
  ctx.textAlign = "center";
  ctx.fillText("الرموز (Tokens)", tableX + tableW / 2, currentY + 18);
  ctx.textAlign = "left";
  ctx.fillText("القيمة (Amount)", tableX + 14, currentY + 18);

  currentY += 28;
  const drawRow = (item: string, tokensStr: string, costStr: string, isHighlight = false, isTotal = false) => {
    ctx.fillStyle = isTotal ? "#f0fdf4" : isHighlight ? "#f0fdfa" : "#ffffff";
    ctx.fillRect(tableX, currentY, tableW, 32);
    ctx.strokeStyle = isTotal ? "#bbf7d0" : "#f3f4f6";
    ctx.beginPath();
    ctx.moveTo(tableX, currentY + 32);
    ctx.lineTo(tableX + tableW, currentY + 32);
    ctx.stroke();

    ctx.font = isTotal || isHighlight ? "bold 12px system-ui, sans-serif" : "12px system-ui, sans-serif";
    ctx.fillStyle = isTotal ? "#166534" : isHighlight ? "#0f766e" : "#1f2937";
    ctx.textAlign = "right";
    ctx.fillText(item, tableX + tableW - 14, currentY + 21);

    ctx.textAlign = "center";
    ctx.font = "bold 12px monospace";
    ctx.fillText(tokensStr, tableX + tableW / 2, currentY + 21);

    ctx.textAlign = "left";
    ctx.font = isTotal ? "bold 13px monospace" : "11px monospace";
    ctx.fillText(costStr, tableX + 14, currentY + 21);
    currentY += 32;
  };

  drawRow("⚡ الباقة المضافة (Top-up Tokens)", `+${data.addedTokens.toLocaleString()}`, `${invCurr.code === "USD" ? "$" : ""}${data.price.toFixed(2)} ${invCurr.code}`, true);
  drawRow("الحصة الشهرية السابقة (Previous Quota)", `${data.previousQuota.toLocaleString()}`, "—");
  drawRow("الحصة الإجمالية الجديدة (New Total Quota)", `${data.newTotalQuota.toLocaleString()}`, "مفعلة ✅");

  currentY += 12;
  ctx.fillStyle = "#ecfdf5";
  ctx.strokeStyle = "#a7f3d0";
  drawRoundRect(ctx, tableX, currentY, tableW, 54, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.fillStyle = "#065f46";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("إجمالي المبلغ المدفوع للباقة الإضافية:", tableX + tableW - 16, currentY + 22);
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = "#047857";
  ctx.fillText(data.newEndDate ? `صالحة حتى: ${data.newEndDate}` : "تمت إضافة الرموز للحصة الحالية فوراً", tableX + tableW - 16, currentY + 40);

  ctx.textAlign = "left";
  ctx.fillStyle = "#059669";
  ctx.font = "bold 22px monospace";
  ctx.fillText(`${invCurr.code === "USD" ? "$" : ""}${data.price.toFixed(2)}`, tableX + 16, currentY + 34);
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(invCurr.code, tableX + 16, currentY + 47);

  if (data.notes) {
    currentY += 62;
    ctx.fillStyle = "#fffbeb";
    ctx.strokeStyle = "#fef3c7";
    drawRoundRect(ctx, tableX, currentY, tableW, 28, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#92400e";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(`ملاحظات: ${data.notes}`, tableX + tableW - 12, currentY + 18);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("نظام إدارة الحصص والذكاء الاصطناعي — Bot Manager Top-up System", width / 2, height - 12);

  return canvas.toDataURL("image/png");
}

function formatPriceValue(num: number): string {
  if (!num || isNaN(num) || num <= 0) return "0.00";
  if (num < 0.0001) return num.toFixed(6);
  if (num < 0.01) return num.toFixed(4);
  if (num % 1 === 0) return num.toFixed(2);
  const str = num.toFixed(4);
  return str.replace(/(\.\d\d[1-9]?)0+$/, "$1");
}

function formatTokenPrice(num: number): string {
  if (!num || isNaN(num) || num <= 0) return "0.00";
  const fixed = num.toFixed(9);
  const clean = fixed.replace(/(\.\d*?[1-9])0+$/, "$1");
  return clean;
}

const BASE_RATES_STORAGE_KEY = "ai_custom_model_rates_base_token";
const TOPUP_RATES_STORAGE_KEY = "ai_custom_model_rates_topup_token";

function getSavedCustomRates(scope: "base" | "topup" = "base", curr: CurrencyCode = "USD"): Record<string, number> {
  try {
    const baseKey = scope === "base" ? BASE_RATES_STORAGE_KEY : TOPUP_RATES_STORAGE_KEY;
    const key = `${baseKey}_${curr}`;
    let s = localStorage.getItem(key);
    if (!s && curr === "USD") {
      s = localStorage.getItem(baseKey);
    }
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

function saveCustomRate(modelId: string, rate: number | null, scope: "base" | "topup" = "base", curr: CurrencyCode = "USD") {
  try {
    const key = `${scope === "base" ? BASE_RATES_STORAGE_KEY : TOPUP_RATES_STORAGE_KEY}_${curr}`;
    const map = getSavedCustomRates(scope, curr);
    if (rate === null || isNaN(rate)) {
      delete map[modelId];
    } else {
      map[modelId] = rate;
    }
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 opacity-30 inline ml-1" />;
  return sortDir === "desc"
    ? <ChevronDown className="w-3 h-3 text-primary inline ml-1" />
    : <ChevronUp className="w-3 h-3 text-primary inline ml-1" />;
}

export default function AdminAiQuota() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tokens");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [activeRange, setActiveRange] = useState<RangePreset>("30d");
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toIso(d);
  });
  const [customTo, setCustomTo] = useState(() => toIso(new Date()));

  const [billTarget, setBillTarget] = useState<Company | null>(null);
  const [showAllBillsModal, setShowAllBillsModal] = useState(false);
  const [copiedBill, setCopiedBill] = useState(false);
  const billCardRef = useRef<HTMLDivElement>(null);
  const [isSharingBill, setIsSharingBill] = useState(false);
  const [shareEmailPromptOpen, setShareEmailPromptOpen] = useState(false);
  const [customShareEmail, setCustomShareEmail] = useState("");
  const [shareTargetCompany, setShareTargetCompany] = useState<Company | null>(null);

  const queryParams = useMemo(() => {
    if (showCustom && customFrom && customTo) {
      return `from=${customFrom}&to=${customTo}`;
    }
    return `range=${activeRange}`;
  }, [showCustom, customFrom, customTo, activeRange]);

  const queryKeyParam = showCustom ? `custom:${customFrom}:${customTo}` : activeRange;

  const rangeLabel: string = useMemo(() => {
    if (showCustom) {
      return `${customFrom} → ${customTo}`;
    }
    const opt = RANGE_OPTIONS.find((o) => o.key === activeRange);
    return (lang === "ar" ? opt?.labelAr : opt?.labelEn) || (lang === "ar" ? "الشهر الحالي" : "Current Month");
  }, [showCustom, customFrom, customTo, activeRange, lang]);

  const toggleSort = (col: SortKey) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  };

  const [quotaTarget, setQuotaTarget] = useState<Company | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>(() => {
    try {
      const s = localStorage.getItem("ai_quota_selected_currency");
      if (s === "USD" || s === "SAR" || s === "EGP") return s as CurrencyCode;
    } catch {}
    return "USD";
  });
  const [quotaInput, setQuotaInput] = useState("");
  const [quotaStartDate, setQuotaStartDate] = useState("");
  const [quotaEndDate, setQuotaEndDate] = useState("");
  const [quotaProviderInput, setQuotaProviderInput] = useState<AiProvider>("google");
  const [quotaModelInput, setQuotaModelInput] = useState<string>("default");
  const [quotaCustomModel, setQuotaCustomModel] = useState<string>("");
  const [quotaIsCustomModel, setQuotaIsCustomModel] = useState<boolean>(false);
  const [quotaPrice, setQuotaPrice] = useState<string>("0.00");
  const [quotaPricePerToken, setQuotaPricePerToken] = useState<string>("0.00000025");
  const [isCustomTokenRate, setIsCustomTokenRate] = useState<boolean>(false);
  const [showModelCostModal, setShowModelCostModal] = useState(false);

  // Top-up Package & Bill State
  const [quotaModalTab, setQuotaModalTab] = useState<"base" | "topup">("base");
  const [topupTokens, setTopupTokens] = useState<number>(50_000);
  const [topupPrice, setTopupPrice] = useState<string>("10.00");
  const [topupPricePerToken, setTopupPricePerToken] = useState<string>("0.00000025");
  const [isCustomTopupTokenRate, setIsCustomTopupTokenRate] = useState<boolean>(false);
  const [topupValidityChoice, setTopupValidityChoice] = useState<"keep" | "extend30" | "extend90" | "custom">("keep");
  const [topupCustomEndDate, setTopupCustomEndDate] = useState<string>("");
  const [topupNotes, setTopupNotes] = useState<string>("");
  const [topupInvoice, setTopupInvoice] = useState<TopupInvoiceData | null>(null);
  const [isSharingTopupBill, setIsSharingTopupBill] = useState(false);
  const [topupEmailOverride, setTopupEmailOverride] = useState("");
  const [topupCopied, setTopupCopied] = useState(false);

  const [isAssignNewOpen, setIsAssignNewOpen] = useState(false);
  const [newAssignCompanyId, setNewAssignCompanyId] = useState<string>("");
  const [newAssignQuota, setNewAssignQuota] = useState<string>("");
  const [newAssignStartDate, setNewAssignStartDate] = useState("");
  const [newAssignEndDate, setNewAssignEndDate] = useState("");

  // Fetch Companies
  const {
    data: companies = [],
    isLoading: companiesLoading,
    refetch: refetchCompanies,
    isFetching: isFetchingCompanies,
  } = useQuery<Company[]>({
    queryKey: ["admin-companies"],
    queryFn: () => customFetch("/api/admin/companies"),
    refetchInterval: 10_000,
  });

  // Fetch Usage
  const {
    data: usageData,
    isLoading: usageLoading,
    refetch: refetchUsage,
    isFetching: isFetchingUsage,
  } = useQuery<UsageCostData>({
    queryKey: ["admin-usage-cost", queryKeyParam],
    queryFn: () => customFetch(`/api/admin/usage-cost?${queryParams}`),
    refetchInterval: 10_000,
  });

  // Fetch Quota AI Settings
  const { data: quotaSettings } = useQuery<{ aiProvider: string; aiModel: string }>({
    queryKey: ["admin-quota-ai-settings"],
    queryFn: () => customFetch("/api/admin/quota-ai-settings"),
  });

  // Quota Mutation
  const setQuotaMutation = useMutation({
    mutationFn: ({
      companyId,
      quota,
      quotaStartDate,
      quotaEndDate,
      aiModel,
      aiProvider,
    }: {
      companyId: number;
      quota: number | null;
      quotaStartDate?: string | null;
      quotaEndDate?: string | null;
      aiModel?: string | null;
      aiProvider?: string | null;
    }) =>
      customFetch(`/api/admin/companies/${companyId}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyTokenQuota: quota,
          quotaStartDate,
          quotaEndDate,
          aiModel,
          aiProvider,
        }),
      }),
    onSuccess: (data: any, variables) => {
      queryClient.setQueryData<Company[]>(["admin-companies"], (old) => {
        if (!old) return old;
        return old.map((c) =>
          c.id === variables.companyId
            ? {
                ...c,
                monthlyTokenQuota: data.monthlyTokenQuota !== undefined ? data.monthlyTokenQuota : variables.quota,
                quotaStartDate: data.quotaStartDate !== undefined ? data.quotaStartDate : variables.quotaStartDate,
                quotaEndDate: data.quotaEndDate !== undefined ? data.quotaEndDate : variables.quotaEndDate,
                aiModel: data.aiModel !== undefined ? (data.aiModel ?? null) : (variables.aiModel ?? null),
                aiProvider: data.aiProvider !== undefined ? (data.aiProvider ?? null) : (variables.aiProvider ?? null),
              }
            : c
        );
      });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-usage-cost"] });
      toast({
        title: lang === "ar" ? "تم تحديث الحصة بنجاح" : "Quota updated successfully",
      });
      setQuotaTarget(null);
      setIsAssignNewOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "فشل تحديث الحصة" : "Failed to update quota",
        description: err?.message,
        variant: "destructive",
      });
    },
  });

  const openQuotaDialog = (company: Company, initialTab: "base" | "topup" = "base") => {
    setQuotaTarget(company);
    setQuotaModalTab(initialTab);
    setQuotaInput(company.monthlyTokenQuota ? String(company.monthlyTokenQuota) : "");
    setQuotaStartDate(company.quotaStartDate ? company.quotaStartDate.slice(0, 10) : "");
    setQuotaEndDate(company.quotaEndDate ? company.quotaEndDate.slice(0, 10) : "");
    setTopupTokens(50_000);
    setTopupPrice("10.00");
    setTopupValidityChoice("keep");
    setTopupCustomEndDate("");
    setTopupNotes("");
    setTopupEmailOverride(company.notificationEmail || "");

    const activeSupportAiProvider = (quotaSettings?.aiProvider && quotaSettings.aiProvider in AI_PROVIDERS)
      ? (quotaSettings.aiProvider as AiProvider)
      : "google";
    const companyProvider = company.aiProvider as AiProvider;
    const resolvedProvider = (companyProvider && companyProvider in AI_PROVIDERS)
      ? companyProvider
      : activeSupportAiProvider;

    setQuotaProviderInput(resolvedProvider);

    let initialModel = "default";
    if (company.aiModel) {
      initialModel = company.aiModel;
      setQuotaModelInput(company.aiModel);
      setQuotaIsCustomModel(false);
      setQuotaCustomModel("");
    } else {
      setQuotaModelInput("default");
      setQuotaIsCustomModel(false);
      setQuotaCustomModel("");
    }

    const effectiveForPricing = initialModel === "default"
      ? (quotaSettings?.aiModel || "gemini-2.5-flash")
      : initialModel;
    const { ratePerToken: baseRate, isCustom: baseCustom } = resolveModelRate(effectiveForPricing, "base", selectedCurrency);
    setQuotaPricePerToken(formatTokenPrice(baseRate));
    setIsCustomTokenRate(baseCustom);

    const initialTokens = company.monthlyTokenQuota ? Number(company.monthlyTokenQuota) : 0;
    if (initialTokens > 0 && baseRate > 0) {
      setQuotaPrice(formatPriceValue(initialTokens * baseRate));
    } else {
      setQuotaPrice("0.00");
    }

    const { ratePerToken: topupRate, isCustom: topupCustom } = resolveModelRate(effectiveForPricing, "topup", selectedCurrency);
    setTopupPricePerToken(formatTokenPrice(topupRate));
    setIsCustomTopupTokenRate(topupCustom);

    const initialTopupTokens = 50_000;
    setTopupTokens(initialTopupTokens);
    if (topupRate > 0) {
      setTopupPrice(formatPriceValue(initialTopupTokens * topupRate));
    } else {
      setTopupPrice(formatPriceValue(10.0 * (CURRENCIES[selectedCurrency]?.exchangeRate || 1.0)));
    }
  };

  const getEffectiveModelId = () => {
    return quotaModelInput === "default"
      ? (quotaSettings?.aiModel || "gemini-2.5-flash")
      : quotaIsCustomModel
      ? quotaCustomModel.trim() || (quotaSettings?.aiModel || "gemini-2.5-flash")
      : quotaModelInput;
  };

  const resolveModelRate = (
    modelId: string,
    scope: "base" | "topup" = "base",
    curr: CurrencyCode = selectedCurrency
  ): { ratePerToken: number; isCustom: boolean } => {
    const savedRates = getSavedCustomRates(scope, curr);
    if (typeof savedRates[modelId] === "number" && !isNaN(savedRates[modelId])) {
      return { ratePerToken: savedRates[modelId], isCustom: true };
    }
    const pr = getModelPricingDetails(modelId);
    const exRate = CURRENCIES[curr]?.exchangeRate || 1.0;
    const stdRate = pr.isFree ? 0 : pr.pricePerToken * exRate;
    return { ratePerToken: stdRate, isCustom: false };
  };

  const handleCurrencyChange = (newCurr: CurrencyCode) => {
    setSelectedCurrency(newCurr);
    try {
      localStorage.setItem("ai_quota_selected_currency", newCurr);
    } catch {}

    const modelId = getEffectiveModelId();

    // Recalculate Base Quota pricing with new currency
    const { ratePerToken: newBaseRate, isCustom: newBaseCustom } = resolveModelRate(modelId, "base", newCurr);
    setQuotaPricePerToken(formatTokenPrice(newBaseRate));
    setIsCustomTokenRate(newBaseCustom);
    const baseTokens = Number(quotaInput.replace(/[^0-9]/g, "")) || 0;
    setQuotaPrice(syncPriceFromTokens(baseTokens, newBaseRate));

    // Recalculate Topup pricing with new currency
    const { ratePerToken: newTopupRate, isCustom: newTopupCustom } = resolveModelRate(modelId, "topup", newCurr);
    setTopupPricePerToken(formatTokenPrice(newTopupRate));
    setIsCustomTopupTokenRate(newTopupCustom);
    if (topupTokens > 0 && newTopupRate > 0) {
      setTopupPrice(formatPriceValue(topupTokens * newTopupRate));
    }
  };

  const syncPriceFromTokens = (tokensNum: number, tokenRate: number) => {
    if (tokensNum > 0 && tokenRate > 0) {
      return formatPriceValue(tokensNum * tokenRate);
    }
    return "0.00";
  };

  const handleTokensChange = (val: string) => {
    const cleanTokens = val.replace(/[^0-9]/g, "");
    setQuotaInput(cleanTokens);
    const tokens = Number(cleanTokens) || 0;
    const rate = Number(quotaPricePerToken) || 0;
    setQuotaPrice(syncPriceFromTokens(tokens, rate));
  };

  const handlePresetClick = (tokens: number) => {
    setQuotaInput(String(tokens));
    const rate = Number(quotaPricePerToken) || 0;
    setQuotaPrice(syncPriceFromTokens(tokens, rate));
  };

  const handleClearQuota = () => {
    setQuotaInput("");
    setQuotaPrice("0.00");
  };

  const handlePriceChange = (val: string) => {
    const cleanPrice = val.replace(/[^0-9.]/g, "");
    setQuotaPrice(cleanPrice);
    const priceNum = Number(cleanPrice) || 0;
    const rate = Number(quotaPricePerToken) || 0;
    if (priceNum > 0 && rate > 0) {
      const calculatedTokens = Math.round(priceNum / rate);
      setQuotaInput(String(calculatedTokens));
    } else if (cleanPrice === "") {
      setQuotaInput("");
    }
  };

  const handleTokenRateChange = (newRateStr: string) => {
    const clean = newRateStr.replace(/[^0-9.]/g, "");
    setQuotaPricePerToken(clean);
    setIsCustomTokenRate(true);
    const rate = Number(clean) || 0;
    const modelId = getEffectiveModelId();
    saveCustomRate(modelId, rate, "base", selectedCurrency);
    const tokens = Number(quotaInput.replace(/[^0-9]/g, "")) || 0;
    setQuotaPrice(syncPriceFromTokens(tokens, rate));
  };

  const resetTokenRateToStandard = () => {
    const modelId = getEffectiveModelId();
    const pr = getModelPricingDetails(modelId);
    const exRate = CURRENCIES[selectedCurrency]?.exchangeRate || 1.0;
    const stdRate = pr.isFree ? 0 : pr.pricePerToken * exRate;
    setQuotaPricePerToken(formatTokenPrice(stdRate));
    setIsCustomTokenRate(false);
    saveCustomRate(modelId, null, "base", selectedCurrency);
    const tokens = Number(quotaInput.replace(/[^0-9]/g, "")) || 0;
    setQuotaPrice(syncPriceFromTokens(tokens, stdRate));
  };

  const handleTopupTokenRateChange = (newRateStr: string) => {
    const clean = newRateStr.replace(/[^0-9.]/g, "");
    setTopupPricePerToken(clean);
    setIsCustomTopupTokenRate(true);
    const rate = Number(clean) || 0;
    const modelId = getEffectiveModelId();
    saveCustomRate(modelId, rate, "topup", selectedCurrency);
    if (topupTokens > 0 && rate > 0) {
      setTopupPrice(formatPriceValue(topupTokens * rate));
    }
  };

  const resetTopupTokenRateToStandard = () => {
    const modelId = getEffectiveModelId();
    const pr = getModelPricingDetails(modelId);
    const exRate = CURRENCIES[selectedCurrency]?.exchangeRate || 1.0;
    const stdRate = pr.isFree ? 0 : pr.pricePerToken * exRate;
    setTopupPricePerToken(formatTokenPrice(stdRate));
    setIsCustomTopupTokenRate(false);
    saveCustomRate(modelId, null, "topup", selectedCurrency);
    if (topupTokens > 0 && stdRate > 0) {
      setTopupPrice(formatPriceValue(topupTokens * stdRate));
    }
  };

  const syncModelChangePricing = (targetModelId: string) => {
    const { ratePerToken: baseRate, isCustom: baseCustom } = resolveModelRate(targetModelId, "base", selectedCurrency);
    setQuotaPricePerToken(formatTokenPrice(baseRate));
    setIsCustomTokenRate(baseCustom);
    const tokens = Number(quotaInput.replace(/[^0-9]/g, "")) || 0;
    setQuotaPrice(syncPriceFromTokens(tokens, baseRate));

    if (!isCustomTopupTokenRate) {
      const { ratePerToken: topupRate, isCustom: topupCustom } = resolveModelRate(targetModelId, "topup", selectedCurrency);
      setTopupPricePerToken(formatTokenPrice(topupRate));
      setIsCustomTopupTokenRate(topupCustom);
      if (topupTokens > 0 && topupRate > 0) {
        setTopupPrice(formatPriceValue(topupTokens * topupRate));
      }
    }
  };

  const handleSaveQuota = () => {
    if (!quotaTarget) return;
    const val = quotaInput.trim();
    const quota = val === "" ? null : Number(val.replace(/,/g, ""));
    if (quota !== null && (isNaN(quota) || quota < 0)) {
      toast({
        title: lang === "ar" ? "قيمة غير صالحة" : "Invalid value",
        description: lang === "ar" ? "يرجى إدخال رقم صحيح أو تركه فارغاً" : "Please enter a valid number or leave empty for unlimited",
        variant: "destructive",
      });
      return;
    }
    if (quotaStartDate && quotaEndDate && quotaEndDate < quotaStartDate) {
      toast({
        title: lang === "ar" ? "تواريخ غير صالحة" : "Invalid dates",
        description: lang === "ar" ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" : "End date must be after start date",
        variant: "destructive",
      });
      return;
    }
    const safeStart = quotaStartDate ? (() => {
      const d = new Date(quotaStartDate.length === 10 ? `${quotaStartDate}T00:00:00.000Z` : quotaStartDate);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })() : null;
    const safeEnd = quotaEndDate ? (() => {
      const d = new Date(quotaEndDate.length === 10 ? `${quotaEndDate}T23:59:59.999Z` : quotaEndDate);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })() : null;

    const finalModel = quotaModelInput === "default"
      ? null
      : quotaIsCustomModel
      ? quotaCustomModel.trim() || null
      : quotaModelInput;

    setQuotaMutation.mutate({
      companyId: quotaTarget.id,
      quota,
      quotaStartDate: safeStart,
      quotaEndDate: safeEnd,
      aiModel: finalModel,
      aiProvider: quotaProviderInput,
    });
  };

  const handleExecuteTopup = async () => {
    if (!quotaTarget) return;
    if (!topupTokens || topupTokens <= 0) {
      toast({
        title: lang === "ar" ? "قيمة غير صالحة" : "Invalid value",
        description: lang === "ar" ? "يرجى تحديد عدد الرموز المراد شحنها" : "Please select or enter tokens to top up",
        variant: "destructive",
      });
      return;
    }

    const currentQuota = quotaTarget.monthlyTokenQuota || 0;
    const newQuota = currentQuota + topupTokens;

    const today = new Date();
    let newEndDateStr = quotaTarget.quotaEndDate ? quotaTarget.quotaEndDate.slice(0, 10) : "";
    const currentEnd = quotaTarget.quotaEndDate ? new Date(quotaTarget.quotaEndDate) : null;
    const baseForExt = currentEnd && currentEnd.getTime() > today.getTime() ? currentEnd : today;

    if (topupValidityChoice === "extend30") {
      const e = new Date(baseForExt);
      e.setDate(e.getDate() + 30);
      newEndDateStr = toIso(e);
    } else if (topupValidityChoice === "extend90") {
      const e = new Date(baseForExt);
      e.setDate(e.getDate() + 90);
      newEndDateStr = toIso(e);
    } else if (topupValidityChoice === "custom") {
      if (!topupCustomEndDate) {
        toast({
          title: lang === "ar" ? "تاريخ غير محدد" : "Date required",
          description: lang === "ar" ? "يرجى تحديد تاريخ الانتهاء المخصص" : "Please specify a custom end date",
          variant: "destructive",
        });
        return;
      }
      newEndDateStr = topupCustomEndDate;
    }

    const startDateStr = quotaTarget.quotaStartDate ? quotaTarget.quotaStartDate.slice(0, 10) : toIso(today);
    const safeStart = startDateStr ? new Date(`${startDateStr}T00:00:00.000Z`).toISOString() : null;
    const safeEnd = newEndDateStr ? new Date(`${newEndDateStr}T23:59:59.999Z`).toISOString() : null;

    try {
      await setQuotaMutation.mutateAsync({
        companyId: quotaTarget.id,
        quota: newQuota,
        quotaStartDate: safeStart,
        quotaEndDate: safeEnd,
      });

      const invoiceNum = `INV-TOPUP-${quotaTarget.id}-${Date.now().toString().slice(-6)}`;
      const invoiceData: TopupInvoiceData = {
        invoiceNumber: invoiceNum,
        companyId: quotaTarget.id,
        companyName: quotaTarget.name,
        clientName: quotaTarget.clientName || quotaTarget.clientUsername || "—",
        recipientEmail: quotaTarget.notificationEmail || "",
        previousQuota: currentQuota,
        addedTokens: topupTokens,
        newTotalQuota: newQuota,
        price: Number(topupPrice) || 0,
        currency: selectedCurrency,
        date: new Date().toISOString(),
        previousEndDate: quotaTarget.quotaEndDate ? quotaTarget.quotaEndDate.slice(0, 10) : null,
        newEndDate: newEndDateStr || null,
        notes: topupNotes.trim() || undefined,
      };

      setTopupInvoice(invoiceData);
      setTopupEmailOverride(quotaTarget.notificationEmail || "");
    } catch {
      // Mutation handles error toast
    }
  };

  const handleShareTopupBill = async () => {
    if (!topupInvoice) return;
    setIsSharingTopupBill(true);
    try {
      let imageDataUrl: string | undefined;
      try {
        imageDataUrl = generateTopupInvoiceCanvas(topupInvoice);
      } catch (e) {
        console.warn("Could not generate topup invoice canvas", e);
      }

      const res = await customFetch<{ ok: boolean; recipient: string; message: string }>(
        `/api/admin/companies/${topupInvoice.companyId}/send-bill-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmail: topupEmailOverride?.trim() || undefined,
            saveAsNotificationEmail: Boolean(topupEmailOverride),
            imageDataUrl,
            billData: {
              isTopup: true,
              invoiceNumber: topupInvoice.invoiceNumber,
              companyName: topupInvoice.companyName,
              clientName: topupInvoice.clientName,
              addedTokens: topupInvoice.addedTokens,
              previousQuota: topupInvoice.previousQuota,
              newTotalQuota: topupInvoice.newTotalQuota,
              newEndDate: topupInvoice.newEndDate,
              price: topupInvoice.price,
              notes: topupInvoice.notes,
            },
          }),
        }
      );

      toast({
        title: lang === "ar" ? "تم إرسال فاتورة الشحن بنجاح" : "Top-up bill sent successfully",
        description: lang === "ar"
          ? `تم إرسال الفاتورة إلى: ${res.recipient || topupInvoice.recipientEmail}`
          : `Invoice sent to: ${res.recipient || topupInvoice.recipientEmail}`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "فشل إرسال فاتورة الشحن" : "Failed to send top-up bill",
        description: err?.message || (lang === "ar" ? "حدث خطأ أثناء الإرسال" : "An error occurred while sending"),
        variant: "destructive",
      });
    } finally {
      setIsSharingTopupBill(false);
    }
  };

  const handleCopyTopupSummary = () => {
    if (!topupInvoice) return;
    const summary = [
      `⚡ ${lang === "ar" ? "فاتورة شحن باقة إضافية" : "AI Quota Top-up Invoice"}`,
      `-----------------------------------------`,
      `${lang === "ar" ? "رقم الفاتورة" : "Invoice #"}: ${topupInvoice.invoiceNumber}`,
      `${lang === "ar" ? "التاريخ" : "Date"}: ${new Date(topupInvoice.date).toLocaleDateString()}`,
      `${lang === "ar" ? "الشركة" : "Company"}: ${topupInvoice.companyName}`,
      `${lang === "ar" ? "العميل" : "Client"}: ${topupInvoice.clientName}`,
      `-----------------------------------------`,
      `⚡ ${lang === "ar" ? "الباقة المضافة" : "Added Top-up"}: +${topupInvoice.addedTokens.toLocaleString()} tokens`,
      `${lang === "ar" ? "الحصة السابقة" : "Previous Quota"}: ${topupInvoice.previousQuota.toLocaleString()} tokens`,
      `${lang === "ar" ? "الحصة الإجمالية الجديدة" : "New Total Quota"}: ${topupInvoice.newTotalQuota.toLocaleString()} tokens`,
      topupInvoice.newEndDate ? `${lang === "ar" ? "تاريخ انتهاء الصلاحية" : "Valid Until"}: ${topupInvoice.newEndDate}` : "",
      `-----------------------------------------`,
      `${lang === "ar" ? "المبلغ الإجمالي" : "Total Paid"}: ${topupInvoice.currency === "USD" ? "$" : ""}${topupInvoice.price.toFixed(2)} ${topupInvoice.currency}`,
      topupInvoice.notes ? `${lang === "ar" ? "ملاحظات" : "Notes"}: ${topupInvoice.notes}` : "",
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(summary);
    setTopupCopied(true);
    setTimeout(() => setTopupCopied(false), 2000);
    toast({
      title: lang === "ar" ? "تم نسخ تفاصيل فاتورة الشحن" : "Top-up invoice details copied",
    });
  };

  const handleDownloadTopupImage = () => {
    if (!topupInvoice) return;
    try {
      const dataUrl = generateTopupInvoiceCanvas(topupInvoice);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `Topup-Invoice-${topupInvoice.invoiceNumber}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({
        title: lang === "ar" ? "تم تحميل صورة الفاتورة" : "Invoice image downloaded",
      });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "فشل التحميل" : "Download failed",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  const handleAssignNewQuota = () => {
    if (!newAssignCompanyId) return;
    const val = newAssignQuota.trim();
    const quota = val === "" ? null : Number(val.replace(/,/g, ""));
    if (quota === null || isNaN(quota) || quota <= 0) {
      toast({
        title: lang === "ar" ? "قيمة غير صالحة" : "Invalid value",
        description: lang === "ar" ? "يرجى إدخال حصة أكبر من صفر" : "Please enter a quota greater than 0",
        variant: "destructive",
      });
      return;
    }
    if (newAssignStartDate && newAssignEndDate && newAssignEndDate < newAssignStartDate) {
      toast({
        title: lang === "ar" ? "تواريخ غير صالحة" : "Invalid dates",
        description: lang === "ar" ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" : "End date must be after start date",
        variant: "destructive",
      });
      return;
    }
    const safeStart = newAssignStartDate ? (() => {
      const d = new Date(newAssignStartDate.length === 10 ? `${newAssignStartDate}T00:00:00.000Z` : newAssignStartDate);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })() : null;
    const safeEnd = newAssignEndDate ? (() => {
      const d = new Date(newAssignEndDate.length === 10 ? `${newAssignEndDate}T23:59:59.999Z` : newAssignEndDate);
      return isNaN(d.getTime()) ? null : d.toISOString();
    })() : null;

    setQuotaMutation.mutate({
      companyId: Number(newAssignCompanyId),
      quota,
      quotaStartDate: safeStart,
      quotaEndDate: safeEnd,
    });
  };

  // Build Company Stats Map
  const companyUsageMap = useMemo(() => {
    const map = new Map<number, { tokens: number; messages: number; cost: number; inputTokens: number; outputTokens: number; model?: string; provider?: string }>();
    if (usageData?.byCompany) {
      for (const c of usageData.byCompany) {
        map.set(c.companyId, {
          tokens: c.inputTokens + c.outputTokens,
          messages: c.messages,
          cost: c.costUsd,
          inputTokens: c.inputTokens,
          outputTokens: c.outputTokens,
          model: c.model,
          provider: c.provider,
        });
      }
    }
    return map;
  }, [usageData]);

  const companiesWithQuota = useMemo(() => {
    return companies.filter(
      (c) => c.monthlyTokenQuota != null && Number(c.monthlyTokenQuota) > 0
    );
  }, [companies]);

  const companiesWithoutQuota = useMemo(() => {
    return companies.filter(
      (c) => c.monthlyTokenQuota == null || Number(c.monthlyTokenQuota) <= 0
    );
  }, [companies]);

  // Filtering and Sorting (strictly companies with quota)
  const filteredAndSortedCompanies = useMemo(() => {
    let result = companiesWithQuota.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.clientName && c.clientName.toLowerCase().includes(search.toLowerCase())) ||
      (c.clientUsername && c.clientUsername.toLowerCase().includes(search.toLowerCase()))
    );

    result.sort((a, b) => {
      const aUsage = companyUsageMap.get(a.id);
      const bUsage = companyUsageMap.get(b.id);
      const aQuota = a.monthlyTokenQuota ?? 0;
      const bQuota = b.monthlyTokenQuota ?? 0;
      const aPercent = aQuota > 0 ? (aUsage?.tokens ?? 0) / aQuota : 0;
      const bPercent = bQuota > 0 ? (bUsage?.tokens ?? 0) / bQuota : 0;

      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "messages":
          cmp = (aUsage?.messages ?? 0) - (bUsage?.messages ?? 0);
          break;
        case "inputTokens":
          cmp = (aUsage?.inputTokens ?? 0) - (bUsage?.inputTokens ?? 0);
          break;
        case "outputTokens":
          cmp = (aUsage?.outputTokens ?? 0) - (bUsage?.outputTokens ?? 0);
          break;
        case "quota":
          cmp = aQuota - bQuota;
          break;
        case "tokens":
          cmp = (aUsage?.tokens ?? 0) - (bUsage?.tokens ?? 0);
          break;
        case "cost":
          cmp = (aUsage?.cost ?? 0) - (bUsage?.cost ?? 0);
          break;
        case "percent":
          cmp = aPercent - bPercent;
          break;
        case "startDate": {
          const aTime = a.quotaStartDate ? new Date(a.quotaStartDate).getTime() : 0;
          const bTime = b.quotaStartDate ? new Date(b.quotaStartDate).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
        case "endDate": {
          const aTime = a.quotaEndDate ? new Date(a.quotaEndDate).getTime() : 0;
          const bTime = b.quotaEndDate ? new Date(b.quotaEndDate).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
        default:
          cmp = 0;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [companiesWithQuota, search, sortKey, sortDir, companyUsageMap]);

  // Model cost breakdown filtered to companies with quota only
  const modelCostBreakdown = useMemo(() => {
    const quotaCompanyIds = new Set(companiesWithQuota.map((c) => c.id));
    const map = new Map<string, { provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }>();
    if (usageData?.byCompany) {
      for (const c of usageData.byCompany) {
        if (!quotaCompanyIds.has(c.companyId)) continue;
        const key = c.model || "unknown";
        const existing = map.get(key) || { provider: c.provider || "unknown", model: key, inputTokens: 0, outputTokens: 0, costUsd: 0 };
        existing.inputTokens += c.inputTokens;
        existing.outputTokens += c.outputTokens;
        existing.costUsd += c.costUsd;
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).map(m => ({
      ...m,
      costUsd: Math.round(m.costUsd * 10000) / 10000
    }));
  }, [companiesWithQuota, usageData]);

  const topCompaniesData = useMemo(() => {
    // Only include companies that have an assigned quota (> 0)
    const sorted = [...companiesWithQuota].sort((a, b) => {
      const aUsage = companyUsageMap.get(a.id)?.tokens ?? 0;
      const bUsage = companyUsageMap.get(b.id)?.tokens ?? 0;
      return bUsage - aUsage;
    });
    return sorted.slice(0, 10).map(c => ({
      name: c.name,
      tokens: companyUsageMap.get(c.id)?.tokens ?? 0,
      cost: companyUsageMap.get(c.id)?.cost ?? 0
    })).filter(c => c.tokens > 0);
  }, [companiesWithQuota, companyUsageMap]);

  const exportToCSV = () => {
    if (!filteredAndSortedCompanies.length) return;
    
    const headers = [
      "Company",
      "Client Name",
      "AI Model",
      "Messages",
      "Input Tokens",
      "Output Tokens",
      "Assigned Quota",
      "Quota Start Date",
      "Quota End Date",
      "Total Tokens Used",
      "Usage %",
      `Cost (${CURRENCIES[selectedCurrency].code})`
    ];
    
    const rows = filteredAndSortedCompanies.map(c => {
      const hasQuota = c.monthlyTokenQuota != null && Number(c.monthlyTokenQuota) > 0;
      const usage = companyUsageMap.get(c.id);
      const tokensUsed = hasQuota ? (usage?.tokens ?? 0) : 0;
      const percent = hasQuota && c.monthlyTokenQuota ? (tokensUsed / c.monthlyTokenQuota) * 100 : 0;
      const cost = hasQuota ? (usage?.cost ?? 0) : 0;

      const effectiveModel = c.aiModel || (hasQuota
        ? (quotaSettings?.aiModel || usage?.model || "gpt-4o-mini")
        : "—");

      return [
        `"${c.name.replace(/"/g, '""')}"`,
        `"${c.clientName ? c.clientName.replace(/"/g, '""') : ''}"`,
        `"${effectiveModel}"`,
        hasQuota ? (usage?.messages ?? 0) : 0,
        hasQuota ? (usage?.inputTokens ?? 0) : 0,
        hasQuota ? (usage?.outputTokens ?? 0) : 0,
        c.monthlyTokenQuota ?? "Unlimited",
        c.quotaStartDate ? c.quotaStartDate.slice(0, 10) : "—",
        c.quotaEndDate ? c.quotaEndDate.slice(0, 10) : "—",
        tokensUsed,
        hasQuota ? `${percent.toFixed(2)}%` : "N/A",
        (cost * CURRENCIES[selectedCurrency].exchangeRate).toFixed(4)
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" }); // Add BOM for Excel Arabic support
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `Quota_Export_${showCustom ? `${customFrom}_to_${customTo}` : activeRange}_${toIso(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const handleExportCsv = exportToCSV;

  const handleCopyBill = (c: Company) => {
    const usage = companyUsageMap.get(c.id);
    const tokens = usage?.tokens ?? 0;
    const cost = usage?.cost ?? 0;
    const quota = c.monthlyTokenQuota ?? 0;
    const effectiveModel = c.aiModel || (c.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : null) || "gpt-4o-mini";
    const invoiceNumber = `INV-Q-${c.id}-${toIso(new Date()).replace(/-/g, "")}`;

    const text = [
      `=== ${lang === "ar" ? "فاتورة استهلاك الحصة" : "Quota Usage Invoice"} ===`,
      `${lang === "ar" ? "رقم الفاتورة" : "Invoice #"}: ${invoiceNumber}`,
      `${lang === "ar" ? "الفترة الزمنية" : "Period"}: ${rangeLabel}`,
      `${lang === "ar" ? "الشركة" : "Company"}: ${c.name}`,
      `${lang === "ar" ? "العميل" : "Client"}: ${c.clientName || c.clientUsername || "—"}`,
      `${lang === "ar" ? "النموذج النشط" : "Active AI Model"}: ${effectiveModel}`,
      `${lang === "ar" ? "الحصة المخصصة" : "Allocated Quota"}: ${formatQuota(quota)} tokens`,
      (c.quotaStartDate || c.quotaEndDate)
        ? `${lang === "ar" ? "فترة صلاحية الحصة" : "Quota Validity"}: ${c.quotaStartDate ? c.quotaStartDate.slice(0, 10) : "—"} → ${c.quotaEndDate ? c.quotaEndDate.slice(0, 10) : "—"}`
        : null,
      `-----------------------------------------`,
      `${lang === "ar" ? "إجمالي الرسائل" : "Total Messages"}: ${(usage?.messages ?? 0).toLocaleString()}`,
      `${lang === "ar" ? "رموز المدخلات" : "Input Tokens"}: ${(usage?.inputTokens ?? 0).toLocaleString()}`,
      `${lang === "ar" ? "رموز المخرجات" : "Output Tokens"}: ${(usage?.outputTokens ?? 0).toLocaleString()}`,
      `${lang === "ar" ? "إجمالي الرموز المستهلكة" : "Total Consumed Tokens"}: ${tokens.toLocaleString()}`,
      `${lang === "ar" ? "نسبة استهلاك الحصة" : "Quota Usage %"}: ${quota > 0 ? ((tokens / quota) * 100).toFixed(2) : 0}%`,
      `${lang === "ar" ? "الرموز المتبقية" : "Remaining Quota"}: ${quota > 0 ? Math.max(0, quota - tokens).toLocaleString() : "Unlimited"}`,
      `-----------------------------------------`,
      `${lang === "ar" ? "إجمالي التكلفة التقديرية" : "Total Estimated Cost"}: ${formatCost(cost, selectedCurrency)}`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(text);
    setCopiedBill(true);
    setTimeout(() => setCopiedBill(false), 2000);
    toast({
      title: lang === "ar" ? "تم نسخ تفاصيل الفاتورة بنجاح" : "Invoice details copied successfully",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const executeShare = async (company: Company, overrideEmail?: string) => {
    setIsSharingBill(true);
    try {
      const usage = companyUsageMap.get(company.id);
      const quota = company.monthlyTokenQuota ?? 0;
      const totalTokens = usage?.tokens ?? 0;
      const cost = usage?.cost ?? 0;
      const percent = quota > 0 ? (totalTokens / quota) * 100 : 0;
      const remaining = quota > 0 ? Math.max(0, quota - totalTokens) : null;
      const invoiceNumber = `INV-Q-${company.id}-${toIso(new Date()).replace(/-/g, "")}`;
      const effectiveModel = company.aiModel || (company.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : null) || "gpt-4o-mini";
      const effectiveProvider = (company.aiModel ? company.aiProvider : null) || (company.monthlyTokenQuota ? (quotaSettings?.aiProvider || usage?.provider) : company.aiProvider) || "openai";

      let imageDataUrl: string | undefined;
      try {
        imageDataUrl = generateBillInvoiceCanvas({
          companyName: company.name,
          clientName: company.clientName || company.clientUsername || "—",
          invoiceNumber,
          rangeLabel,
          effectiveModel,
          effectiveProvider,
          quotaFormatted: formatQuota(quota),
          validityPeriod:
            company.quotaStartDate || company.quotaEndDate
              ? `${company.quotaStartDate ? new Date(company.quotaStartDate).toLocaleDateString() : "—"} → ${company.quotaEndDate ? new Date(company.quotaEndDate).toLocaleDateString() : "—"}`
              : undefined,
          messages: usage?.messages ?? 0,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens,
          percent,
          remaining,
          cost,
          isExceeded: quota > 0 && totalTokens > quota,
          currency: selectedCurrency,
        });
      } catch (canvasErr) {
        console.warn("Could not generate bill canvas image:", canvasErr);
      }

      const res = await customFetch<{ ok: boolean; recipient: string; message: string }>(
        `/api/admin/companies/${company.id}/send-bill-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmail: overrideEmail?.trim() || undefined,
            saveAsNotificationEmail: !!overrideEmail,
            imageDataUrl,
            billData: {
              invoiceNumber,
              rangeLabel,
              companyName: company.name,
              clientName: company.clientName || company.clientUsername || "—",
              effectiveModel,
              effectiveProvider,
              quota,
              messages: usage?.messages ?? 0,
              inputTokens: usage?.inputTokens ?? 0,
              outputTokens: usage?.outputTokens ?? 0,
              totalTokens,
              cost,
              percent,
              remaining,
            },
          }),
        }
      );

      toast({
        title: lang === "ar" ? "تمت مشاركة الفاتورة بنجاح" : "Bill shared successfully",
        description: lang === "ar"
          ? `تم إرسال صورة وبيانات الفاتورة إلى: ${res.recipient || company.notificationEmail}`
          : `Invoice image and details sent to: ${res.recipient || company.notificationEmail}`,
      });
      setShareEmailPromptOpen(false);
      if (overrideEmail) {
        queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      }
    } catch (err: any) {
      const errMsg = String(err?.message || "");
      const is404 = err?.status === 404 || errMsg.includes("404") || errMsg.includes("Cannot POST");
      toast({
        title: lang === "ar" ? "فشل مشاركة الفاتورة" : "Failed to share bill",
        description: is404
          ? (lang === "ar"
              ? "الخادم على Replit يحتاج لإعادة تشغيل (Restart) لتفعيل مسار إرسال الفاتورة الجديد. يرجى الضغط على زر Restart أو Stop ثم Run في Replit."
              : "The backend server needs a restart to activate the send-bill-email route. Please click Restart in Replit.")
          : (err?.message || (lang === "ar" ? "حدث خطأ أثناء إرسال البريد" : "An error occurred while sending the email")),
        variant: "destructive",
      });
    } finally {
      setIsSharingBill(false);
    }
  };

  const handleDownloadInvoiceImage = (company: Company) => {
    try {
      const usage = companyUsageMap.get(company.id);
      const quota = company.monthlyTokenQuota ?? 0;
      const totalTokens = usage?.tokens ?? 0;
      const cost = usage?.cost ?? 0;
      const percent = quota > 0 ? (totalTokens / quota) * 100 : 0;
      const remaining = quota > 0 ? Math.max(0, quota - totalTokens) : null;
      const invoiceNumber = `INV-Q-${company.id}-${toIso(new Date()).replace(/-/g, "")}`;
      const effectiveModel = company.aiModel || (company.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : null) || "gpt-4o-mini";
      const effectiveProvider = (company.aiModel ? company.aiProvider : null) || (company.monthlyTokenQuota ? (quotaSettings?.aiProvider || usage?.provider) : company.aiProvider) || "openai";

      const dataUrl = generateBillInvoiceCanvas({
        companyName: company.name,
        clientName: company.clientName || company.clientUsername || "—",
        invoiceNumber,
        rangeLabel,
        effectiveModel,
        effectiveProvider,
        quotaFormatted: formatQuota(quota),
        validityPeriod:
          company.quotaStartDate || company.quotaEndDate
            ? `${company.quotaStartDate ? new Date(company.quotaStartDate).toLocaleDateString() : "—"} → ${company.quotaEndDate ? new Date(company.quotaEndDate).toLocaleDateString() : "—"}`
            : undefined,
        messages: usage?.messages ?? 0,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens,
        percent,
        remaining,
        cost,
        isExceeded: quota > 0 && totalTokens > quota,
        currency: selectedCurrency,
      });

      if (!dataUrl) {
        throw new Error("Failed to generate invoice image");
      }

      const link = document.createElement("a");
      link.download = `Invoice_${company.name.replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, "_")}_${invoiceNumber}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: lang === "ar" ? "تم تحميل صورة الفاتورة بنجاح" : "Invoice image downloaded successfully",
      });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "فشل تحميل صورة الفاتورة" : "Failed to download invoice image",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  const handleShareBill = (company: Company) => {
    if (company.notificationEmail && company.notificationEmail.trim()) {
      executeShare(company);
    } else {
      setShareTargetCompany(company);
      setCustomShareEmail("");
      setShareEmailPromptOpen(true);
    }
  };

  const handleClearCompanyQuota = (company: Company) => {
    const confirmMsg = lang === "ar"
      ? `هل أنت متأكد من إلغاء حصة الرموز لشركة "${company.name}" وجعلها غير محددة؟`
      : `Are you sure you want to clear the token quota for "${company.name}" and make it unlimited?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setQuotaMutation.mutate({
      companyId: company.id,
      quota: null,
      quotaStartDate: null,
      quotaEndDate: null,
      aiModel: company.aiModel,
      aiProvider: company.aiProvider,
    });
  };

  const totalAllocatedQuota = useMemo(() => {
    return companies.reduce((sum, c) => sum + (c.monthlyTokenQuota ?? 0), 0);
  }, [companies]);

  const { totalTokensConsumedMonth, totalCostConsumedMonth } = useMemo(() => {
    let tokens = 0;
    let cost = 0;
    for (const c of companies) {
      if (c.monthlyTokenQuota && c.monthlyTokenQuota > 0) {
        const usage = companyUsageMap.get(c.id);
        if (usage) {
          tokens += usage.tokens;
          cost += usage.cost;
        }
      }
    }
    return { totalTokensConsumedMonth: tokens, totalCostConsumedMonth: cost };
  }, [companies, companyUsageMap]);

  const currentActiveModelId = quotaModelInput === "default"
    ? (quotaSettings?.aiModel || "gemini-2.5-flash")
    : quotaIsCustomModel
    ? quotaCustomModel.trim() || (quotaSettings?.aiModel || "gemini-2.5-flash")
    : quotaModelInput;

  const currentModelPricing = getModelPricingDetails(currentActiveModelId);

  const quotaTokensCount = Number(quotaInput.replace(/[^0-9]/g, "")) || 0;
  const activeRatePerToken = Number(quotaPricePerToken) || 0;
  const quotaCalculatedCost = quotaTokensCount * activeRatePerToken;

  return (
    <div className="space-y-8">
      {/* ── Hero Operations Banner matching Bot Manager Login aesthetic ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-microchip text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {lang === "ar" ? "مركز إدارة الذكاء الاصطناعي والحصص" : "AI Quota & Telemetry"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "الذكاء الاصطناعي وإدارة الحصص (AI / Quota)" : "AI / Quota Management"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "تكوين نموذج الدعم الفني بالذكاء الاصطناعي، ومراقبة وتحديد حصص الرموز (Token Quotas) لشركات العملاء."
                  : "Configure the Support AI Agent model, and monitor & assign monthly token quotas to companies."}
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
                  {lang === "ar" ? opt.labelAr : opt.labelEn}
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
                <span>{lang === "ar" ? "مخصص" : "Custom"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {showCustom && (
              <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md border border-white/20 rounded-xl px-3 py-1.5 shadow-sm text-xs text-white">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-white outline-none text-xs"
                />
                <span className="text-white/60">→</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={toIso(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-white outline-none text-xs"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons & Period Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground bg-card border border-[#DCE7FF] dark:border-slate-800 px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs">
          <Calendar className="w-3.5 h-3.5 text-blue-500" />
          <span>{lang === "ar" ? "الفترة المعروضة:" : "Showing:"}</span>
          <span className="text-foreground font-bold">{rangeLabel}</span>
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/15 rounded-xl font-semibold shadow-xs h-9 cursor-pointer"
            disabled={!filteredAndSortedCompanies.length}
            onClick={() => setShowAllBillsModal(true)}
          >
            <Receipt className="w-4 h-4 text-emerald-500" />
            {lang === "ar" ? "كشف فواتير العملاء" : "Client Invoices"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-blue-600 dark:text-blue-400 bg-blue-500/5 border-blue-500/30 hover:bg-blue-500/15 rounded-xl font-semibold shadow-xs h-9 cursor-pointer"
            disabled={!modelCostBreakdown.length}
            onClick={() => setShowModelCostModal(true)}
          >
            <PieChart className="w-4 h-4 text-blue-500" />
            {lang === "ar" ? "تفاصيل التكلفة" : "Cost Breakdown"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-slate-700 dark:text-slate-200 bg-card border-[#DCE7FF] dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold shadow-xs h-9 cursor-pointer"
            onClick={exportToCSV}
          >
            <Download className="w-4 h-4 text-emerald-500" />
            {lang === "ar" ? "تصدير CSV" : "Export CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-slate-700 dark:text-slate-200 bg-card border-[#DCE7FF] dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold shadow-xs h-9 cursor-pointer"
            disabled={isFetchingCompanies || isFetchingUsage}
            onClick={() => {
              refetchCompanies();
              refetchUsage();
            }}
          >
            <RotateCcw className={`w-4 h-4 ${isFetchingCompanies || isFetchingUsage ? "animate-spin" : ""}`} />
            {lang === "ar" ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-inner">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight leading-tight">
              {formatQuota(totalAllocatedQuota)} <span className="text-xs font-normal text-muted-foreground">tokens</span>
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              {lang === "ar" ? "إجمالي الحصص المخصصة" : "Total Allocated Quota"}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {companiesWithQuota.length} {lang === "ar" ? "شركات بحصص محددة" : "companies with set quotas"}
            </p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-inner">
            <Coins className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight leading-tight">
              {totalTokensConsumedMonth.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              {lang === "ar" ? `استهلاك الرموز (${rangeLabel})` : `Tokens Consumed (${rangeLabel})`}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {formatCost(totalCostConsumedMonth, selectedCurrency)} {lang === "ar" ? "التكلفة التقديرية" : "est. cost"}
            </p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-inner">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-foreground tabular-nums tracking-tight leading-tight">
              {companiesWithQuota.length}
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1">
              {lang === "ar" ? "الشركات ذات الحصة" : "Companies with Quota"}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {companiesWithQuota.filter((c) => c.isActive).length} {lang === "ar" ? "نشطة حالياً" : "currently active"}
            </p>
          </div>
        </div>
      </div>

      {/* Feature 1: Charts Section */}
      {topCompaniesData.length > 0 && (
        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 overflow-hidden border-l-4 border-l-[#2D5BE3]">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              {lang === "ar" ? "أعلى الشركات استهلاكاً (Top 10)" : "Top 10 Consumers"}
            </CardTitle>
            <CardDescription className="text-xs">
              {lang === "ar" ? "حجم استهلاك الرموز (Tokens) خلال الشهر الحالي" : "Token consumption volume for the current month"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCompaniesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => formatQuota(val)}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number, name: string) => [
                      name === "tokens" ? value.toLocaleString() : value,
                      name === "tokens" ? (lang === "ar" ? "الرموز" : "Tokens") : name
                    ]}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold", marginBottom: "4px" }}
                  />
                  <Bar dataKey="tokens" radius={[4, 4, 0, 0]} maxBarSize={50}>
                    {topCompaniesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#2563eb" className="opacity-80 hover:opacity-100 transition-opacity" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Support AI Agent */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          {lang === "ar" ? "تكوين وكيل الدعم الفني الذكي (Support AI Agent)" : "Support AI Agent Configuration"}
        </h2>
        <QuotaAICard />
      </div>

      {/* Feature 2: Company Quota Management */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              {lang === "ar" ? "حصص الشركات والاستهلاك الشهري" : "Company Quotas & Monthly Usage"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar" ? "تحديد حصة الرموز (Tokens) لكل شركة ومتابعة نسبة الاستهلاك." : "Set token limits per company and monitor their monthly consumption."}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {companiesWithoutQuota.length > 0 && (
              <Button
                size="sm"
                className="h-9 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md shadow-blue-600/25"
                onClick={() => {
                  setNewAssignCompanyId(String(companiesWithoutQuota[0].id));
                  setNewAssignQuota("");
                  setNewAssignStartDate(toIso(new Date()));
                  const end = new Date();
                  end.setDate(end.getDate() + 30);
                  setNewAssignEndDate(toIso(end));
                  setIsAssignNewOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === "ar" ? "تعيين حصة لشركة" : "Assign Quota"}
              </Button>
            )}

            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "ar" ? "بحث عن شركة..." : "Search companies..."}
                className="pl-9 h-9 text-xs rounded-xl border-[#DCE7FF] dark:border-slate-800"
              />
            </div>
            
            <Select 
              value={`${sortKey}-${sortDir}`} 
              onValueChange={(val) => {
                const [k, d] = val.split("-");
                setSortKey(k as SortKey);
                setSortDir(d as SortDir);
              }}
            >
              <SelectTrigger className="w-full sm:w-48 h-9 text-xs rounded-xl border-[#DCE7FF] dark:border-slate-800">
                <ArrowUpDown className="w-3 h-3 mr-2 text-muted-foreground" />
                <SelectValue placeholder={lang === "ar" ? "ترتيب حسب..." : "Sort by..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tokens-desc">{lang === "ar" ? "الأعلى استهلاكاً" : "Highest Tokens"}</SelectItem>
                <SelectItem value="tokens-asc">{lang === "ar" ? "الأقل استهلاكاً" : "Lowest Tokens"}</SelectItem>
                <SelectItem value="messages-desc">{lang === "ar" ? "الأكثر رسائل" : "Most Messages"}</SelectItem>
                <SelectItem value="inputTokens-desc">{lang === "ar" ? "الأعلى مدخلات (Input)" : "Highest Input Tokens"}</SelectItem>
                <SelectItem value="outputTokens-desc">{lang === "ar" ? "الأعلى مخرجات (Output)" : "Highest Output Tokens"}</SelectItem>
                <SelectItem value="percent-desc">{lang === "ar" ? "الأعلى استنفاداً للحصة" : "Highest Quota %"}</SelectItem>
                <SelectItem value="cost-desc">{lang === "ar" ? "الأعلى تكلفة" : "Highest Cost"}</SelectItem>
                <SelectItem value="name-asc">{lang === "ar" ? "الاسم (أبجدي)" : "Name (A-Z)"}</SelectItem>
              </SelectContent>
            </Select>

            {/* Currency Selector (USD, SAR, EGP) */}
            <div className="flex items-center gap-0.5 bg-card p-1 rounded-xl border border-[#DCE7FF] dark:border-slate-800 h-9 shadow-xs">
              {(["USD", "SAR", "EGP"] as CurrencyCode[]).map((cCode) => {
                const c = CURRENCIES[cCode];
                const active = selectedCurrency === cCode;
                return (
                  <button
                    key={cCode}
                    type="button"
                    onClick={() => handleCurrencyChange(cCode)}
                    className={`px-2 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 h-7 cursor-pointer ${
                      active
                        ? "bg-blue-600 text-white shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    title={`${c.nameAr} (${c.nameEn})`}
                  >
                    <span>{c.flag}</span>
                    <span className="font-mono text-[11px]">{c.code}</span>
                  </button>
                );
              })}
            </div>

            {/* Section Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs rounded-xl border-[#DCE7FF] dark:border-slate-800 hover:bg-muted shadow-xs cursor-pointer"
                  title={lang === "ar" ? "إجراءات الحصص والاستهلاك" : "All Quota Actions"}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
                  <span className="hidden sm:inline">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="w-56 shadow-lg">
                <DropdownMenuLabel className="text-xs font-semibold">
                  {lang === "ar" ? "إجراءات الحصص والفواتير" : "Quota & Billing Actions"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {companiesWithoutQuota.length > 0 && (
                  <DropdownMenuItem
                    onClick={() => {
                      setNewAssignCompanyId(String(companiesWithoutQuota[0].id));
                      setNewAssignQuota("");
                      setNewAssignStartDate(toIso(new Date()));
                      const end = new Date();
                      end.setDate(end.getDate() + 30);
                      setNewAssignEndDate(toIso(end));
                      setIsAssignNewOpen(true);
                    }}
                    className="text-xs cursor-pointer gap-2 py-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-500" />
                    <span>{lang === "ar" ? "تعيين حصة لشركة" : "Assign Quota"}</span>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => setShowAllBillsModal(true)}
                  className="text-xs cursor-pointer gap-2 py-1.5"
                >
                  <Receipt className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{lang === "ar" ? "كشف فواتير العملاء" : "Client Invoices"}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => setShowModelCostModal(true)}
                  disabled={!modelCostBreakdown.length}
                  className="text-xs cursor-pointer gap-2 py-1.5"
                >
                  <PieChart className="w-3.5 h-3.5 text-purple-500" />
                  <span>{lang === "ar" ? "تفاصيل التكلفة" : "Cost Breakdown"}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={exportToCSV}
                  disabled={!filteredAndSortedCompanies.length}
                  className="text-xs cursor-pointer gap-2 py-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{lang === "ar" ? "تصدير كشف الحصص (CSV)" : "Export CSV"}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground">
                  {lang === "ar" ? "عملة التسعير" : "Currency"}: {CURRENCIES[selectedCurrency].flag} {CURRENCIES[selectedCurrency].code}
                </DropdownMenuLabel>
                {(["USD", "SAR", "EGP"] as CurrencyCode[]).map((cCode) => {
                  const c = CURRENCIES[cCode];
                  const isCurActive = selectedCurrency === cCode;
                  return (
                    <DropdownMenuItem
                      key={cCode}
                      onClick={() => handleCurrencyChange(cCode)}
                      className={`text-xs cursor-pointer gap-2 py-1.5 ${isCurActive ? "font-bold text-primary bg-primary/10" : ""}`}
                    >
                      <span>{c.flag}</span>
                      <span className="flex-1 font-mono font-bold">{c.code}</span>
                      <span className="text-[11px] text-muted-foreground">{c.nameEn}</span>
                      {isCurActive && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                    </DropdownMenuItem>
                  );
                })}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => {
                    refetchCompanies();
                    refetchUsage();
                  }}
                  disabled={isFetchingCompanies || isFetchingUsage}
                  className="text-xs cursor-pointer gap-2 py-1.5"
                >
                  <RotateCcw className={`w-3.5 h-3.5 text-muted-foreground ${isFetchingCompanies || isFetchingUsage ? "animate-spin" : ""}`} />
                  <span>{lang === "ar" ? "تحديث البيانات" : "Refresh Data"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 overflow-hidden border-l-4 border-l-[#2D5BE3]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th 
                    className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("name")}
                  >
                    <span className="inline-flex items-center gap-1">
                      {lang === "ar" ? "الشركة" : "Company"} <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "النموذج" : "Model"}</th>
                  <th
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("messages")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? "الرسائل" : "Messages"} <SortIcon col="messages" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("inputTokens")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? "مدخلات" : "Input Tokens"} <SortIcon col="inputTokens" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("outputTokens")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? "مخرجات" : "Output Tokens"} <SortIcon col="outputTokens" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th 
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("quota")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? "الحصة" : "Quota"} <SortIcon col="quota" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th 
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                    onClick={() => toggleSort("startDate")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? "تاريخ البدء" : "Start Date"} <SortIcon col="startDate" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th 
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                    onClick={() => toggleSort("endDate")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? "تاريخ الانتهاء" : "End Date"} <SortIcon col="endDate" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th 
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("tokens")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? "الاستهلاك" : "Total Used"} <SortIcon col="tokens" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th 
                    className="text-right px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("cost")}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {lang === "ar" ? `التكلفة (${CURRENCIES[selectedCurrency].code})` : `Cost (${CURRENCIES[selectedCurrency].code})`} <SortIcon col="cost" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th 
                    className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("percent")}
                  >
                    <span className="inline-flex items-center gap-1">
                      {lang === "ar" ? "النسبة" : "Percent"} <SortIcon col="percent" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border/30">
                {companiesLoading || usageLoading ? (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      {lang === "ar" ? "جاري تحميل البيانات..." : "Loading data..."}
                    </td>
                  </tr>
                ) : filteredAndSortedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-muted-foreground">
                      {lang === "ar" ? "لا توجد شركات بحصص محددة حالياً." : "No companies with assigned quotas."}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedCompanies.map((c) => {
                    const hasQuota = c.monthlyTokenQuota != null && Number(c.monthlyTokenQuota) > 0;
                    const usage = companyUsageMap.get(c.id);
                    const rawTokens = usage?.tokens ?? 0;
                    const tokensUsed = hasQuota ? rawTokens : 0;
                    const cost = hasQuota ? (usage?.cost ?? 0) : 0;
                    const quota = c.monthlyTokenQuota;
                    const percentFloat = hasQuota && quota && quota > 0 ? (tokensUsed / quota) * 100 : null;
                    const percentDisplay = percentFloat === null
                      ? null
                      : tokensUsed === 0
                      ? "0%"
                      : percentFloat < 0.01
                      ? "< 0.01%"
                      : percentFloat < 1
                      ? `${percentFloat.toFixed(2)}%`
                      : `${Math.min(100, Math.round(percentFloat))}%`;
                    const percentBarWidth = percentFloat !== null
                      ? Math.min(100, Math.max(tokensUsed > 0 ? 1 : 0, Math.round(percentFloat)))
                      : 0;

                    const effectiveModel = c.aiModel || (hasQuota ? (quotaSettings?.aiModel || usage?.model) : null) || "gpt-4o-mini";
                    const effectiveProvider = (c.aiModel ? c.aiProvider : null) || (hasQuota ? (quotaSettings?.aiProvider || usage?.provider) : c.aiProvider) || "openai";

                    return (
                      <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{c.name}</div>
                          {c.clientName && (
                            <div className="text-[11px] text-muted-foreground">{c.clientName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[11px] font-semibold text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded w-fit inline-block">
                                {effectiveModel}
                              </span>
                              {c.aiModel && (
                                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                  {lang === "ar" ? "مخصص" : "Dedicated"}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {effectiveProvider}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono text-muted-foreground">
                          {hasQuota ? (usage?.messages ?? 0).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono text-muted-foreground">
                          {hasQuota ? (usage?.inputTokens ?? 0).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono text-muted-foreground">
                          {hasQuota ? (usage?.outputTokens ?? 0).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {hasQuota ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="inline-flex items-center gap-1 font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full text-[11px]">
                                {formatQuota(c.monthlyTokenQuota)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 text-[10px] font-medium bg-muted/40 border border-muted/50 px-2 py-0.5 rounded-full">
                              {lang === "ar" ? "معطل" : "Disabled"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono text-xs whitespace-nowrap">
                          {c.quotaStartDate ? (
                            <span className="text-foreground" title={c.quotaStartDate}>
                              {c.quotaStartDate.slice(0, 10)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono text-xs whitespace-nowrap">
                          {c.quotaEndDate ? (
                            <span className="text-foreground" title={c.quotaEndDate}>
                              {c.quotaEndDate.slice(0, 10)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono">
                          {hasQuota ? (
                            tokensUsed.toLocaleString()
                          ) : (
                            <span className="text-muted-foreground/40 font-sans text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-500/90 font-medium">
                          {hasQuota ? formatCost(cost, selectedCurrency) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {percentDisplay !== null ? (
                            <div className="w-24 space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className={percentFloat! >= 100 ? "text-red-500 font-bold" : percentFloat! >= 80 ? "text-amber-500 font-semibold" : "text-emerald-500"}>
                                  {percentDisplay}
                                </span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    percentFloat! >= 100 ? "bg-red-500" : percentFloat! >= 80 ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${percentBarWidth}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md"
                                  title={lang === "ar" ? "جميع الإجراءات المتاحة" : "All Available Actions"}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                  <span className="sr-only">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="w-60 shadow-lg">
                                <DropdownMenuLabel className="text-xs font-semibold flex items-center justify-between pb-1">
                                  <span className="truncate max-w-[130px] font-bold">{c.name}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono font-normal">
                                    {formatQuota(c.monthlyTokenQuota)} tokens
                                  </span>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onClick={() => openQuotaDialog(c, "base")}
                                  className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                >
                                  <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                                  <span>{lang === "ar" ? "إدارة الحصة والنموذج" : "Manage Quota & Model"}</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => openQuotaDialog(c, "topup")}
                                  className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                >
                                  <PackagePlus className="w-3.5 h-3.5 text-purple-500" />
                                  <span>{lang === "ar" ? "شحن باقة إضافية وفاتورة" : "Add Top-up & Bill"}</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => setBillTarget(c)}
                                  className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                >
                                  <Receipt className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>{lang === "ar" ? "عرض فاتورة الاستهلاك" : "View Usage Invoice"}</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => handleShareBill(c)}
                                  className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                >
                                  <Mail className="w-3.5 h-3.5 text-amber-500" />
                                  <span>{lang === "ar" ? "إرسال الفاتورة عبر البريد" : "Send Bill via Email"}</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => handleCopyBill(c)}
                                  className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                >
                                  <Copy className="w-3.5 h-3.5 text-cyan-500" />
                                  <span>{lang === "ar" ? "نسخ ملخص الفاتورة" : "Copy Bill Summary"}</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={() => handleDownloadInvoiceImage(c)}
                                  className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                >
                                  <Download className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>{lang === "ar" ? "تحميل صورة الفاتورة (PNG)" : "Download Invoice Card"}</span>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onClick={() => handleClearCompanyQuota(c)}
                                  className="text-xs cursor-pointer gap-2.5 py-1.5 text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-500/10 font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  <span>{lang === "ar" ? "إلغاء حصة الشركة" : "Clear Quota"}</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Quota Modal */}
      <Dialog open={!!quotaTarget} onOpenChange={(open) => !open && setQuotaTarget(null)}>
        <DialogContent className="max-w-3xl sm:max-w-3xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden p-5 sm:p-7">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              {lang === "ar" ? `إدارة حصة الرموز: ${quotaTarget?.name}` : `Manage Token Quota: ${quotaTarget?.name}`}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "يمكنك تعديل الحصة الشهرية وتواريخ الصلاحية، أو شحن باقة إضافية وإصدار فاتورة مرتبطة بها فوراً."
                : "Configure base monthly quota and validity period, or add an extra top-up package linked to an invoice."}
            </DialogDescription>
          </DialogHeader>

          {/* Currency Toggle Bar */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/60 border border-border/70 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Coins className="w-3.5 h-3.5 text-amber-500" />
              <span>{lang === "ar" ? "عملة التسعير والحساب:" : "Pricing & Billing Currency:"}</span>
            </div>
            <div className="flex items-center gap-1 bg-background p-0.5 rounded-md border border-border shadow-xs">
              {(["USD", "SAR", "EGP"] as CurrencyCode[]).map((cCode) => {
                const c = CURRENCIES[cCode];
                const active = selectedCurrency === cCode;
                return (
                  <button
                    key={cCode}
                    type="button"
                    onClick={() => handleCurrencyChange(cCode)}
                    className={`px-3 py-1 text-xs rounded font-medium transition-all flex items-center gap-1.5 ${
                      active
                        ? "bg-primary text-primary-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span className="font-semibold">{c.code}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Selector */}
          <Tabs value={quotaModalTab} onValueChange={(v) => setQuotaModalTab(v as any)} className="w-full pt-1">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="base" className="gap-1.5 text-xs">
                <TrendingUp className="w-3.5 h-3.5" />
                {lang === "ar" ? "الحصة والتواريخ" : "Base Quota & Dates"}
              </TabsTrigger>
              <TabsTrigger
                value="topup"
                className="gap-1.5 text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-emerald-600 dark:text-emerald-400"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                {lang === "ar" ? "➕ شحن باقة وفاتورة" : "➕ Add Top-up & Bill"}
              </TabsTrigger>
            </TabsList>

            {/* Base Quota Tab */}
            <TabsContent value="base" className="space-y-4 m-0">
              {/* Associated AI Models */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold">
                    <Cpu className="w-3.5 h-3.5 text-primary" />
                    {lang === "ar" ? "نوع ومزود الذكاء الاصطناعي (AI Provider):" : "AI Model Provider:"}
                  </Label>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shadow-[0_0_4px_1px_rgba(16,185,129,0.5)]" />
                    {lang === "ar" ? "المزود المختار بوكيل الدعم:" : "Support AI Provider:"} 
                    <strong className="text-foreground capitalize">{quotaSettings?.aiProvider || "Google Gemini"}</strong>
                  </span>
                </div>

                {/* AI Type / Provider Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { key: "google", label: "Google Gemini", icon: "🔵" },
                      { key: "openai", label: "OpenAI", icon: "🟢" },
                      { key: "anthropic", label: "Anthropic", icon: "🟠" },
                      { key: "openrouter", label: "OpenRouter", icon: "🟣" },
                    ] as const
                  ).map((p) => {
                    const isSelected = quotaProviderInput === p.key;
                    const isSupportAiActive = (quotaSettings?.aiProvider || "google") === p.key;
                    return (
                      <Button
                        key={p.key}
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        className={`h-8.5 px-2.5 text-xs flex items-center justify-center gap-1.5 font-medium relative transition-all ${
                          isSelected
                            ? "shadow-sm ring-1 ring-primary/40 font-semibold"
                            : "hover:bg-muted/70 text-muted-foreground"
                        }`}
                        onClick={() => {
                          const newProvider = p.key as AiProvider;
                          setQuotaProviderInput(newProvider);
                          if (quotaModelInput !== "default" && quotaModelInput !== "custom") {
                            const exists = AI_PROVIDERS[newProvider]?.models.some((m) => m.value === quotaModelInput);
                            if (!exists) {
                              setQuotaModelInput("default");
                              setQuotaIsCustomModel(false);
                              syncModelChangePricing(quotaSettings?.aiModel || "gemini-2.5-flash");
                            }
                          }
                        }}
                      >
                        <span className="text-xs shrink-0">{p.icon}</span>
                        <span className="whitespace-nowrap">{p.label}</span>
                        {isSupportAiActive && (
                          <span
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background"
                            title={lang === "ar" ? "المزود النشط في وكيل الدعم" : "Active in Support AI"}
                          />
                        )}
                      </Button>
                    );
                  })}
                </div>

                {/* Dropdown Menu labeled 'Associated AI Models' */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      {lang === "ar" ? "النماذج المرتبطة (Associated AI Models):" : "Associated AI Models:"}
                    </Label>
                    {quotaModelInput !== "default" && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuotaModelInput("default");
                          setQuotaIsCustomModel(false);
                          setQuotaCustomModel("");
                          syncModelChangePricing(quotaSettings?.aiModel || "gemini-2.5-flash");
                        }}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline"
                      >
                        {lang === "ar" ? "استعادة افتراضي وكيل الدعم" : "Reset to Support AI Default"}
                      </button>
                    )}
                  </div>

                  <Select
                    value={quotaModelInput}
                    onValueChange={(val) => {
                      if (val === "custom") {
                        setQuotaModelInput("custom");
                        setQuotaIsCustomModel(true);
                        syncModelChangePricing(quotaCustomModel.trim() || currentActiveModelId);
                      } else {
                        setQuotaModelInput(val);
                        setQuotaIsCustomModel(false);
                        const targetModel = val === "default" ? (quotaSettings?.aiModel || "gemini-2.5-flash") : val;
                        syncModelChangePricing(targetModel);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs font-medium">
                      <SelectValue placeholder={lang === "ar" ? "اختر النموذج المرتبط..." : "Select Associated AI Model..."} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="default" className="text-xs font-semibold text-foreground">
                        🌟 {lang === "ar" ? "الافتراضي لوكيل الدعم (Support AI Default)" : "Support AI Default Model"} ({quotaSettings?.aiModel || "gpt-4o-mini"})
                      </SelectItem>
                      {quotaTarget?.aiModel &&
                        !AI_PROVIDERS[quotaProviderInput]?.models.some((m) => m.value === quotaTarget.aiModel) && (
                          <SelectItem value={quotaTarget.aiModel} className="text-xs font-mono text-purple-600 dark:text-purple-400 font-medium">
                            💾 {quotaTarget.aiModel} ({lang === "ar" ? "النموذج المحفوظ حالياً" : "Current Saved Model"})
                          </SelectItem>
                        )}
                      {AI_PROVIDERS[quotaProviderInput]?.models.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-xs">
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span className="font-medium">{m.label}</span>
                            {m.free && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                                {lang === "ar" ? "مجاني" : "Free"}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs text-blue-500 font-medium">
                        ✏️ {lang === "ar" ? "إدخال معرف نموذج مخصص (Custom Model ID)..." : "Enter Custom Model ID..."}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {quotaIsCustomModel && (
                    <div className="space-y-1 pt-1 animate-in fade-in">
                      <Input
                        type="text"
                        value={quotaCustomModel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuotaCustomModel(val);
                          syncModelChangePricing(val.trim() || currentActiveModelId);
                        }}
                        placeholder={
                          quotaProviderInput === "openrouter"
                            ? "e.g. google/gemini-2.5-flash or meta-llama/llama-3.3-70b-instruct"
                            : quotaProviderInput === "google"
                            ? "e.g. gemini-2.5-flash"
                            : "e.g. gpt-4o"
                        }
                        className="h-8 text-xs font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {lang === "ar"
                          ? "اكتب معرف النموذج بدقة كما يوفره المزود المختار."
                          : "Enter the exact model identifier from the chosen provider."}
                      </p>
                    </div>
                  )}

                  {/* Effective model preview indicator & Interactive Model Base Rate Control */}
                  <div className="p-2.5 rounded-lg border bg-muted/40 border-border/60 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground font-medium">
                          {lang === "ar" ? "النموذج النشط للعميل:" : "Assigned Model:"}
                        </span>
                        <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                          {quotaModelInput === "default"
                            ? `${quotaSettings?.aiModel || "gpt-4o-mini"} (${lang === "ar" ? "افتراضي وكيل الدعم" : "Support AI Default"})`
                            : quotaIsCustomModel
                            ? quotaCustomModel.trim() || (lang === "ar" ? "مخصص (فارغ)" : "Custom (empty)")
                            : quotaModelInput}
                        </span>
                      </div>

                      {/* Catalog Reference Info */}
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 self-end sm:self-auto">
                        {currentModelPricing.isFree ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                            {lang === "ar" ? `نموذج مجاني (${CURRENCIES[selectedCurrency].code} 0.00)` : `Free Tier Model (${CURRENCIES[selectedCurrency].code} 0.00)`}
                          </span>
                        ) : (
                          <span>
                            {lang === "ar" ? "السعر القياسي للمزود:" : "Provider Standard:"}{" "}
                            <strong className="text-foreground">{(currentModelPricing.pricePerToken * CURRENCIES[selectedCurrency].exchangeRate).toFixed(8)} {CURRENCIES[selectedCurrency].code}</strong> / token
                            <span className="text-[9px] text-muted-foreground ml-1">({(currentModelPricing.blendedPer1M * CURRENCIES[selectedCurrency].exchangeRate).toFixed(2)} {CURRENCIES[selectedCurrency].code}/1M)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Interactive Model Base Rate Editor (Per 1 Token) */}
                    <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="quota-token-rate" className="text-xs font-semibold flex items-center gap-1 text-foreground">
                          <Coins className="w-3.5 h-3.5 text-amber-500" />
                          {lang === "ar" ? "التحكم في سعر الرمز (لكل 1 توكن):" : "Control Price per 1 Token:"}
                        </Label>
                        {isCustomTokenRate && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                            {lang === "ar" ? "سعر مخصص" : "Custom Rate"}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <div className="relative w-44">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">{CURRENCIES[selectedCurrency].code === "USD" ? "$" : CURRENCIES[selectedCurrency].code}</span>
                          <Input
                            id="quota-token-rate"
                            type="text"
                            value={quotaPricePerToken}
                            onChange={(e) => handleTokenRateChange(e.target.value)}
                            className="h-8 pl-10 pr-14 font-mono text-xs font-bold bg-background border-amber-500/40 focus-visible:ring-amber-500"
                            placeholder="0.00000025"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none font-semibold">
                            / token
                          </span>
                        </div>

                        {Number(quotaPricePerToken) > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">
                            ≈ {(Number(quotaPricePerToken || 0) * 1_000_000).toFixed(4)} {CURRENCIES[selectedCurrency].code}/1M
                          </span>
                        )}

                        {isCustomTokenRate && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={resetTokenRateToStandard}
                            className="h-8 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                            title={lang === "ar" ? "استعادة السعر القياسي للنموذج" : "Reset to model standard rate"}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            {lang === "ar" ? "استعادة القياسي" : "Reset"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Token Quota & Synchronized Model Price Rate */}
              <div className="pt-2 border-t border-border/40 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  {/* Monthly Token Quota Input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between h-5">
                      <Label htmlFor="quota-input-ai" className="text-xs font-semibold text-foreground flex items-center gap-1 whitespace-nowrap">
                        <Calculator className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>{lang === "ar" ? "الحصة الشهرية:" : "Monthly Token Quota:"}</span>
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {lang === "ar" ? "رموز / Tokens" : "Tokens"}
                      </span>
                    </div>
                    <div className="relative">
                      <Input
                        id="quota-input-ai"
                        placeholder={lang === "ar" ? "مثال: 1000000 أو اتركه فارغاً" : "e.g. 1000000"}
                        value={quotaInput}
                        onChange={(e) => handleTokensChange(e.target.value)}
                        className="font-mono text-xs font-bold h-9 pr-14"
                      />
                      {quotaInput && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none font-medium">
                          ≈ {formatQuota(Number(quotaInput))}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Model Price Rate Field (Linked directly with Token Quota) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between h-5">
                      <Label htmlFor="quota-model-price" className="flex items-center gap-1 text-xs font-semibold text-foreground whitespace-nowrap">
                        <Coins className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>{lang === "ar" ? `سعر الحصة (${CURRENCIES[selectedCurrency].code}):` : `Total Quota Price (${CURRENCIES[selectedCurrency].code}):`}</span>
                      </Label>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0" title={lang === "ar" ? "السعر لكل 1 توكن" : "Price per 1 token"}>
                        {currentModelPricing.isFree ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{lang === "ar" ? "مجاني" : "Free"}</span>
                        ) : (
                          `${Number(quotaPricePerToken || 0).toFixed(8)} ${CURRENCIES[selectedCurrency].code}/tok`
                        )}
                      </span>
                    </div>

                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">{CURRENCIES[selectedCurrency].code === "USD" ? "$" : CURRENCIES[selectedCurrency].code}</span>
                      <Input
                        id="quota-model-price"
                        type="text"
                        value={quotaPrice}
                        onChange={(e) => handlePriceChange(e.target.value)}
                        className="pl-10 pr-12 font-mono text-xs font-bold h-9 border-emerald-500/30 focus-visible:ring-emerald-500"
                        placeholder="0.00"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none font-semibold">
                        {CURRENCIES[selectedCurrency].code}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Presets */}
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {lang === "ar" ? "خيارات سريعة للحصة:" : "Quick quota presets:"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUOTA_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        type="button"
                        size="sm"
                        variant={quotaInput === String(p.value) ? "default" : "outline"}
                        className="text-xs h-7"
                        onClick={() => handlePresetClick(p.value)}
                      >
                        {p.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 text-muted-foreground"
                      onClick={handleClearQuota}
                    >
                      <X className="w-3 h-3 mr-1" />
                      {lang === "ar" ? "تعطيل الحصة" : "Clear — Disable Quota"}
                    </Button>
                  </div>
                </div>

                {/* Dynamic Cost Calculator Linked to Quota & Price */}
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-emerald-500" />
                      {lang === "ar" ? "التكلفة التقديرية للحصة المحددة:" : "Estimated Quota Cost Breakdown:"}
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      {currentModelPricing.isFree ? (
                        <span>0.00 {CURRENCIES[selectedCurrency].code} <span className="text-xs font-normal text-muted-foreground">({lang === "ar" ? "مجاني" : "Free"})</span></span>
                      ) : Number(quotaInput) > 0 ? (
                        `${quotaPrice} ${CURRENCIES[selectedCurrency].code}`
                      ) : (
                        <span className="text-muted-foreground font-normal text-xs">{lang === "ar" ? "أدخل الحصة للحساب" : "Enter quota to calculate"}</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/15">
                    <span>
                      {lang === "ar" ? "معادلة الاحتساب بناءً على الرمز الواحد:" : "Calculation formula (Tokens × Price per Token):"}
                    </span>
                    <span className="font-mono text-[11px] text-foreground/80">
                      {Number(quotaInput) > 0 ? (
                        <>
                          {Number(quotaInput).toLocaleString()} tokens × {Number(quotaPricePerToken || 0).toFixed(8)} {CURRENCIES[selectedCurrency].code} / token ={" "}
                          <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                            {quotaPrice} {CURRENCIES[selectedCurrency].code}
                          </strong>
                        </>
                      ) : (
                        <span>{lang === "ar" ? "عدد الرموز × سعر الرمز الواحد" : "Tokens count × Price per 1 Token"}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Start & End Dates */}
              <div className="space-y-2.5 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    {lang === "ar" ? "فترة صلاحية الحصة (تاريخ البدء والانتهاء)" : "Quota Validity Period (Start & End Dates)"}
                  </Label>
                  {(quotaStartDate || quotaEndDate) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={() => { setQuotaStartDate(""); setQuotaEndDate(""); }}
                    >
                      <X className="w-3 h-3 mr-1" />
                      {lang === "ar" ? "مسح التواريخ" : "Clear Dates"}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="quota-start-date" className="text-[11px] text-muted-foreground">
                      {lang === "ar" ? "تاريخ البدء:" : "Start Date:"}
                    </Label>
                    <Input
                      id="quota-start-date"
                      type="date"
                      value={quotaStartDate}
                      onChange={(e) => setQuotaStartDate(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="quota-end-date" className="text-[11px] text-muted-foreground">
                      {lang === "ar" ? "تاريخ الانتهاء:" : "End Date:"}
                    </Label>
                    <Input
                      id="quota-end-date"
                      type="date"
                      min={quotaStartDate || undefined}
                      value={quotaEndDate}
                      onChange={(e) => setQuotaEndDate(e.target.value)}
                      className={`h-8 text-xs font-mono ${
                        quotaStartDate && quotaEndDate && quotaEndDate < quotaStartDate
                          ? "border-destructive focus-visible:ring-destructive text-destructive font-semibold"
                          : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Quick Period Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {lang === "ar" ? "فترات جاهزة:" : "Presets:"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => applyDatePreset("30d", setQuotaStartDate, setQuotaEndDate, quotaStartDate)}
                  >
                    {lang === "ar" ? "+30 يوم" : "+30 Days"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => applyDatePreset("endOfMonth", setQuotaStartDate, setQuotaEndDate, quotaStartDate)}
                  >
                    {lang === "ar" ? "نهاية الشهر" : "End of Month"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => applyDatePreset("90d", setQuotaStartDate, setQuotaEndDate, quotaStartDate)}
                  >
                    {lang === "ar" ? "+90 يوم" : "+90 Days"}
                  </Button>
                </div>

                {quotaStartDate && quotaEndDate && (
                  quotaEndDate < quotaStartDate ? (
                    <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-1.5 flex items-center gap-1.5 font-medium animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {lang === "ar"
                          ? `⚠️ تاريخ الانتهاء (${quotaEndDate}) يسبق تاريخ البدء (${quotaStartDate})! يرجى تصحيح التاريخ أو السنة (مثلاً 2026 بدلاً من 2020).`
                          : `⚠️ End date (${quotaEndDate}) is earlier than start date (${quotaStartDate})! Please correct the date or year (e.g. 2026 instead of 2020).`}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground bg-muted/50 border border-border/40 rounded px-2.5 py-1.5 flex items-center justify-between">
                      <span>{lang === "ar" ? "مدة الصلاحية:" : "Active Duration:"}</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {Math.ceil((new Date(quotaEndDate).getTime() - new Date(quotaStartDate).getTime()) / (1000 * 60 * 60 * 24))} {lang === "ar" ? "يوم" : "days"}
                      </span>
                    </div>
                  )
                )}
              </div>

              {quotaTarget && (
                <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span>{lang === "ar" ? "الحصة المسجلة حالياً:" : "Current Quota:"}</span>
                    <span className="font-semibold text-foreground">
                      {quotaTarget.monthlyTokenQuota ? `${formatQuota(quotaTarget.monthlyTokenQuota)} tokens / month` : (lang === "ar" ? "غير محددة (غير محدود)" : "Unlimited")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40">
                    <span>{lang === "ar" ? "النموذج المسجل حالياً:" : "Current Saved Model:"}</span>
                    <span className="font-mono text-foreground font-semibold">
                      {quotaTarget.aiModel ? `${quotaTarget.aiModel} (${quotaTarget.aiProvider || "default"})` : (lang === "ar" ? "الافتراضي لوكيل الدعم" : "Support AI Default")}
                    </span>
                  </div>
                  {(quotaTarget.quotaStartDate || quotaTarget.quotaEndDate) && (
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/40">
                      <span>{lang === "ar" ? "فترة صلاحية الحصة السابقة:" : "Previous Quota Period:"}</span>
                      <span className="font-mono text-foreground">
                        {quotaTarget.quotaStartDate ? quotaTarget.quotaStartDate.slice(0, 10) : "—"}
                        {" → "}
                        {quotaTarget.quotaEndDate ? quotaTarget.quotaEndDate.slice(0, 10) : "—"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Top-up Package & Bill Tab */}
            <TabsContent value="topup" className="space-y-3.5 m-0">
              {(() => {
                const targetUsage = quotaTarget ? companyUsageMap.get(quotaTarget.id) : null;
                const targetTokens = targetUsage?.tokens ?? 0;
                const targetQuota = quotaTarget?.monthlyTokenQuota ?? 0;
                const isTargetExceeded = targetQuota > 0 && targetTokens >= targetQuota;
                const targetPercent = targetQuota > 0 ? (targetTokens / targetQuota) * 100 : 0;

                return (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      isTargetExceeded
                        ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 font-semibold"
                        : targetPercent >= 80
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 font-medium"
                        : "bg-muted/60 border-border/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isTargetExceeded ? (
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      ) : (
                        <Zap className="w-4 h-4 shrink-0 text-emerald-500" />
                      )}
                      <span>
                        {isTargetExceeded
                          ? (lang === "ar" ? "⚠️ تم استهلاك كامل الحصة المحددة!" : "⚠️ Quota fully consumed!")
                          : (lang === "ar" ? "الحصة المستهلكة حالياً:" : "Current Quota Usage:")}
                      </span>
                    </div>
                    <span className="font-mono font-bold">
                      {targetTokens.toLocaleString()} / {formatQuota(targetQuota)} ({targetPercent.toFixed(1)}%)
                    </span>
                  </div>
                );
              })()}

              {/* Assigned Model & Control Price per 1 Token (Top-up Section) */}
              <div className="p-2.5 rounded-lg border bg-muted/40 border-border/60 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground font-medium">
                      {lang === "ar" ? "النموذج النشط للعميل:" : "Assigned Model:"}
                    </span>
                    <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                      {quotaModelInput === "default"
                        ? `${quotaSettings?.aiModel || "gpt-4o-mini"} (${lang === "ar" ? "افتراضي وكيل الدعم" : "Support AI Default"})`
                        : quotaIsCustomModel
                        ? quotaCustomModel.trim() || (lang === "ar" ? "مخصص (فارغ)" : "Custom (empty)")
                        : quotaModelInput}
                    </span>
                  </div>

                  {/* Catalog Reference Info */}
                  <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 self-end sm:self-auto">
                    {currentModelPricing.isFree ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                        {lang === "ar" ? `نموذج مجاني (${CURRENCIES[selectedCurrency].code} 0.00)` : `Free Tier Model (${CURRENCIES[selectedCurrency].code} 0.00)`}
                      </span>
                    ) : (
                      <span>
                        {lang === "ar" ? "السعر القياسي للمزود:" : "Provider Standard:"}{" "}
                        <strong className="text-foreground">{(currentModelPricing.pricePerToken * CURRENCIES[selectedCurrency].exchangeRate).toFixed(8)} {CURRENCIES[selectedCurrency].code}</strong> / token
                        <span className="text-[9px] text-muted-foreground ml-1">({(currentModelPricing.blendedPer1M * CURRENCIES[selectedCurrency].exchangeRate).toFixed(2)} {CURRENCIES[selectedCurrency].code}/1M)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Interactive Model Base Rate Editor (Per 1 Token) - Dedicated for Top-up */}
                <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="topup-token-rate" className="text-xs font-semibold flex items-center gap-1 text-foreground">
                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                      {lang === "ar" ? "التحكم في سعر الرمز (لكل 1 توكن):" : "Control Price per 1 Token:"}
                    </Label>
                    {isCustomTopupTokenRate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                        {lang === "ar" ? "سعر مخصص للشحن" : "Custom Top-up Rate"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <div className="relative w-44">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">{CURRENCIES[selectedCurrency].code === "USD" ? "$" : CURRENCIES[selectedCurrency].code}</span>
                      <Input
                        id="topup-token-rate"
                        type="text"
                        value={topupPricePerToken}
                        onChange={(e) => handleTopupTokenRateChange(e.target.value)}
                        className="h-8 pl-10 pr-14 font-mono text-xs font-bold bg-background border-amber-500/40 focus-visible:ring-amber-500"
                        placeholder="0.00000025"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none font-semibold">
                        / token
                      </span>
                    </div>

                    {Number(topupPricePerToken) > 0 && (
                      <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">
                        ≈ {(Number(topupPricePerToken || 0) * 1_000_000).toFixed(4)} {CURRENCIES[selectedCurrency].code}/1M
                      </span>
                    )}

                    {isCustomTopupTokenRate && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={resetTopupTokenRateToStandard}
                        className="h-8 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                        title={lang === "ar" ? "استعادة السعر القياسي للنموذج" : "Reset to model standard rate"}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        {lang === "ar" ? "استعادة القياسي" : "Reset"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>{lang === "ar" ? "اختر باقة شحن جاهزة:" : "Select Top-up Package:"}</span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {lang === "ar" ? "تحدد الرموز والسعر تلقائياً" : "Sets tokens & suggested price"}
                  </span>
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {TOPUP_PRESETS.map((p) => {
                    const active = topupTokens === p.tokens;
                    const presetPrice = formatPriceValue(Number(p.defaultPrice) * CURRENCIES[selectedCurrency].exchangeRate);
                    return (
                      <Button
                        key={p.tokens}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className={`h-8 text-xs font-medium justify-between px-2.5 ${
                          active ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm" : ""
                        }`}
                        onClick={() => {
                          setTopupTokens(p.tokens);
                          const rate = Number(topupPricePerToken) || 0;
                          if (rate > 0) {
                            setTopupPrice(formatPriceValue(p.tokens * rate));
                          } else {
                            setTopupPrice(presetPrice);
                          }
                        }}
                      >
                        <span>+{formatQuota(p.tokens)} ({presetPrice} {CURRENCIES[selectedCurrency].code})</span>
                        {active && <Check className="w-3.5 h-3.5 ml-1 text-white shrink-0" />}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Inputs: Tokens & Price */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="topup-tokens-input" className="text-xs font-semibold">
                    {lang === "ar" ? "الرموز المضافة (Tokens):" : "Tokens to Add:"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="topup-tokens-input"
                      type="text"
                      value={topupTokens ? topupTokens.toLocaleString() : ""}
                      onChange={(e) => {
                        const num = Number(e.target.value.replace(/[^0-9]/g, ""));
                        setTopupTokens(num);
                        const rate = Number(topupPricePerToken) || 0;
                        if (rate > 0 && num > 0) {
                          setTopupPrice(formatPriceValue(num * rate));
                        }
                      }}
                      className="h-8 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400"
                      placeholder="50,000"
                    />
                    {topupTokens > 0 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                        ≈ {formatQuota(topupTokens)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="topup-price-input" className="text-xs font-semibold">
                    {lang === "ar" ? `سعر الباقة للفاتورة (${CURRENCIES[selectedCurrency].code}):` : `Invoice Price (${CURRENCIES[selectedCurrency].code}):`}
                  </Label>
                  <div className="relative">
                    <Input
                      id="topup-price-input"
                      type="text"
                      value={topupPrice}
                      onChange={(e) => setTopupPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="h-8 text-xs font-mono font-bold"
                      placeholder="10.00"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none font-semibold">
                      {CURRENCIES[selectedCurrency].code}
                    </span>
                  </div>
                </div>
              </div>

              {/* Calculation Preview Card */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 space-y-1.5 text-xs">
                <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    {lang === "ar" ? "معاينة الحصة بعد الشحن:" : "Calculation Preview:"}
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {Number(topupPrice || 0).toFixed(2)} {CURRENCIES[selectedCurrency].code}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-[11px]">
                  <span className="text-muted-foreground">{lang === "ar" ? "الحصة الحالية:" : "Current Quota:"}</span>
                  <span className="font-mono">{(quotaTarget?.monthlyTokenQuota || 0).toLocaleString()} tokens</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                  <span>{lang === "ar" ? "+ الباقة المضافة:" : "+ Added Package:"}</span>
                  <span className="font-mono font-bold">+{topupTokens.toLocaleString()} tokens</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-xs font-bold text-foreground">
                  <span>{lang === "ar" ? "= الحصة الإجمالية الجديدة:" : "= New Total Monthly Quota:"}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    {((quotaTarget?.monthlyTokenQuota || 0) + topupTokens).toLocaleString()} tokens ({formatQuota((quotaTarget?.monthlyTokenQuota || 0) + topupTokens)})
                  </span>
                </div>
                {Number(topupPricePerToken) > 0 && topupTokens > 0 && (
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-[10px] text-muted-foreground font-mono">
                    <span>{lang === "ar" ? "معادلة الحساب للرموز المضافة:" : "Top-up cost formula:"}</span>
                    <span>
                      {topupTokens.toLocaleString()} tokens × {Number(topupPricePerToken || 0).toFixed(8)} {CURRENCIES[selectedCurrency].code} / token
                    </span>
                  </div>
                )}
              </div>

              {/* Validity Extension Choice */}
              <div className="space-y-1.5 pt-1 border-t border-border/40">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  {lang === "ar" ? "صلاحية الباقة وتاريخ الانتهاء:" : "Package Validity & End Date:"}
                </Label>
                <div className="grid grid-cols-4 gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={topupValidityChoice === "keep" ? "default" : "outline"}
                    className="h-7 text-[10px] px-1"
                    onClick={() => setTopupValidityChoice("keep")}
                  >
                    {lang === "ar" ? "نفس الصلاحية" : "Keep Date"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={topupValidityChoice === "extend30" ? "default" : "outline"}
                    className="h-7 text-[10px] px-1"
                    onClick={() => setTopupValidityChoice("extend30")}
                  >
                    {lang === "ar" ? "+30 يوم" : "+30 Days"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={topupValidityChoice === "extend90" ? "default" : "outline"}
                    className="h-7 text-[10px] px-1"
                    onClick={() => setTopupValidityChoice("extend90")}
                  >
                    {lang === "ar" ? "+90 يوم" : "+90 Days"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={topupValidityChoice === "custom" ? "default" : "outline"}
                    className="h-7 text-[10px] px-1"
                    onClick={() => setTopupValidityChoice("custom")}
                  >
                    {lang === "ar" ? "تاريخ مخصص" : "Custom"}
                  </Button>
                </div>
                {topupValidityChoice === "custom" && (
                  <div className="pt-1">
                    <Input
                      type="date"
                      value={topupCustomEndDate}
                      onChange={(e) => setTopupCustomEndDate(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground flex items-center justify-between px-1">
                  <span>{lang === "ar" ? "تاريخ الانتهاء الناتج:" : "Resulting End Date:"}</span>
                  <span className="font-mono font-medium text-foreground">
                    {(() => {
                      const today = new Date();
                      const currentEnd = quotaTarget?.quotaEndDate ? new Date(quotaTarget.quotaEndDate) : null;
                      const base = currentEnd && currentEnd.getTime() > today.getTime() ? currentEnd : today;
                      if (topupValidityChoice === "keep") {
                        return quotaTarget?.quotaEndDate ? quotaTarget.quotaEndDate.slice(0, 10) : (lang === "ar" ? "غير محدد" : "None");
                      }
                      if (topupValidityChoice === "extend30") {
                        const d = new Date(base);
                        d.setDate(d.getDate() + 30);
                        return toIso(d);
                      }
                      if (topupValidityChoice === "extend90") {
                        const d = new Date(base);
                        d.setDate(d.getDate() + 90);
                        return toIso(d);
                      }
                      return topupCustomEndDate || (lang === "ar" ? "حدد تاريخاً" : "Select date");
                    })()}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1 pt-1">
                <Label htmlFor="topup-notes-input" className="text-[11px] text-muted-foreground">
                  {lang === "ar" ? "ملاحظات الفاتورة (اختياري):" : "Invoice Notes (Optional):"}
                </Label>
                <Input
                  id="topup-notes-input"
                  value={topupNotes}
                  onChange={(e) => setTopupNotes(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: شحن باقة إضافية عبر تحويل بنكي / بطلب العميل" : "e.g. Extra quota requested by client"}
                  className="h-8 text-xs"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
            <Button variant="outline" onClick={() => setQuotaTarget(null)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            {quotaModalTab === "base" ? (
              <Button
                onClick={handleSaveQuota}
                disabled={setQuotaMutation.isPending || Boolean(quotaStartDate && quotaEndDate && quotaEndDate < quotaStartDate)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/25 rounded-xl cursor-pointer"
              >
                {setQuotaMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {lang === "ar" ? "جاري الحفظ..." : "Saving..."}
                  </>
                ) : (
                  lang === "ar" ? "حفظ التغييرات" : "Save Quota"
                )}
              </Button>
            ) : (
              <Button
                onClick={handleExecuteTopup}
                disabled={setQuotaMutation.isPending || topupTokens <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
              >
                {setQuotaMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {lang === "ar" ? "جاري الشحن..." : "Adding..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {lang === "ar" ? "⚡ شحن وتوليد الفاتورة فوراً" : "⚡ Top-up & Generate Bill"}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top-up Invoice Modal */}
      <Dialog open={!!topupInvoice} onOpenChange={(open) => !open && setTopupInvoice(null)}>
        <DialogContent className="max-w-2xl sm:max-w-2xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Receipt className="w-5 h-5" />
              {lang === "ar" ? "فاتورة شحن باقة إضافية" : "Top-up Quota Invoice"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "تم شحن الباقة وتحديث حصة العميل في النظام بنجاح. يمكنك طباعة الفاتورة، تحميلها كصورة، أو إرسالها للعميل."
                : "Top-up package has been applied and company quota updated successfully. You can print, download image, or email the bill to client."}
            </DialogDescription>
          </DialogHeader>

          {topupInvoice && (
            <div className="space-y-4 py-2">
              {/* Status Banner */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{lang === "ar" ? "تم التفعيل بنجاح (PAID & ACTIVATED)" : "Paid & Activated Successfully"}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{topupInvoice.invoiceNumber}</span>
              </div>

              {/* Invoice Detail Card */}
              <div className="bg-muted/40 border border-border/60 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[11px] block">{lang === "ar" ? "الشركة:" : "Company:"}</span>
                    <span className="font-bold text-foreground">{topupInvoice.companyName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">{lang === "ar" ? "العميل:" : "Client:"}</span>
                    <span className="font-medium text-foreground">{topupInvoice.clientName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">{lang === "ar" ? "تاريخ الفاتورة:" : "Date:"}</span>
                    <span className="font-mono">{new Date(topupInvoice.date).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px] block">{lang === "ar" ? "صلاحية الباقة:" : "Validity End:"}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {topupInvoice.newEndDate || (lang === "ar" ? "نفس الصلاحية السابقة" : "Current Period")}
                    </span>
                  </div>
                </div>

                <div className="border-t border-border/40 pt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      {lang === "ar" ? "الباقة الإضافية المضافة:" : "Added Top-up Package:"}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{topupInvoice.addedTokens.toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>{lang === "ar" ? "الحصة السابقة:" : "Previous Quota:"}</span>
                    <span className="font-mono">{topupInvoice.previousQuota.toLocaleString()} tokens</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold pt-1 border-t border-border/30">
                    <span>{lang === "ar" ? "الحصة الإجمالية الجديدة بعد الشحن:" : "New Total Monthly Quota:"}</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      {topupInvoice.newTotalQuota.toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20 font-bold text-sm">
                    <span className="text-emerald-700 dark:text-emerald-300">{lang === "ar" ? "المبلغ الإجمالي المدفوع:" : "Total Paid:"}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {topupInvoice.currency === "USD" ? "$" : ""}{topupInvoice.price.toFixed(2)} {topupInvoice.currency || "USD"}
                    </span>
                  </div>
                </div>

                {topupInvoice.notes && (
                  <div className="text-[11px] bg-amber-500/10 border border-amber-500/20 p-2 rounded text-amber-800 dark:text-amber-300">
                    <strong>{lang === "ar" ? "ملاحظات:" : "Notes:"}</strong> {topupInvoice.notes}
                  </div>
                )}
              </div>

              {/* Email Share Toolbar */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  {lang === "ar" ? "إرسال نسخة الفاتورة إلى بريد العميل (Gmail):" : "Email Invoice to Client (Gmail):"}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={topupEmailOverride}
                    onChange={(e) => setTopupEmailOverride(e.target.value)}
                    placeholder="client@gmail.com"
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs gap-1.5 bg-primary shrink-0"
                    onClick={handleShareTopupBill}
                    disabled={isSharingTopupBill}
                  >
                    {isSharingTopupBill ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {lang === "ar" ? "إرسال" : "Send"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={handlePrint}
              >
                <Printer className="w-3.5 h-3.5" />
                {lang === "ar" ? "طباعة" : "Print"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={handleCopyTopupSummary}
              >
                {topupCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {lang === "ar" ? "نسخ الملخص" : "Copy"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                onClick={handleDownloadTopupImage}
              >
                <Download className="w-3.5 h-3.5" />
                {lang === "ar" ? "تحميل صورة" : "Download PNG"}
              </Button>
            </div>
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setTopupInvoice(null)}
            >
              {lang === "ar" ? "تم" : "Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign New Quota Modal */}
      <Dialog open={isAssignNewOpen} onOpenChange={setIsAssignNewOpen}>
        <DialogContent className="max-w-xl sm:max-w-xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              {lang === "ar" ? "تعيين حصة لشركة" : "Assign Company Quota"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "اختر شركة من الشركات المسجلة وحدد لها حصة شهرية من الرموز (Tokens)."
                : "Select a company and assign a monthly token quota to it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>{lang === "ar" ? "اختر الشركة" : "Select Company"}</Label>
              <Select value={newAssignCompanyId} onValueChange={setNewAssignCompanyId}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder={lang === "ar" ? "اختر شركة..." : "Select a company..."} />
                </SelectTrigger>
                <SelectContent>
                  {companiesWithoutQuota.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} {c.clientName ? `(${c.clientName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-quota-input">
                {lang === "ar" ? "الحصة الشهرية (رموز / Tokens)" : "Monthly Token Quota"}
              </Label>
              <div className="relative">
                <Input
                  id="new-quota-input"
                  placeholder={lang === "ar" ? "مثال: 1000000" : "e.g. 1000000"}
                  value={newAssignQuota}
                  onChange={(e) => setNewAssignQuota(e.target.value.replace(/[^0-9]/g, ""))}
                  className="font-mono text-sm"
                />
                {newAssignQuota && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    ≈ {formatQuota(Number(newAssignQuota))}
                  </span>
                )}
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground font-medium">
                {lang === "ar" ? "خيارات سريعة:" : "Quick presets:"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUOTA_PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    type="button"
                    size="sm"
                    variant={newAssignQuota === String(p.value) ? "default" : "outline"}
                    className="text-xs h-7"
                    onClick={() => setNewAssignQuota(String(p.value))}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Start & End Dates */}
            <div className="space-y-2.5 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  {lang === "ar" ? "فترة صلاحية الحصة (تاريخ البدء والانتهاء)" : "Quota Validity Period (Start & End Dates)"}
                </Label>
                {(newAssignStartDate || newAssignEndDate) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() => { setNewAssignStartDate(""); setNewAssignEndDate(""); }}
                  >
                    <X className="w-3 h-3 mr-1" />
                    {lang === "ar" ? "مسح التواريخ" : "Clear Dates"}
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="new-quota-start-date" className="text-[11px] text-muted-foreground">
                    {lang === "ar" ? "تاريخ البدء:" : "Start Date:"}
                  </Label>
                  <Input
                    id="new-quota-start-date"
                    type="date"
                    value={newAssignStartDate}
                    onChange={(e) => setNewAssignStartDate(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-quota-end-date" className="text-[11px] text-muted-foreground">
                    {lang === "ar" ? "تاريخ الانتهاء:" : "End Date:"}
                  </Label>
                  <Input
                    id="new-quota-end-date"
                    type="date"
                    min={newAssignStartDate || undefined}
                    value={newAssignEndDate}
                    onChange={(e) => setNewAssignEndDate(e.target.value)}
                    className={`h-8 text-xs font-mono ${
                      newAssignStartDate && newAssignEndDate && newAssignEndDate < newAssignStartDate
                        ? "border-destructive focus-visible:ring-destructive text-destructive font-semibold"
                        : ""
                    }`}
                  />
                </div>
              </div>

              {/* Quick Period Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {lang === "ar" ? "فترات جاهزة:" : "Presets:"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => applyDatePreset("30d", setNewAssignStartDate, setNewAssignEndDate, newAssignStartDate)}
                >
                  {lang === "ar" ? "+30 يوم" : "+30 Days"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => applyDatePreset("endOfMonth", setNewAssignStartDate, setNewAssignEndDate, newAssignStartDate)}
                >
                  {lang === "ar" ? "نهاية الشهر" : "End of Month"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => applyDatePreset("90d", setNewAssignStartDate, setNewAssignEndDate, newAssignStartDate)}
                >
                  {lang === "ar" ? "+90 يوم" : "+90 Days"}
                </Button>
              </div>

              {newAssignStartDate && newAssignEndDate && (
                newAssignEndDate < newAssignStartDate ? (
                  <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-1.5 flex items-center gap-1.5 font-medium animate-in fade-in">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {lang === "ar"
                        ? `⚠️ تاريخ الانتهاء (${newAssignEndDate}) يسبق تاريخ البدء (${newAssignStartDate})! يرجى تصحيح التاريخ أو السنة (مثلاً 2026 بدلاً من 2020).`
                        : `⚠️ End date (${newAssignEndDate}) is earlier than start date (${newAssignStartDate})! Please correct the date or year (e.g. 2026 instead of 2020).`}
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground bg-muted/50 border border-border/40 rounded px-2.5 py-1.5 flex items-center justify-between">
                    <span>{lang === "ar" ? "مدة الصلاحية:" : "Active Duration:"}</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {Math.ceil((new Date(newAssignEndDate).getTime() - new Date(newAssignStartDate).getTime()) / (1000 * 60 * 60 * 24))} {lang === "ar" ? "يوم" : "days"}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignNewOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleAssignNewQuota}
              disabled={
                setQuotaMutation.isPending ||
                !newAssignCompanyId ||
                !newAssignQuota ||
                Boolean(newAssignStartDate && newAssignEndDate && newAssignEndDate < newAssignStartDate)
              }
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/25 rounded-xl cursor-pointer"
            >
              {setQuotaMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {lang === "ar" ? "جاري الحفظ..." : "Saving..."}
                </>
              ) : (
                lang === "ar" ? "تعيين الحصة" : "Assign Quota"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Global Cost Breakdown Modal */}
      <Dialog open={showModelCostModal} onOpenChange={setShowModelCostModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-purple-400" />
              {lang === "ar" ? "تفاصيل التكلفة حسب النموذج" : "Cost Breakdown by Model"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar" 
                ? "إجمالي الاستهلاك والتكلفة التقديرية مقسمة حسب كل نموذج ذكاء اصطناعي لجميع الشركات هذا الشهر." 
                : "Total usage and estimated cost broken down by AI model across all companies this month."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="text-left p-3 font-medium text-muted-foreground">{lang === "ar" ? "النموذج" : "Model"}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{lang === "ar" ? "المزود" : "Provider"}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{lang === "ar" ? "مدخلات (Input)" : "Input Tokens"}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{lang === "ar" ? "مخرجات (Output)" : "Output Tokens"}</th>
                  <th className="text-right p-3 font-medium text-emerald-500/90">{lang === "ar" ? `التكلفة (${CURRENCIES[selectedCurrency].code})` : `Total Cost (${CURRENCIES[selectedCurrency].code})`}</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border/30">
                {modelCostBreakdown.length ? (
                  modelCostBreakdown.map((m, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="p-3 font-medium">
                        <span className="font-mono bg-muted/50 px-2 py-1 rounded">{m.model}</span>
                      </td>
                      <td className="p-3 text-muted-foreground">{m.provider}</td>
                      <td className="p-3 text-right tabular-nums">{m.inputTokens.toLocaleString()}</td>
                      <td className="p-3 text-right tabular-nums">{m.outputTokens.toLocaleString()}</td>
                      <td className="p-3 text-right font-semibold text-emerald-400 tabular-nums">
                        {formatCost(m.costUsd, selectedCurrency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center p-6 text-muted-foreground">
                      {lang === "ar" ? "لا توجد بيانات تكلفة مسجلة للشركات ذات الحصة حتى الآن." : "No cost data recorded for quota companies yet."}
                    </td>
                  </tr>
                )}
                {/* Total Row */}
                {modelCostBreakdown.length > 0 && (
                  <tr className="bg-muted/20 font-bold border-t-2 border-border/50">
                    <td colSpan={2} className="p-3">{lang === "ar" ? "الإجمالي" : "Total"}</td>
                    <td className="p-3 text-right tabular-nums">
                      {modelCostBreakdown.reduce((acc, m) => acc + m.inputTokens, 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {modelCostBreakdown.reduce((acc, m) => acc + m.outputTokens, 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-emerald-400 tabular-nums">
                      {formatCost(modelCostBreakdown.reduce((acc, m) => acc + m.costUsd, 0), selectedCurrency)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowModelCostModal(false)}>
              {lang === "ar" ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Individual Client Quota Bill Modal */}
      <Dialog open={!!billTarget} onOpenChange={(open) => !open && setBillTarget(null)}>
        <DialogContent className="max-w-2xl sm:max-w-3xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
          {billTarget && (() => {
            const usage = companyUsageMap.get(billTarget.id);
            const totalTokens = usage?.tokens ?? 0;
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;
            const messages = usage?.messages ?? 0;
            const cost = usage?.cost ?? 0;
            const inCost = totalTokens > 0 && cost > 0 ? (inputTokens / totalTokens) * cost : 0;
            const outCost = totalTokens > 0 && cost > 0 ? (outputTokens / totalTokens) * cost : 0;
            const quota = billTarget.monthlyTokenQuota ?? 0;
            const percent = quota > 0 ? (totalTokens / quota) * 100 : 0;
            const isExceeded = quota > 0 && totalTokens > quota;
            const remaining = quota > 0 ? Math.max(0, quota - totalTokens) : null;
            const effectiveModel = billTarget.aiModel || (billTarget.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : null) || "gpt-4o-mini";
            const effectiveProvider = (billTarget.aiModel ? billTarget.aiProvider : null) || (billTarget.monthlyTokenQuota ? (quotaSettings?.aiProvider || usage?.provider) : billTarget.aiProvider) || "openai";
            const invoiceNumber = `INV-Q-${billTarget.id}-${toIso(new Date()).replace(/-/g, "")}`;

            return (
              <div className="space-y-5">
                <div ref={billCardRef} className="space-y-5 p-2 bg-card rounded-xl">
                  <DialogHeader className="border-b border-border/50 pb-4">
                    <div className="flex items-center justify-between">
                      <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                          <div>{lang === "ar" ? "فاتورة استهلاك الحصة" : "Quota Usage Bill"}</div>
                          <p className="text-xs text-muted-foreground font-normal mt-0.5">
                            {lang === "ar" ? `رقم الفاتورة: ${invoiceNumber}` : `Invoice #: ${invoiceNumber}`}
                          </p>
                        </div>
                      </DialogTitle>
                      <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-muted border border-border/50 text-muted-foreground">
                        {rangeLabel}
                      </span>
                    </div>
                  </DialogHeader>

                  {/* Company & Client Info Card */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 bg-muted/30 border border-border/50 rounded-xl text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px] mb-0.5">
                        {lang === "ar" ? "الشركة:" : "Company:"}
                      </span>
                      <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                        {billTarget.name}
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px] mb-0.5">
                        {lang === "ar" ? "العميل:" : "Client:"}
                      </span>
                      <span className="font-medium text-foreground">
                        {billTarget.clientName || billTarget.clientUsername || "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px] mb-0.5">
                        {lang === "ar" ? "النموذج النشط:" : "Active Model:"}
                      </span>
                      <span className="font-mono text-amber-500 dark:text-amber-400 font-semibold">
                        {effectiveModel}
                      </span>
                      <span className="text-muted-foreground text-[10px] ml-1 uppercase">({effectiveProvider})</span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px] mb-0.5">
                        {lang === "ar" ? "الحصة المخصصة:" : "Allocated Quota:"}
                      </span>
                      <span className="font-semibold text-blue-400">
                        {formatQuota(quota)} tokens
                      </span>
                    </div>

                    {(billTarget.quotaStartDate || billTarget.quotaEndDate) && (
                      <div className="col-span-2 pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-primary" />
                          {lang === "ar" ? "فترة صلاحية الحصة:" : "Quota Validity Period:"}
                        </span>
                        <span className="font-mono text-foreground font-medium">
                          {billTarget.quotaStartDate ? billTarget.quotaStartDate.slice(0, 10) : "—"}
                          {" → "}
                          {billTarget.quotaEndDate ? billTarget.quotaEndDate.slice(0, 10) : "—"}
                        </span>
                      </div>
                    )}

                    <div className="col-span-2 pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3 text-primary" />
                        {lang === "ar" ? "بريد الإشعارات (Gmail):" : "Notification Email (Gmail):"}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono">
                        {billTarget.notificationEmail ? (
                          <span className="text-foreground font-medium">{billTarget.notificationEmail}</span>
                        ) : (
                          <span className="text-amber-500 italic text-[10px]">
                            {lang === "ar" ? "غير مسجل بالإعدادات" : "Not set in Settings"}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setShareTargetCompany(billTarget);
                            setCustomShareEmail(billTarget.notificationEmail || "");
                            setShareEmailPromptOpen(true);
                          }}
                          className="text-[10px] text-primary hover:underline ml-1"
                        >
                          {billTarget.notificationEmail ? (lang === "ar" ? "تعديل" : "Edit") : (lang === "ar" ? "+ تعيين بريد" : "+ Set email")}
                        </button>
                      </div>
                    </div>
                  </div>

                {/* Usage Progress Gauge */}
                <div className="p-3.5 bg-card border border-border/50 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {lang === "ar" ? "مستوى استهلاك الحصة:" : "Quota Utilization:"}
                    </span>
                    <span className={`font-bold ${isExceeded ? "text-red-500" : percent >= 80 ? "text-amber-500" : "text-emerald-500"}`}>
                      {percent.toFixed(1)}% {isExceeded && (lang === "ar" ? "(تجاوز الحصة)" : "(Over Quota)")}
                    </span>
                  </div>

                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isExceeded ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span>
                      {lang === "ar" ? "المستهلك:" : "Consumed:"}{" "}
                      <strong className="text-foreground">{totalTokens.toLocaleString()}</strong> tokens
                    </span>
                    <span>
                      {remaining !== null && (
                        <>
                          {lang === "ar" ? "المتبقي:" : "Remaining:"}{" "}
                          <strong className={isExceeded ? "text-red-400" : "text-foreground"}>
                            {remaining.toLocaleString()}
                          </strong> tokens
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Itemized Invoice Table */}
                <div className="border border-border/50 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border/50 text-muted-foreground">
                        <th className="text-left px-3.5 py-2.5 font-medium">{lang === "ar" ? "البند" : "Item"}</th>
                        <th className="text-right px-3.5 py-2.5 font-medium">{lang === "ar" ? "الكمية / الاستهلاك" : "Quantity / Usage"}</th>
                        <th className="text-right px-3.5 py-2.5 font-medium">{lang === "ar" ? "التكلفة التقديرية" : "Est. Cost"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      <tr>
                        <td className="px-3.5 py-2 text-foreground font-medium">
                          {lang === "ar" ? "رسائل المحادثة (Chat Messages)" : "Total Chat Messages"}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular-nums">{messages.toLocaleString()} msgs</td>
                        <td className="px-3.5 py-2 text-right text-muted-foreground">—</td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2 text-foreground font-medium">
                          {lang === "ar" ? "رموز المدخلات (Input Tokens)" : "Input Tokens"}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular-nums">{inputTokens.toLocaleString()} tokens</td>
                        <td className="px-3.5 py-2 text-right text-muted-foreground tabular-nums font-mono">
                          {formatCost(inCost, selectedCurrency)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2 text-foreground font-medium">
                          {lang === "ar" ? "رموز المخرجات (Output Tokens)" : "Output Tokens"}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular-nums">{outputTokens.toLocaleString()} tokens</td>
                        <td className="px-3.5 py-2 text-right text-muted-foreground tabular-nums font-mono">
                          {formatCost(outCost, selectedCurrency)}
                        </td>
                      </tr>
                      <tr className="bg-muted/10 font-medium">
                        <td className="px-3.5 py-2 text-foreground">
                          {lang === "ar" ? "إجمالي الرموز المستهلكة" : "Total Consumed Tokens"}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular-nums font-bold text-foreground">
                          {totalTokens.toLocaleString()} tokens
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold text-emerald-400 tabular-nums font-mono">
                          {formatCost(cost, selectedCurrency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Grand Total Box */}
                <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <div>
                    <span className="text-xs text-muted-foreground block">
                      {lang === "ar" ? "إجمالي الفاتورة المستحقة للفترة:" : "Total Amount for Period:"}
                    </span>
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {isExceeded
                        ? (lang === "ar" ? "تجاوز استهلاك الحصة المسموحة" : "Exceeded assigned quota")
                        : (lang === "ar" ? "مغطى بالكامل ضمن الحصة الشهرية" : "Covered within monthly quota")}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-emerald-500 font-mono">
                      {formatCost(cost, selectedCurrency)}
                    </span>
                    <span className="text-[11px] text-muted-foreground block">{CURRENCIES[selectedCurrency].code}</span>
                  </div>
                </div>
                </div>

                {/* Footer Actions */}
                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-border/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => handleCopyBill(billTarget)}
                    >
                      {copiedBill ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {lang === "ar" ? "نسخ الملخص" : "Copy Summary"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={handlePrint}
                    >
                      <Printer className="w-3.5 h-3.5 text-blue-400" />
                      {lang === "ar" ? "طباعة" : "Print"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      onClick={() => handleDownloadInvoiceImage(billTarget)}
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-500" />
                      {lang === "ar" ? "تحميل الصورة" : "Download Image"}
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      disabled={isSharingBill}
                      onClick={() => handleShareBill(billTarget)}
                      title={billTarget.notificationEmail ? `Send to ${billTarget.notificationEmail}` : (lang === "ar" ? "مشاركة الفاتورة عبر البريد" : "Share bill via email")}
                    >
                      {isSharingBill ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {lang === "ar" ? "جاري المشاركة..." : "Sharing..."}
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          {lang === "ar" ? "مشاركة" : "Share"}
                        </>
                      )}
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setBillTarget(null)}>
                    {lang === "ar" ? "إغلاق" : "Close"}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Share Bill Email Prompt Modal (when company doesn't have an email or admin wants to change it) */}
      <Dialog open={shareEmailPromptOpen} onOpenChange={setShareEmailPromptOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emerald-500" />
              {lang === "ar" ? "مشاركة الفاتورة عبر البريد الإلكتروني" : "Share Bill via Email"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "إرسال صورة وبيانات الفاتورة إلى بريد الإشعارات (Gmail)."
                : "Send bill invoice screenshot and itemized details to the notification Gmail address."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="custom-share-email" className="flex items-center gap-1.5 text-xs">
                <Mail className="w-3.5 h-3.5 text-primary" />
                {lang === "ar" ? "البريد الإلكتروني للإشعارات (Gmail)" : "Notification Email (Gmail)"}
              </Label>
              <Input
                id="custom-share-email"
                type="email"
                placeholder={lang === "ar" ? "أدخل بريد Gmail لتلقي الفاتورة" : "Enter Gmail address to receive bill"}
                value={customShareEmail}
                onChange={(e) => setCustomShareEmail(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "سيتم إرسال صورة الفاتورة إلى هذا البريد وحفظه تلقائياً كبريد إشعارات لهذه الشركة."
                  : "The invoice image will be sent to this email and saved as the notification email for this company."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareEmailPromptOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={isSharingBill || !customShareEmail.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => {
                if (shareTargetCompany) {
                  executeShare(shareTargetCompany, customShareEmail.trim());
                }
              }}
            >
              {isSharingBill ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {lang === "ar" ? "جاري الإرسال..." : "Sending..."}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {lang === "ar" ? "إرسال الفاتورة" : "Send Bill"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* All Client Bills Summary Modal */}
      <Dialog open={showAllBillsModal} onOpenChange={setShowAllBillsModal}>
        <DialogContent className="max-w-5xl sm:max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader className="border-b border-border/50 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                <Receipt className="w-5 h-5 text-emerald-400" />
                {lang === "ar" ? "كشف فواتير استهلاك الحصص لجميع الشركات" : "All Client Quota Invoices Summary"}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-muted border border-border/50 text-muted-foreground">
                  {rangeLabel}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 shadow-sm"
                  onClick={exportToCSV}
                  title={lang === "ar" ? "تحميل كشف الحصص كملف CSV / Excel" : "Download summary as CSV / Excel"}
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  {lang === "ar" ? "تحميل الكشف (CSV)" : "Download (CSV)"}
                </Button>
              </div>
            </div>
            <DialogDescription>
              {lang === "ar"
                ? "ملخص الفواتير والتكلفة التقديرية لكل شركة بناءً على استهلاك الرموز الفعلية للفترة المحددة."
                : "Invoice summary and estimated AI cost per company based on token quota usage for the selected period."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="text-left p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "الشركة" : "Company"}</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "العميل" : "Client"}</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "النموذج" : "Model"}</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "الحصة" : "Quota"}</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground whitespace-nowrap">{lang === "ar" ? "تاريخ البدء" : "Start Date"}</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground whitespace-nowrap">{lang === "ar" ? "تاريخ الانتهاء" : "End Date"}</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "الرموز المستهلكة" : "Tokens Used"}</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "الرسائل" : "Messages"}</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "النسبة" : "Quota %"}</th>
                  <th className="text-right p-2.5 font-medium text-emerald-500 font-bold">{lang === "ar" ? `الفاتورة (${CURRENCIES[selectedCurrency].code})` : `Bill (${CURRENCIES[selectedCurrency].code})`}</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">{lang === "ar" ? "إجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border/30">
                {filteredAndSortedCompanies.map((c) => {
                  const usage = companyUsageMap.get(c.id);
                  const tokens = usage?.tokens ?? 0;
                  const cost = usage?.cost ?? 0;
                  const quota = c.monthlyTokenQuota ?? 0;
                  const pct = quota > 0 ? (tokens / quota) * 100 : 0;
                  const effectiveModel = c.aiModel || (c.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : null) || "gpt-4o-mini";

                  return (
                    <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-2.5 font-medium text-foreground">{c.name}</td>
                      <td className="p-2.5 text-muted-foreground">{c.clientName || c.clientUsername || "—"}</td>
                      <td className="p-2.5 font-mono text-[11px] text-amber-500">{effectiveModel}</td>
                      <td className="p-2.5 text-right font-mono">{formatQuota(quota)}</td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                        {c.quotaStartDate ? c.quotaStartDate.slice(0, 10) : "—"}
                      </td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                        {c.quotaEndDate ? c.quotaEndDate.slice(0, 10) : "—"}
                      </td>
                      <td className="p-2.5 text-right font-mono font-medium">{tokens.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono text-muted-foreground">{(usage?.messages ?? 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono">
                        <span className={pct > 100 ? "text-red-500 font-bold" : pct >= 80 ? "text-amber-500 font-semibold" : "text-emerald-500"}>
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-bold text-emerald-400 font-mono">
                        {formatCost(cost, selectedCurrency)}
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-emerald-500 hover:text-emerald-400"
                            onClick={() => {
                              setShowAllBillsModal(false);
                              setBillTarget(c);
                            }}
                          >
                            <Receipt className="w-3 h-3 mr-1" />
                            {lang === "ar" ? "عرض" : "View"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            title={lang === "ar" ? "تحميل صورة الفاتورة" : "Download invoice image"}
                            onClick={() => handleDownloadInvoiceImage(c)}
                          >
                            <Download className="w-3 h-3 mr-1 text-emerald-500" />
                            {lang === "ar" ? "تحميل" : "Download"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="bg-muted/30 font-bold border-t-2 border-border/60">
                  <td colSpan={3} className="p-2.5 text-foreground">{lang === "ar" ? "الإجمالي الكلي" : "Grand Total"}</td>
                  <td className="p-2.5 text-right font-mono">{formatQuota(totalAllocatedQuota)}</td>
                  <td colSpan={2}></td>
                  <td className="p-2.5 text-right font-mono text-foreground">{totalTokensConsumedMonth.toLocaleString()}</td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">
                    {filteredAndSortedCompanies.reduce((s, c) => s + (companyUsageMap.get(c.id)?.messages ?? 0), 0).toLocaleString()}
                  </td>
                  <td className="p-2.5 text-right font-mono text-muted-foreground">
                    {totalAllocatedQuota > 0 ? `${((totalTokensConsumedMonth / totalAllocatedQuota) * 100).toFixed(1)}%` : "0%"}
                  </td>
                  <td className="p-2.5 text-right text-emerald-400 font-mono text-sm">
                    {formatCost(totalCostConsumedMonth, selectedCurrency)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-border/50 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                {lang === "ar" ? "طباعة الكشف" : "Print Summary"}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                onClick={exportToCSV}
              >
                <Download className="w-3.5 h-3.5" />
                {lang === "ar" ? "تحميل الكشف (CSV)" : "Download Summary (CSV)"}
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowAllBillsModal(false)}>
              {lang === "ar" ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
