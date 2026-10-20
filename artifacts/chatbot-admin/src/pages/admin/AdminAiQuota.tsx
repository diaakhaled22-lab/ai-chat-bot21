import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import QuotaAICard from "@/components/QuotaAICard";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  Building2,
  Search,
  Loader2,
  X,
  Coins,
  Cpu,
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
  Mail
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
}): string {
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

  drawRow("رسائل المحادثة (Total Messages)", `${data.messages.toLocaleString()} msgs`, "—");
  drawRow("رموز المدخلات (Input Tokens)", `${data.inputTokens.toLocaleString()} tokens`, `$${(data.inputTokens * 0.00000015).toFixed(4)}`);
  drawRow("رموز المخرجات (Output Tokens)", `${data.outputTokens.toLocaleString()} tokens`, `$${(data.outputTokens * 0.0000006).toFixed(4)}`);
  drawRow("إجمالي الاستهلاك والتكلفة", `${data.totalTokens.toLocaleString()} tokens`, `$${data.cost.toFixed(4)} USD`, true);

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
  ctx.fillText(`$${data.cost.toFixed(4)}`, tableX + 16, currentY + 34);
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("USD", tableX + 16, currentY + 47);

  ctx.textAlign = "center";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("نظام إدارة الحصص والذكاء الاصطناعي — Bot Manager AI Quota System", width / 2, height - 12);

  return canvas.toDataURL("image/png");
}

function generateTopupInvoiceCanvas(data: TopupInvoiceData): string {
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

  drawRow("⚡ الباقة المضافة (Top-up Tokens)", `+${data.addedTokens.toLocaleString()}`, `$${data.price.toFixed(2)}`, true);
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
  ctx.fillText(`$${data.price.toFixed(2)}`, tableX + 16, currentY + 34);
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText("USD", tableX + 16, currentY + 47);

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
  const [quotaInput, setQuotaInput] = useState("");
  const [quotaStartDate, setQuotaStartDate] = useState("");
  const [quotaEndDate, setQuotaEndDate] = useState("");
  const [showModelCostModal, setShowModelCostModal] = useState(false);

  // Top-up Package & Bill State
  const [quotaModalTab, setQuotaModalTab] = useState<"base" | "topup">("base");
  const [topupTokens, setTopupTokens] = useState<number>(50_000);
  const [topupPrice, setTopupPrice] = useState<string>("10.00");
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
    }: {
      companyId: number;
      quota: number | null;
      quotaStartDate?: string | null;
      quotaEndDate?: string | null;
    }) =>
      customFetch(`/api/admin/companies/${companyId}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyTokenQuota: quota,
          quotaStartDate,
          quotaEndDate,
        }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<Company[]>(["admin-companies"], (old) => {
        if (!old) return old;
        return old.map((c) =>
          c.id === variables.companyId
            ? {
                ...c,
                monthlyTokenQuota: variables.quota,
                quotaStartDate: variables.quotaStartDate,
                quotaEndDate: variables.quotaEndDate,
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

    setQuotaMutation.mutate({
      companyId: quotaTarget.id,
      quota,
      quotaStartDate: safeStart,
      quotaEndDate: safeEnd,
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
        currency: "USD",
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
      `${lang === "ar" ? "المبلغ الإجمالي" : "Total Paid"}: $${topupInvoice.price.toFixed(2)} USD`,
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
      (c) => typeof c.monthlyTokenQuota === "number" && c.monthlyTokenQuota > 0
    );
  }, [companies]);

  const companiesWithoutQuota = useMemo(() => {
    return companies.filter(
      (c) => !c.monthlyTokenQuota || c.monthlyTokenQuota <= 0
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
      "Cost (USD)"
    ];
    
    const rows = filteredAndSortedCompanies.map(c => {
      const hasQuota = typeof c.monthlyTokenQuota === "number" && c.monthlyTokenQuota > 0;
      const usage = companyUsageMap.get(c.id);
      const tokensUsed = hasQuota ? (usage?.tokens ?? 0) : 0;
      const percent = hasQuota && c.monthlyTokenQuota ? (tokensUsed / c.monthlyTokenQuota) * 100 : 0;
      const cost = hasQuota ? (usage?.cost ?? 0) : 0;

      const effectiveModel = hasQuota
        ? (quotaSettings?.aiModel || usage?.model || "gpt-4o-mini")
        : (c.aiModel || "—");

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
        cost.toFixed(4)
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
    const effectiveModel = (c.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : c.aiModel) || "gpt-4o-mini";
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
      `${lang === "ar" ? "إجمالي التكلفة التقديرية" : "Total Estimated Cost"}: $${cost.toFixed(4)} USD`,
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
      const effectiveModel = (company.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : company.aiModel) || "gpt-4o-mini";
      const effectiveProvider = (company.monthlyTokenQuota ? (quotaSettings?.aiProvider || usage?.provider) : company.aiProvider) || "openai";

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
      const effectiveModel = (company.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : company.aiModel) || "gpt-4o-mini";
      const effectiveProvider = (company.monthlyTokenQuota ? (quotaSettings?.aiProvider || usage?.provider) : company.aiProvider) || "openai";

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

  return (
    <div className="space-y-8">
      {/* Header with Unified Date Range Filter */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Cpu className="w-8 h-8 text-violet-400" />
            {lang === "ar" ? "الذكاء الاصطناعي وإدارة الحصص (AI / Quota)" : "AI / Quota Management"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {lang === "ar"
              ? "تكوين نموذج الدعم الفني بالذكاء الاصطناعي، ومراقبة وتحديد حصص الرموز (Token Quotas) لشركات العملاء."
              : "Configure the Support AI Agent model, and monitor & assign monthly token quotas to companies."}
          </p>
        </div>

        {/* Global Date Filter Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 self-start md:self-auto">
          <div className="flex items-center gap-1 bg-muted/40 border border-border/50 rounded-lg p-1 overflow-x-auto max-w-full">
            <Calendar className="w-3.5 h-3.5 text-primary ml-1.5 shrink-0" />
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setActiveRange(opt.key); setShowCustom(false); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                  !showCustom && activeRange === opt.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {lang === "ar" ? opt.labelAr : opt.labelEn}
              </button>
            ))}
            <button
              onClick={() => setShowCustom((v) => !v)}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
                showCustom
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span>{lang === "ar" ? "مخصص" : "Custom"}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {showCustom && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1 shadow-sm text-xs">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-transparent text-foreground outline-none text-xs"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={toIso(new Date())}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-transparent text-foreground outline-none text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons & Period Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground bg-muted/40 border border-border/50 px-3 py-1.5 rounded-md flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          <span>{lang === "ar" ? "الفترة المعروضة:" : "Showing:"}</span>
          <span className="text-foreground font-semibold">{rangeLabel}</span>
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50"
            disabled={!filteredAndSortedCompanies.length}
            onClick={() => setShowAllBillsModal(true)}
          >
            <Receipt className="w-4 h-4 text-emerald-500" />
            {lang === "ar" ? "كشف فواتير العملاء" : "Client Invoices"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!modelCostBreakdown.length}
            onClick={() => setShowModelCostModal(true)}
          >
            <PieChart className="w-4 h-4 text-purple-400" />
            {lang === "ar" ? "تفاصيل التكلفة" : "Cost Breakdown"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportToCSV}
          >
            <Download className="w-4 h-4 text-emerald-400" />
            {lang === "ar" ? "تصدير CSV" : "Export CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
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
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              {lang === "ar" ? "إجمالي الحصص المخصصة" : "Total Allocated Quota"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatQuota(totalAllocatedQuota)} <span className="text-xs font-normal text-muted-foreground">tokens</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {companiesWithQuota.length} {lang === "ar" ? "شركات بحصص محددة" : "companies with set quotas"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              {lang === "ar" ? `استهلاك الرموز (${rangeLabel})` : `Tokens Consumed (${rangeLabel})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {totalTokensConsumedMonth.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ${totalCostConsumedMonth.toFixed(4)} {lang === "ar" ? "التكلفة التقديرية" : "est. cost"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              {lang === "ar" ? "الشركات ذات الحصة" : "Companies with Quota"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {companiesWithQuota.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {companiesWithQuota.filter((c) => c.isActive).length} {lang === "ar" ? "نشطة حالياً" : "currently active"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Feature 1: Charts Section */}
      {topCompaniesData.length > 0 && (
        <Card className="bg-card border-border/50">
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
                      <Cell key={`cell-${index}`} fill="hsl(var(--primary))" className="opacity-80 hover:opacity-100 transition-opacity" />
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
                className="h-9 gap-1.5 text-xs"
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
                className="pl-9 h-9 text-xs"
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
              <SelectTrigger className="w-full sm:w-48 h-9 text-xs">
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
          </div>
        </div>

        <Card className="bg-card border-border/50 overflow-hidden">
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
                      {lang === "ar" ? "التكلفة" : "Cost"} <SortIcon col="cost" sortKey={sortKey} sortDir={sortDir} />
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
                    const hasQuota = typeof c.monthlyTokenQuota === "number" && c.monthlyTokenQuota > 0;
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

                    const effectiveModel = (hasQuota ? (quotaSettings?.aiModel || usage?.model) : c.aiModel) || "gpt-4o-mini";
                    const effectiveProvider = (hasQuota ? (quotaSettings?.aiProvider || usage?.provider) : c.aiProvider) || "openai";

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
                            <span className="font-mono text-[11px] font-semibold text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded w-fit inline-block">
                              {effectiveModel}
                            </span>
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
                          {hasQuota ? `$${cost.toFixed(4)}` : "—"}
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
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-7 text-[11px] gap-1 font-medium ${
                                percentFloat! >= 100
                                  ? "text-amber-500 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 animate-pulse"
                                  : "text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/10 hover:border-purple-500/50"
                              }`}
                              onClick={() => openQuotaDialog(c, "topup")}
                              title={lang === "ar" ? "شحن باقة إضافية وفاتورة" : "Add Top-up Package & Bill"}
                            >
                              <PackagePlus className="w-3 h-3" />
                              {lang === "ar" ? "+ باقة" : "+ Top-up"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                              onClick={() => setBillTarget(c)}
                            >
                              <Receipt className="w-3 h-3 text-emerald-500" />
                              {lang === "ar" ? "الفاتورة" : "Bill"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] gap-1 text-blue-500 hover:text-blue-600 border-blue-500/30 hover:border-blue-500/50"
                              onClick={() => openQuotaDialog(c, "base")}
                            >
                              <TrendingUp className="w-3 h-3 text-blue-400" />
                              {lang === "ar" ? "الحصة" : "Quota"}
                            </Button>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
              <div className="space-y-1.5">
                <Label htmlFor="quota-input-ai">
                  {lang === "ar" ? "الحصة الشهرية (رموز / Tokens)" : "Monthly Token Quota"}
                </Label>
                <div className="relative">
                  <Input
                    id="quota-input-ai"
                    placeholder={lang === "ar" ? "مثال: 1000000 أو اتركه فارغاً لتعطيل الحصة" : "e.g. 1000000 (leave blank to disable quota)"}
                    value={quotaInput}
                    onChange={(e) => setQuotaInput(e.target.value.replace(/[^0-9]/g, ""))}
                    className="font-mono text-sm"
                  />
                  {quotaInput && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      ≈ {formatQuota(Number(quotaInput))}
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
                      variant={quotaInput === String(p.value) ? "default" : "outline"}
                      className="text-xs h-7"
                      onClick={() => setQuotaInput(String(p.value))}
                    >
                      {p.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 text-muted-foreground"
                    onClick={() => setQuotaInput("")}
                  >
                    <X className="w-3 h-3 mr-1" />
                    {lang === "ar" ? "تعطيل الحصة" : "Clear — Disable Quota"}
                  </Button>
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

              {quotaTarget?.monthlyTokenQuota && (
                <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span>{lang === "ar" ? "الحصة الحالية:" : "Current Quota:"}</span>
                    <span className="font-semibold text-foreground">{formatQuota(quotaTarget.monthlyTokenQuota)} tokens / month</span>
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
                          setTopupPrice(p.defaultPrice);
                        }}
                      >
                        <span>{p.label}</span>
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
                    {lang === "ar" ? "سعر الباقة للفاتورة ($ USD):" : "Invoice Price ($ USD):"}
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
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                      USD
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
                    ${Number(topupPrice || 0).toFixed(2)} USD
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                      ${topupInvoice.price.toFixed(2)} USD
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                  <th className="text-right p-3 font-medium text-emerald-500/90">{lang === "ar" ? "التكلفة" : "Total Cost"}</th>
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
                        ${m.costUsd.toFixed(4)}
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
                      ${modelCostBreakdown.reduce((acc, m) => acc + m.costUsd, 0).toFixed(4)}
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
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {billTarget && (() => {
            const usage = companyUsageMap.get(billTarget.id);
            const totalTokens = usage?.tokens ?? 0;
            const inputTokens = usage?.inputTokens ?? 0;
            const outputTokens = usage?.outputTokens ?? 0;
            const messages = usage?.messages ?? 0;
            const cost = usage?.cost ?? 0;
            const quota = billTarget.monthlyTokenQuota ?? 0;
            const percent = quota > 0 ? (totalTokens / quota) * 100 : 0;
            const isExceeded = quota > 0 && totalTokens > quota;
            const remaining = quota > 0 ? Math.max(0, quota - totalTokens) : null;
            const effectiveModel = (billTarget.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : billTarget.aiModel) || "gpt-4o-mini";
            const effectiveProvider = (billTarget.monthlyTokenQuota ? (quotaSettings?.aiProvider || usage?.provider) : billTarget.aiProvider) || "openai";
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
                        <td className="px-3.5 py-2 text-right text-muted-foreground tabular-nums">
                          ${((inputTokens / 1_000_000) * (cost > 0 && totalTokens > 0 ? (cost / totalTokens) * 1_000_000 : 0)).toFixed(4)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3.5 py-2 text-foreground font-medium">
                          {lang === "ar" ? "رموز المخرجات (Output Tokens)" : "Output Tokens"}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular-nums">{outputTokens.toLocaleString()} tokens</td>
                        <td className="px-3.5 py-2 text-right text-muted-foreground tabular-nums">
                          ${((outputTokens / 1_000_000) * (cost > 0 && totalTokens > 0 ? (cost / totalTokens) * 1_000_000 : 0)).toFixed(4)}
                        </td>
                      </tr>
                      <tr className="bg-muted/10 font-medium">
                        <td className="px-3.5 py-2 text-foreground">
                          {lang === "ar" ? "إجمالي الرموز المستهلكة" : "Total Consumed Tokens"}
                        </td>
                        <td className="px-3.5 py-2 text-right font-mono tabular-nums font-bold text-foreground">
                          {totalTokens.toLocaleString()} tokens
                        </td>
                        <td className="px-3.5 py-2 text-right font-bold text-emerald-400 tabular-nums">
                          ${cost.toFixed(4)}
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
                      ${cost.toFixed(4)}
                    </span>
                    <span className="text-[11px] text-muted-foreground block">USD</span>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                  <th className="text-right p-2.5 font-medium text-emerald-500 font-bold">{lang === "ar" ? "الفاتورة" : "Bill (USD)"}</th>
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
                  const effectiveModel = (c.monthlyTokenQuota ? (quotaSettings?.aiModel || usage?.model) : c.aiModel) || "gpt-4o-mini";

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
                        ${cost.toFixed(4)}
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
                    ${totalCostConsumedMonth.toFixed(4)}
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
