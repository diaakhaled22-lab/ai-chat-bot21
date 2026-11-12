import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useGetMe } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Receipt,
  Mail,
  MessageCircle,
  Copy,
  Check,
  Search,
  Filter,
  Download,
  Printer,
  Share2,
  RefreshCw,
  ExternalLink,
  Building2,
  User,
  Calendar,
  Coins,
  DollarSign,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  FileText,
  Send,
  Eye,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  List,
  CalendarRange,
  Hourglass,
  Ban,
  Trash2,
  Pause,
  Play,
  CreditCard,
  Smartphone,
  MoreVertical,
} from "lucide-react";

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  ticketId?: number | null;
  companyId?: number | null;
  companyName: string;
  clientId: number;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  itemType: "plan" | "topup" | "quota_usage";
  titleAr: string;
  titleEn: string;
  billingCycleAr: string;
  billingCycleEn: string;
  tokenQuota: number;
  tokensUsed?: number;
  priceUsd: number;
  priceLocal: number;
  currencySymbol: string;
  periodStart?: string;
  periodEnd?: string;
  endDate?: string;
  retentionDays?: number | null;
  channels?: string[];
  tools?: string[];
  state: "active" | "pending" | "voided" | "paused";
  isVoided?: boolean;
  voidReason?: string;
  isPaused?: boolean;
  pauseReason?: string;
  tokensWithheld?: number;
  isPaid: boolean;
  status: "paid" | "activated" | "pending" | "paused";
  issueDate: string;
  notes?: string;
  paymentPhone?: string | null;
  paymentInstaPay?: string | null;
}

export interface CompanyInvoiceGroup {
  companyKey: string;
  companyId?: number | null;
  companyName: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  invoices: InvoiceItem[];
  totalInvoices: number;
  totalTokens: number;
  totalUsd: number;
  paidCount: number;
  unpaidCount: number;
  pendingStateCount: number;
  activeStateCount: number;
  pausedCount?: number;
  voidedCount?: number;
  latestDate: string;
}

interface InvoicesApiResponse {
  ok: boolean;
  invoices: InvoiceItem[];
  totalCount: number;
  rates?: Record<string, number>;
}

const SUPPORTED_CURRENCIES: Record<string, { code: string; labelAr: string; labelEn: string; symbol: string; rate: number }> = {
  USD: { code: "USD", labelAr: "دولار أمريكي", labelEn: "US Dollar", symbol: "$", rate: 1.0 },
  SAR: { code: "SAR", labelAr: "ريال سعودي", labelEn: "Saudi Riyal", symbol: "ر.س", rate: 3.75 },
  AED: { code: "AED", labelAr: "درهم إماراتي", labelEn: "UAE Dirham", symbol: "د.إ", rate: 3.67 },
  EGP: { code: "EGP", labelAr: "جنيه مصري", labelEn: "Egyptian Pound", symbol: "ج.م", rate: 50.0 },
  KWD: { code: "KWD", labelAr: "دينار كويتي", labelEn: "Kuwaiti Dinar", symbol: "د.ك", rate: 0.31 },
  EUR: { code: "EUR", labelAr: "يورو أوروبي", labelEn: "Euro", symbol: "€", rate: 0.92 },
};


function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number]
) {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

function generateInvoiceCardCanvas(
  inv: InvoiceItem,
  lang: string,
  currencyInfo: { code: string; symbol: string; rate: number },
  customEndDate?: string | null
): string {
  const width = 640;
  const isUnpaid = inv.isPaid === false;
  const hasPaymentDetails = isUnpaid && Boolean(inv.paymentPhone || inv.paymentInstaPay);

  // Helper to format clean dates (matching small image / AdminAiQuota)
  const formatCardDate = (d: any): string => {
    if (!d) return "";
    try {
      const dt = new Date(d);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString();
      }
    } catch {}
    return String(d).split("T")[0];
  };

  const startStr = formatCardDate(inv.issueDate || inv.periodStart);
  const rawEnd = customEndDate || inv.endDate || inv.periodEnd;
  const endStr = formatCardDate(rawEnd);
  const validityPeriod = startStr && endStr ? `${startStr} → ${endStr}` : (endStr || startStr || "ساري المفعول");

  // Proportional snug height without large empty white voids
  const height = hasPaymentDetails ? 550 : 396;
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

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  drawRoundRect(ctx, 0, 0, width, height, 16);
  ctx.stroke();

  // Header Banner
  const grad = ctx.createLinearGradient(0, 0, width, 110);
  if (isUnpaid) {
    grad.addColorStop(0, "#d97706");
    grad.addColorStop(1, "#b45309");
  } else {
    grad.addColorStop(0, "#10b981");
    grad.addColorStop(1, "#059669");
  }
  ctx.fillStyle = grad;
  drawRoundRect(ctx, 0, 0, width, 110, [16, 16, 0, 0]);
  ctx.fill();

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  const cardTitle = (lang === "ar" ? inv.titleAr : inv.titleEn) || inv.titleAr || inv.titleEn || (lang === "ar" ? "فاتورة رسمية معتمدة" : "Official Certified Invoice");
  ctx.fillText(
    `${cardTitle} — Bot Manager`,
    width / 2,
    40
  );

  ctx.font = "12px monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillText(`Invoice #: ${inv.invoiceNumber}`, width / 2, 65);

  // Status Badge in header
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  drawRoundRect(ctx, width / 2 - 130, 75, 260, 24, 12);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillText(
    isUnpaid
      ? (lang === "ar" ? "⏳ فاتورة غير مسددة (معلقة)" : "⏳ Unpaid Invoice (Pending)")
      : (lang === "ar" ? "✅ فاتورة مسددة ومعتمدة" : "✅ Paid & Verified"),
    width / 2,
    91
  );

  // Helper
  const drawCard = (x: number, y: number, w: number, h: number, title: string, value: string, color = "#111827") => {
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#e2e8f0";
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(title, x + w - 12, y + 18);

    ctx.fillStyle = color;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(value, x + w - 12, y + 38);
  };

  const cardW = 286;
  const cardH = 50;
  const startY = 126;
  drawCard(334, startY, cardW, cardH, lang === "ar" ? "الشركة" : "Company", inv.companyName || "—");
  drawCard(20, startY, cardW, cardH, lang === "ar" ? "العميل" : "Client", inv.clientName || "—");

  const itemTitle = lang === "ar" ? inv.titleAr : inv.titleEn;
  drawCard(334, startY + 58, cardW, cardH, lang === "ar" ? "البند / الباقة" : "Item / Plan", itemTitle || "—", "#2563eb");
  drawCard(20, startY + 58, cardW, cardH, lang === "ar" ? "رصيد الرموز" : "Token Quota", `${inv.tokenQuota?.toLocaleString() || 0} Tokens`, "#059669");

  let currentY = startY + 116;

  // 1. Quota Validity Period pill (Matching small image / AdminAiQuota green box exactly)
  ctx.fillStyle = "#f0fdf4";
  ctx.strokeStyle = "#dcfce7";
  drawRoundRect(ctx, 20, currentY, 600, 30, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = "#166534";
  const validityText = `📅 فترة صلاحية الحصة: ${validityPeriod}`;
  ctx.fillText(validityText, width / 2, currentY + 19);

  currentY += 38;

  // 2. Total Amount Box
  ctx.fillStyle = isUnpaid ? "#fffbeb" : "#f0fdf4";
  ctx.strokeStyle = isUnpaid ? "#fde68a" : "#bbf7d0";
  drawRoundRect(ctx, 20, currentY, 600, 72, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = isUnpaid ? "#92400e" : "#166534";
  ctx.fillText(
    lang === "ar" ? "المبلغ الإجمالي المستحق:" : "Total Amount Due:",
    608,
    currentY + 24
  );

  ctx.font = "11px system-ui, sans-serif";
  ctx.fillStyle = isUnpaid ? "#b45309" : "#047857";
  const localPrice = Math.round(inv.priceUsd * (currencyInfo.rate || 50));
  ctx.fillText(
    `≈ ${localPrice.toLocaleString()} ${currencyInfo.symbol} (${currencyInfo.code})`,
    608,
    currentY + 46
  );

  ctx.textAlign = "left";
  ctx.fillStyle = isUnpaid ? "#b45309" : "#059669";
  ctx.font = "bold 26px monospace";
  ctx.fillText(`${inv.priceUsd} USD`, 36, currentY + 44);

  currentY += 80;

  // 3. Payment details if unpaid (High-Quality Fintech Presentation)
  if (hasPaymentDetails) {
    const boxH = 138;
    // Outer Payment Box
    ctx.fillStyle = "#fffbeb";
    ctx.strokeStyle = "#fcd34d";
    ctx.lineWidth = 1;
    drawRoundRect(ctx, 20, currentY, 600, boxH, 10);
    ctx.fill();
    ctx.stroke();

    // Top Header: Title (right) + Status Pill (left)
    ctx.textAlign = "right";
    ctx.fillStyle = "#92400e";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillText("💳 بيانات وطرق السداد المعتمدة (Payment Transfer Details):", 606, currentY + 20);

    const badgeW = 144;
    const badgeH = 20;
    const badgeX = 32;
    const badgeY = currentY + 6;
    ctx.fillStyle = "rgba(217, 119, 6, 0.15)";
    ctx.strokeStyle = "rgba(217, 119, 6, 0.35)";
    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillStyle = "#b45309";
    ctx.fillText("⏳ بانتظار تحويل العميل", badgeX + badgeW / 2, badgeY + 14);

    // Two dedicated sub-cards (Side-by-Side)
    const cardW_sub = 276;
    const cardH_sub = 66;

    // Sub-Card 1: Vodafone Cash / Mobile Wallet (Right side)
    const card1X = 332;
    const card1Y = currentY + 34;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#fed7aa";
    drawRoundRect(ctx, card1X, card1Y, cardW_sub, cardH_sub, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#c2410c";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText("📱 فودافون كاش ومحافظ الهاتف (Mobile Wallet):", card1X + cardW_sub - 10, card1Y + 17);

    // Inner Phone Number box
    ctx.fillStyle = "#fff7ed";
    ctx.strokeStyle = "#ffedd5";
    drawRoundRect(ctx, card1X + 8, card1Y + 25, cardW_sub - 16, 32, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(inv.paymentPhone || "01000000000", card1X + cardW_sub / 2, card1Y + 47);

    // Sub-Card 2: InstaPay IPA Address (Left side)
    const card2X = 32;
    const card2Y = currentY + 34;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#bfdbfe";
    drawRoundRect(ctx, card2X, card2Y, cardW_sub, cardH_sub, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.fillText("⚡ عنوان إنستاباي (InstaPay IPA Address):", card2X + cardW_sub - 10, card2Y + 17);

    // Inner InstaPay box
    ctx.fillStyle = "#eff6ff";
    ctx.strokeStyle = "#dbeafe";
    drawRoundRect(ctx, card2X + 8, card2Y + 25, cardW_sub - 16, 32, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "#1d4ed8";
    ctx.fillText(inv.paymentInstaPay || "username@instapay", card2X + cardW_sub / 2, card2Y + 46);

    // Bottom Instruction Note
    ctx.textAlign = "center";
    ctx.fillStyle = "#92400e";
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(
      "ℹ️ يُرجى إرسال إشعار أو لقطة شاشة التحويل بعد السداد لتأكيد العملية وتفعيل الحساب فوراً",
      width / 2,
      currentY + 124
    );

    currentY += boxH + 12;
  }

  // Footer text
  ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(
    "نظام إدارة الفواتير والحسابات — Bot Manager Billing & Invoices System",
    width / 2,
    height - 12
  );

  return canvas.toDataURL("image/png");
}

export default function AdminBills() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "plan" | "topup" | "quota_usage">("all");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "pending">("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [selectedCurrency, setSelectedCurrency] = useState("EGP");

  const { data: companies = [] } = useQuery<any[]>({
    queryKey: ["admin-companies"],
    queryFn: () => customFetch("/api/admin/companies"),
    staleTime: 30_000,
  });

  // Admin notification email from settings/profile (used ONLY as optional manual fallback)
  const settingsNotificationEmail =
    (me as any)?.notificationEmail?.trim() || "";

  const resolveInvoiceEndDate = (inv: InvoiceItem | null | undefined): string | null => {
    if (!inv) return null;
    const raw =
      inv.periodEnd ||
      inv.endDate ||
      (() => {
        if (!companies || !Array.isArray(companies)) return null;
        const comp = companies.find((c: any) => c.id === inv.companyId);
        return comp?.quotaEndDate || comp?.activationEnd || null;
      })();

    if (!raw) return null;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
    return String(raw);
  };
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [collapsedCompanies, setCollapsedCompanies] = useState<Record<string, boolean>>({});
  const [togglingInvoice, setTogglingInvoice] = useState<string | null>(null);

  // Send Copy Modal state
  const [sendCopyModalOpen, setSendCopyModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [sendViaWhatsApp, setSendViaWhatsApp] = useState(true);
  const [customNotes, setCustomNotes] = useState("");
  const [isSendingCopy, setIsSendingCopy] = useState(false);
  const [sendingInvoiceNumber, setSendingInvoiceNumber] = useState<string | null>(null);

  // Pause / Resume Modal state
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [invoiceToPause, setInvoiceToPause] = useState<InvoiceItem | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [isPausing, setIsPausing] = useState(false);

  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [invoiceToResume, setInvoiceToResume] = useState<InvoiceItem | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  // Void / Cancel Modal state
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [invoiceToVoid, setInvoiceToVoid] = useState<InvoiceItem | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);

  // Delete Invoice Modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // View Invoice Modal state
  const [viewInvoiceModalOpen, setViewInvoiceModalOpen] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPayment, setCopiedPayment] = useState<string | null>(null);

  
  const handleDownloadInvoiceCard = (inv: InvoiceItem) => {
    try {
      const invoiceEndDate = resolveInvoiceEndDate(inv);
      const dataUrl = generateInvoiceCardCanvas(inv, lang, currencyInfo, invoiceEndDate);
      if (!dataUrl) {
        throw new Error("Failed to generate invoice image");
      }
      const link = document.createElement("a");
      link.download = `Invoice_${inv.invoiceNumber}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: lang === "ar" ? "تم تحميل بطاقة الفاتورة بنجاح" : "Invoice Card Downloaded!",
        description: `Invoice #${inv.invoiceNumber} PNG`,
      });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "فشل تحميل بطاقة الفاتورة" : "Failed to download invoice card",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  const handleCopyPayment = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPayment(label);
    toast({
      title: lang === "ar" ? "تم النسخ بنجاح" : "Copied successfully",
      description: text,
    });
    setTimeout(() => setCopiedPayment(null), 2000);
  };

  // Fetch Invoices
  const { data, isLoading, refetch, isRefetching } = useQuery<InvoicesApiResponse>({
    queryKey: ["admin-invoices"],
    queryFn: () => customFetch<InvoicesApiResponse>("/api/admin/invoices"),
    refetchInterval: 15_000,
  });

  const rawInvoices = data?.invoices || [];
  const rates = data?.rates || {};

  // Normalize each invoice so state and isPaid are strictly defined
  const invoices: InvoiceItem[] = useMemo(() => {
    return rawInvoices.map((inv) => {
      const isPaid = inv.isPaid !== undefined ? Boolean(inv.isPaid) : (inv.status === "paid" || inv.status === "activated");
      const isVoided = Boolean(inv.isVoided || inv.state === "voided" || (inv.status as string) === "voided");
      const isPaused = !isVoided && Boolean(inv.isPaused || inv.state === "paused" || (inv.status as string) === "paused");
      const state: "active" | "pending" | "voided" | "paused" = isVoided
        ? "voided"
        : isPaused
        ? "paused"
        : inv.state === "active" || inv.state === "pending"
        ? inv.state
        : (inv.status === "paid" || inv.status === "activated" ? "active" : "pending");
      return {
        ...inv,
        state,
        isPaid,
        isVoided,
        isPaused,
      };
    });
  }, [rawInvoices]);

  // Currency rate calculator
  const currencyInfo = SUPPORTED_CURRENCIES[selectedCurrency] || SUPPORTED_CURRENCIES.EGP;
  const activeRate = rates[selectedCurrency] || currencyInfo.rate;

  const convertPrice = (usd: number) => {
    return Math.round(usd * activeRate);
  };

  // Unique companies list for the company filter dropdown
  const companiesList = useMemo(() => {
    const map = new Map<string, { key: string; name: string; count: number }>();
    invoices.forEach((inv) => {
      const key = inv.companyId ? `comp-${inv.companyId}` : `name-${inv.companyName?.trim() || 'unknown'}`;
      const name = inv.companyName || (lang === "ar" ? "شركة غير محددة" : "Unspecified Company");
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { key, name, count: 1 });
      }
    });
    return Array.from(map.entries()).map(([key, item]) => ({ key, name: item.name, count: item.count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices, lang]);

  // Unique dates extracted from invoices for date filtering
  const dateOptions = useMemo(() => {
    const datesSet = new Set<string>();
    invoices.forEach((inv) => {
      if (inv.issueDate) {
        const d = inv.issueDate.slice(0, 10);
        if (d) datesSet.add(d);
      }
    });
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((iso) => {
      let label = iso;
      if (iso === today) label = lang === "ar" ? `اليوم (${iso})` : `Today (${iso})`;
      else if (iso === yesterday) label = lang === "ar" ? `أمس (${iso})` : `Yesterday (${iso})`;
      return { value: iso, label };
    });
  }, [invoices, lang]);

  const allDaysLabel = useMemo(() => {
    const count = dateOptions.length;
    if (lang === "ar") {
      if (count === 0) return "كل الأيام";
      if (count === 1) return "كل الأيام (يوم واحد)";
      if (count === 2) return "كل الأيام (يومان)";
      if (count >= 3 && count <= 10) return `كل الأيام (${count} أيام)`;
      return `كل الأيام (${count} يوم)`;
    }
    return `All Days (${count} ${count === 1 ? "Day" : "Days"})`;
  }, [dateOptions.length, lang]);

  // Toggle paid status on click
  const handleTogglePaid = async (inv: InvoiceItem) => {
    const newPaid = !inv.isPaid;
    try {
      setTogglingInvoice(inv.invoiceNumber);

      // Optimistic cache update
      queryClient.setQueryData<InvoicesApiResponse>(["admin-invoices"], (old) => {
        if (!old) return old;
        return {
          ...old,
          invoices: old.invoices.map((i) =>
            i.invoiceNumber === inv.invoiceNumber
              ? { ...i, isPaid: newPaid, status: newPaid ? "paid" : "pending" }
              : i
          ),
        };
      });

      const res: any = await customFetch("/api/admin/invoices/toggle-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: inv.invoiceNumber,
          ticketId: inv.ticketId ?? null,
          companyId: inv.companyId ?? null,
          isPaid: newPaid,
        }),
      });

      let extraDesc = "";
      if (res?.tokensCredited) {
        extraDesc = lang === "ar"
          ? ` 🎉 وتم شحن +${res.tokensCredited.toLocaleString()} رمز إضافي إلى رصيد الشركة تلقائياً بنجاح!`
          : ` 🎉 Credited +${res.tokensCredited.toLocaleString()} extra tokens to company quota!`;
      } else if (res?.tokensWithheld) {
        extraDesc = lang === "ar"
          ? ` ⏳ وتم تعليق/خصم ${res.tokensWithheld.toLocaleString()} رمز من رصيد الشركة لعدم السداد.`
          : ` ⏳ Withheld ${res.tokensWithheld.toLocaleString()} tokens from company quota.`;
      }

      toast({
        title: newPaid
          ? (lang === "ar" ? "✅ تم تحديد الفاتورة كـ مسددة" : "Invoice marked as Paid ✅")
          : (lang === "ar" ? "⏳ تم إلغاء سداد الفاتورة" : "Invoice marked as Unpaid ⏳"),
        description:
          (lang === "ar"
            ? `الفاتورة #${inv.invoiceNumber} أصبحت ${newPaid ? "مسددة (Paid)" : "غير مسددة (Unpaid)"}.`
            : `Invoice #${inv.invoiceNumber} is now ${newPaid ? "Paid" : "Unpaid"}.`) + extraDesc,
      });

      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (err: any) {
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      toast({
        title: lang === "ar" ? "خطأ في تعديل السداد" : "Failed to update payment",
        description: err?.message || (lang === "ar" ? "تعذر تغيير حالة سداد الفاتورة" : "Could not update payment status"),
        variant: "destructive",
      });
    } finally {
      setTogglingInvoice(null);
    }
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Company filter
      if (selectedCompanyFilter !== "all") {
        const invCompKey = inv.companyId ? `comp-${inv.companyId}` : `name-${inv.companyName?.trim() || 'unknown'}`;
        if (invCompKey !== selectedCompanyFilter) return false;
      }

      // Type filter
      if (typeFilter !== "all" && inv.itemType !== typeFilter) return false;

      // State filter (only 'active' and 'pending')
      if (stateFilter !== "all" && inv.state !== stateFilter) return false;

      // Paid filter
      if (paidFilter !== "all") {
        if (paidFilter === "paid" && !inv.isPaid) return false;
        if (paidFilter === "unpaid" && inv.isPaid) return false;
      }

      // Date filter
      if (dateFilter !== "all") {
        const invDate = inv.issueDate ? inv.issueDate.slice(0, 10) : "";
        if (invDate !== dateFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = inv.invoiceNumber?.toLowerCase().includes(q);
        const compMatch = inv.companyName?.toLowerCase().includes(q);
        const clientMatch = inv.clientName?.toLowerCase().includes(q);
        const emailMatch = inv.clientEmail?.toLowerCase().includes(q);
        const phoneMatch = inv.clientPhone?.toLowerCase().includes(q);
        const titleMatch = ((inv.titleAr || "") + " " + (inv.titleEn || "")).toLowerCase().includes(q);
        if (!numMatch && !compMatch && !clientMatch && !emailMatch && !phoneMatch && !titleMatch) return false;
      }

      return true;
    });
  }, [invoices, selectedCompanyFilter, typeFilter, stateFilter, paidFilter, dateFilter, searchQuery]);

  // Grouped by company structure
  const groupedCompanies = useMemo(() => {
    const map = new Map<string, CompanyInvoiceGroup>();

    filteredInvoices.forEach((inv) => {
      const key = inv.companyId ? `comp-${inv.companyId}` : `name-${inv.companyName?.trim() || 'unknown'}`;
      if (!map.has(key)) {
        map.set(key, {
          companyKey: key,
          companyId: inv.companyId,
          companyName: inv.companyName || (lang === "ar" ? "شركة غير محددة" : "Unspecified Company"),
          clientName: inv.clientName || "",
          clientEmail: inv.clientEmail || "",
          clientPhone: inv.clientPhone || "",
          invoices: [],
          totalInvoices: 0,
          totalTokens: 0,
          totalUsd: 0,
          paidCount: 0,
          unpaidCount: 0,
          pendingStateCount: 0,
          activeStateCount: 0,
          latestDate: inv.issueDate,
        });
      }

      const group = map.get(key)!;
      group.invoices.push(inv);
      group.totalInvoices += 1;

      const isVoided = Boolean(inv.isVoided || inv.state === "voided");
      const isPaused = !isVoided && Boolean(inv.isPaused || inv.state === "paused");

      if (!isVoided && !isPaused) {
        group.totalTokens += inv.tokenQuota || 0;
        group.totalUsd += inv.priceUsd || 0;
        if (inv.isPaid) {
          group.paidCount += 1;
        } else {
          group.unpaidCount += 1;
        }
        if (inv.state === "pending") {
          group.pendingStateCount += 1;
        } else if (inv.state === "active") {
          group.activeStateCount += 1;
        }
      } else if (isPaused) {
        // Paused transaction: tokens are withheld from customer utilization
        group.pausedCount = (group.pausedCount || 0) + 1;
        group.totalUsd += inv.priceUsd || 0;
        if (inv.isPaid) {
          group.paidCount += 1;
        } else {
          group.unpaidCount += 1;
        }
      } else {
        group.voidedCount = (group.voidedCount || 0) + 1;
      }
      if (new Date(inv.issueDate) > new Date(group.latestDate)) {
        group.latestDate = inv.issueDate;
      }
      if (!group.clientPhone && inv.clientPhone) group.clientPhone = inv.clientPhone;
      if (!group.clientEmail && inv.clientEmail) group.clientEmail = inv.clientEmail;
      if (!group.clientName && inv.clientName) group.clientName = inv.clientName;
    });

    // Sort each group's invoices by date (newest first)
    map.forEach((group) => {
      group.invoices.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
    });

    // Return groups sorted by latest invoice date (newest first)
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
    );
  }, [filteredInvoices, lang]);

  // Collapse / Expand handlers
  const toggleCompanyCollapse = (key: string) => {
    setCollapsedCompanies((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAll = () => {
    setCollapsedCompanies({});
  };

  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    groupedCompanies.forEach((g) => {
      allCollapsed[g.companyKey] = true;
    });
    setCollapsedCompanies(allCollapsed);
  };

  // Statistics
  const stats = useMemo(() => {
    const activeInvoices = invoices.filter((i) => !i.isVoided && i.state !== "voided");
    const totalCount = activeInvoices.length;
    const paidCount = activeInvoices.filter((i) => i.isPaid).length;
    const unpaidCount = activeInvoices.filter((i) => !i.isPaid).length;
    const voidedCount = invoices.filter((i) => i.isVoided || i.state === "voided").length;
    const planCount = activeInvoices.filter((i) => i.itemType === "plan").length;
    const topupCount = activeInvoices.filter((i) => i.itemType === "topup").length;
    const quotaCount = activeInvoices.filter((i) => i.itemType === "quota_usage").length;
    const totalUsd = activeInvoices.reduce((acc, i) => acc + (i.priceUsd || 0), 0);
    const totalLocal = convertPrice(totalUsd);
    const uniqueCompanies = new Set(
      invoices.map((i) => (i.companyId ? `comp-${i.companyId}` : `name-${i.companyName}`))
    ).size;

    return { totalCount, paidCount, unpaidCount, voidedCount, planCount, topupCount, quotaCount, totalUsd, totalLocal, uniqueCompanies };
  }, [invoices, activeRate]);

  // Handle Direct Send Bill via Email following Quota Usage Bill path
  const handleSendBillEmail = async (inv: InvoiceItem) => {
    const matchedComp = companies.find(
      (c: any) =>
        (inv.companyId && c.id === inv.companyId) ||
        (c.name && inv.companyName && c.name.toLowerCase() === inv.companyName.toLowerCase())
    );

    const targetEmail =
      matchedComp?.notificationEmail ||
      matchedComp?.clientNotificationEmail ||
      inv.clientEmail ||
      settingsNotificationEmail ||
      "";

    if (!targetEmail) {
      handleOpenSendCopy(inv);
      return;
    }

    try {
      setSendingInvoiceNumber(inv.invoiceNumber);
      setIsSendingCopy(true);
      toast({
        title: lang === "ar" ? "جارٍ إرسال الفاتورة..." : "Sending Bill...",
        description:
          lang === "ar"
            ? `يتم الآن إنشاء بطاقة الفاتورة وإرسالها كصورة إلى: ${targetEmail}`
            : `Generating invoice card and sending to: ${targetEmail}`,
      });

      const convertedLocal = convertPrice(inv.priceUsd);
      const invoiceEndDate = resolveInvoiceEndDate(inv);

      let imageDataUrl: string | undefined;
      try {
        imageDataUrl = generateInvoiceCardCanvas(inv, lang, currencyInfo, invoiceEndDate);
      } catch (e) {
        console.warn("Failed to generate canvas image", e);
      }

      const res = await customFetch<{
        ok: boolean;
        emailSent?: boolean;
        message?: string;
        emailError?: string | null;
      }>("/api/admin/invoices/send-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: inv.invoiceNumber,
          ticketId: inv.ticketId,
          companyId: inv.companyId,
          companyName: inv.companyName,
          clientId: inv.clientId,
          clientName: inv.clientName,
          clientEmail: inv.clientEmail,
          clientPhone: inv.clientPhone,
          itemType: inv.itemType,
          title: lang === "ar" ? inv.titleAr : inv.titleEn,
          itemNameAr: inv.titleAr,
          itemNameEn: inv.titleEn,
          billingCycle: inv.billingCycleAr,
          billingCycleAr: inv.billingCycleAr,
          billingCycleEn: inv.billingCycleEn,
          tokenQuota: inv.tokenQuota,
          retentionDays: inv.retentionDays,
          priceUsd: inv.priceUsd,
          priceLocal: convertedLocal,
          currencySymbol: currencyInfo.symbol,
          issueDate: inv.issueDate,
          endDate: invoiceEndDate || inv.endDate,
          channels: inv.channels,
          tools: inv.tools,
          status: inv.status,
          isPaid: inv.isPaid,
          paymentPhone: inv.paymentPhone,
          paymentInstaPay: inv.paymentInstaPay,
          recipientEmail: targetEmail,
          sendViaEmail: true,
          sendViaWhatsApp: false,
          imageDataUrl,
        }),
      });

      toast({
        title: lang === "ar" ? "✅ تمت مشاركة الفاتورة بنجاح!" : "Bill Shared Successfully!",
        description:
          lang === "ar"
            ? `تم إرسال الفاتورة الرسمية المعتمدة بنجاح إلى: ${targetEmail}. 💡 تحقق من صندوق الوارد أو مجلد Spam.`
            : `Official invoice sent to: ${targetEmail}. Check Inbox or Spam.`,
      });

      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "فشل إرسال الفاتورة" : "Failed to Send Bill",
        description: err?.message || (lang === "ar" ? "تعذر إرسال الفاتورة عبر البريد" : "Could not send bill email"),
        variant: "destructive",
      });
    } finally {
      setIsSendingCopy(false);
      setSendingInvoiceNumber(null);
    }
  };

  // Handle open Send Copy Modal
  const handleOpenSendCopy = (invoice: InvoiceItem) => {
    setSelectedInvoice(invoice);

    // Look for configured notification email (Gmail) from company or client
    const matchedComp = companies.find(
      (c: any) =>
        (invoice.companyId && c.id === invoice.companyId) ||
        (c.name && invoice.companyName && c.name.toLowerCase() === invoice.companyName.toLowerCase())
    );

    // Prioritize company dedicated notification email, then client notification/account email, then admin fallback
    const defaultEmail =
      matchedComp?.notificationEmail ||
      matchedComp?.clientNotificationEmail ||
      invoice.clientEmail ||
      settingsNotificationEmail ||
      "";

    setRecipientEmail(defaultEmail);
    setRecipientPhone(invoice.clientPhone || matchedComp?.whatsappNumber || "");
    setSendViaEmail(true);
    setSendViaWhatsApp(Boolean(invoice.clientPhone || matchedComp?.whatsappNumber));
    setCustomNotes("");
    setSendCopyModalOpen(true);
  };

  // Handle Send Copy Submission
  const handleSendCopySubmit = async () => {
    if (!selectedInvoice) return;

    if (sendViaEmail && (!recipientEmail || !recipientEmail.trim())) {
      toast({
        title: lang === "ar" ? "البريد الإلكتروني مطلوب" : "Email Required",
        description: lang === "ar" ? "يرجى إدخال البريد الإلكتروني للمستلم لإرسال النسخة." : "Please enter recipient email.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSendingCopy(true);
      const convertedLocal = convertPrice(selectedInvoice.priceUsd);
      const invoiceEndDate = resolveInvoiceEndDate(selectedInvoice);

      // Generate invoice card image to send as image ("صورة مش كلام")
      let imageDataUrl: string | undefined;
      try {
        imageDataUrl = generateInvoiceCardCanvas(selectedInvoice, lang, currencyInfo, invoiceEndDate);
      } catch (e) {
        console.warn("Failed to generate canvas image", e);
      }

      // Dispatch official certified invoice copy via /api/admin/invoices/send-copy
      const res = await customFetch<{
        ok: boolean;
        emailSent?: boolean;
        whatsappSent?: boolean;
        whatsappUrl?: string;
        emailError?: string | null;
        message?: string;
      }>("/api/admin/invoices/send-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: selectedInvoice.invoiceNumber,
          ticketId: selectedInvoice.ticketId,
          companyId: selectedInvoice.companyId,
          companyName: selectedInvoice.companyName,
          clientId: selectedInvoice.clientId,
          clientName: selectedInvoice.clientName,
          clientEmail: selectedInvoice.clientEmail,
          clientPhone: selectedInvoice.clientPhone,
          itemType: selectedInvoice.itemType,
          title: lang === "ar" ? selectedInvoice.titleAr : selectedInvoice.titleEn,
          itemNameAr: selectedInvoice.titleAr,
          itemNameEn: selectedInvoice.titleEn,
          billingCycle: selectedInvoice.billingCycleAr,
          billingCycleAr: selectedInvoice.billingCycleAr,
          billingCycleEn: selectedInvoice.billingCycleEn,
          tokenQuota: selectedInvoice.tokenQuota,
          retentionDays: selectedInvoice.retentionDays,
          priceUsd: selectedInvoice.priceUsd,
          priceLocal: convertedLocal,
          currencySymbol: currencyInfo.symbol,
          issueDate: selectedInvoice.issueDate,
          endDate: invoiceEndDate || selectedInvoice.endDate,
          channels: selectedInvoice.channels,
          tools: selectedInvoice.tools,
          status: selectedInvoice.status,
          isPaid: selectedInvoice.isPaid,
          paymentPhone: selectedInvoice.paymentPhone,
          paymentInstaPay: selectedInvoice.paymentInstaPay,
          recipientEmail: recipientEmail.trim(),
          recipientPhone: recipientPhone.trim(),
          sendViaEmail,
          sendViaWhatsApp,
          customNotes: customNotes.trim() || undefined,
          imageDataUrl,
        }),
      });

      const emailSent = Boolean(res.emailSent);
      const whatsappSent = Boolean(res.whatsappSent);
      const whatsappUrl = res.whatsappUrl;

      const successParts: string[] = [];
      if (emailSent) {
        successParts.push(lang === "ar" ? `البريد (${recipientEmail.trim()})` : `Email (${recipientEmail.trim()})`);
      }
      if (whatsappSent) {
        successParts.push(lang === "ar" ? `الواتساب مباشرة` : `WhatsApp direct`);
      }

      toast({
        title: lang === "ar" ? "✅ تم إرسال الفاتورة بنجاح!" : "Invoice Sent Successfully!",
        description:
          successParts.length > 0
            ? (lang === "ar"
                ? `تم الإرسال عبر: ${successParts.join(" و ")}. 💡 يرجى مراجعة مجلد الرسائل غير المرغوب فيها (Spam / Junk) إذا لم تظهر في البريد الوارد.`
                : `Dispatched via: ${successParts.join(", ")}. Check Inbox or Spam folder.`)
            : (lang === "ar" ? "تمت معالجة الطلب بنجاح." : "Processed successfully."),
      });

      // If WhatsApp URL was created and WhatsApp was chosen, offer direct open
      if (whatsappUrl && sendViaWhatsApp) {
        window.open(whatsappUrl, "_blank");
      }

      setSendCopyModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في الإرسال" : "Failed to Send Copy",
        description: err?.message || (lang === "ar" ? "تعذر إرسال نسخة الفاتورة." : "Could not send invoice copy."),
        variant: "destructive",
      });
    } finally {
      setIsSendingCopy(false);
      setSendingInvoiceNumber(null);
    }
  };

  // Pause transaction & tokens handler
  const handleOpenPauseDialog = (inv: InvoiceItem) => {
    setInvoiceToPause(inv);
    setPauseReason("");
    setPauseDialogOpen(true);
  };

  const handleConfirmPause = async () => {
    if (!invoiceToPause) return;
    try {
      setIsPausing(true);
      const res = await customFetch<{ ok: boolean; tokensWithheld?: number; newQuota?: number }>("/api/admin/invoices/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoiceToPause.invoiceNumber,
          ticketId: invoiceToPause.ticketId || null,
          companyId: invoiceToPause.companyId || null,
          tokensToPause: invoiceToPause.tokenQuota || 0,
          reason: pauseReason.trim() || undefined,
        }),
      });

      const tokensText = res?.tokensWithheld && res.tokensWithheld > 0
        ? lang === "ar"
          ? ` وتجميد ${res.tokensWithheld.toLocaleString()} رمز مؤقتاً`
          : ` and frozen ${res.tokensWithheld.toLocaleString()} tokens`
        : "";

      toast({
        title: lang === "ar" ? "⏸️ تم إيقاف العملية مؤقتاً" : "Invoice Paused",
        description:
          lang === "ar"
            ? `تم إيقاف الفاتورة #${invoiceToPause.invoiceNumber}${tokensText} بنجاح.`
            : `Invoice #${invoiceToPause.invoiceNumber} paused${tokensText}.`,
      });

      setPauseDialogOpen(false);
      setInvoiceToPause(null);
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في إيقاف العملية" : "Failed to pause invoice",
        description: err?.message || (lang === "ar" ? "تعذر إيقاف العملية مؤقتاً." : "Could not pause invoice."),
        variant: "destructive",
      });
    } finally {
      setIsPausing(false);
    }
  };

  // Resume transaction & tokens handler
  const handleOpenResumeDialog = (inv: InvoiceItem) => {
    setInvoiceToResume(inv);
    setResumeDialogOpen(true);
  };

  const handleConfirmResume = async () => {
    if (!invoiceToResume) return;
    try {
      setIsResuming(true);
      const res = await customFetch<{ ok: boolean; tokensRestored?: number; newQuota?: number }>("/api/admin/invoices/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoiceToResume.invoiceNumber,
          ticketId: invoiceToResume.ticketId || null,
          companyId: invoiceToResume.companyId || null,
          tokensToResume: invoiceToResume.tokenQuota || 0,
        }),
      });

      const tokensText = res?.tokensRestored && res.tokensRestored > 0
        ? lang === "ar"
          ? ` وإعادة تفعيل ${res.tokensRestored.toLocaleString()} رمز بنجاح`
          : ` and restored ${res.tokensRestored.toLocaleString()} tokens`
        : "";

      toast({
        title: lang === "ar" ? "▶️ تم استئناف العملية وتفعيل الرموز" : "Invoice Resumed",
        description:
          lang === "ar"
            ? `تم استئناف الفاتورة #${invoiceToResume.invoiceNumber}${tokensText}.`
            : `Invoice #${invoiceToResume.invoiceNumber} resumed${tokensText}.`,
      });

      setResumeDialogOpen(false);
      setInvoiceToResume(null);
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في استئناف العملية" : "Failed to resume invoice",
        description: err?.message || (lang === "ar" ? "تعذر استئناف العملية." : "Could not resume invoice."),
        variant: "destructive",
      });
    } finally {
      setIsResuming(false);
    }
  };

  // Void / Cancel transaction handler
  const handleOpenVoidDialog = (inv: InvoiceItem) => {
    setInvoiceToVoid(inv);
    setVoidReason("");
    setVoidDialogOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!invoiceToVoid) return;
    try {
      setIsVoiding(true);
      const res = await customFetch<{ ok: boolean; tokensDeducted?: number; costDeducted?: number; newQuota?: number }>("/api/admin/invoices/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoiceToVoid.invoiceNumber,
          ticketId: invoiceToVoid.ticketId || null,
          companyId: invoiceToVoid.companyId || null,
          tokensToDeduct: invoiceToVoid.tokenQuota || 0,
          costToDeduct: invoiceToVoid.priceUsd || 0,
          reason: voidReason.trim() || undefined,
        }),
      });

      const details: string[] = [];
      if (res?.tokensDeducted && res.tokensDeducted > 0) {
        details.push(lang === "ar" ? `${res.tokensDeducted.toLocaleString()} رمز` : `${res.tokensDeducted.toLocaleString()} tokens`);
      }
      if (res?.costDeducted && res.costDeducted > 0) {
        details.push(`$${res.costDeducted} USD`);
      }
      const deductedMsg = details.length > 0
        ? lang === "ar"
          ? ` وتم خصم ${details.join(" و ")} من حساب العميل.`
          : ` and ${details.join(" & ")} were deducted from customer account.`
        : "";

      toast({
        title: lang === "ar" ? "✅ تم إلغاء العملية وخصم التكلفة والرموز" : "Invoice Voided & Deducted",
        description:
          lang === "ar"
            ? `تم إلغاء العملية للفاتورة #${invoiceToVoid.invoiceNumber}${deductedMsg}`
            : `Invoice #${invoiceToVoid.invoiceNumber} has been voided${deductedMsg}`,
      });

      setVoidDialogOpen(false);
      setInvoiceToVoid(null);
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في إلغاء العملية" : "Failed to void invoice",
        description: err?.message || (lang === "ar" ? "تعذر إلغاء العملية." : "Could not void invoice."),
        variant: "destructive",
      });
    } finally {
      setIsVoiding(false);
    }
  };

  // Delete invoice handler
  const handleOpenDeleteDialog = (inv: InvoiceItem) => {
    setInvoiceToDelete(inv);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete) return;
    try {
      setIsDeleting(true);
      await customFetch("/api/admin/invoices/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: invoiceToDelete.invoiceNumber,
          ticketId: invoiceToDelete.ticketId || null,
          companyId: invoiceToDelete.companyId || null,
        }),
      });

      toast({
        title: lang === "ar" ? "🗑️ تم حذف الفاتورة نهائياً" : "Invoice Deleted",
        description:
          lang === "ar"
            ? `تم حذف الفاتورة #${invoiceToDelete.invoiceNumber} من كشف الفواتير بنجاح.`
            : `Invoice #${invoiceToDelete.invoiceNumber} removed from Bills & Invoices.`,
      });

      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في حذف الفاتورة" : "Failed to delete invoice",
        description: err?.message || (lang === "ar" ? "تعذر حذف الفاتورة." : "Could not delete invoice."),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy invoice text summary
  const handleCopySummary = (inv: InvoiceItem) => {
    const converted = convertPrice(inv.priceUsd);
    const summary = [
      `🧾 فاتورة رسمية - Bot Manager`,
      `رقم الفاتورة: #${inv.invoiceNumber}`,
      `الشركة: ${inv.companyName}`,
      `العميل: ${inv.clientName}`,
      `البند: ${lang === "ar" ? inv.titleAr : inv.titleEn}`,
      `رصيد الرموز: ${inv.tokenQuota?.toLocaleString()} Tokens`,
      `المبلغ: $${inv.priceUsd} USD (~ ${converted.toLocaleString()} ${currencyInfo.symbol})`,
      `الحالة (State): ${inv.state === "active" ? (lang === "ar" ? "نشطة" : "Active") : (lang === "ar" ? "معلقة" : "Pending")}`,
      `السداد (Paid): ${inv.isPaid ? (lang === "ar" ? "مسددة ✅" : "Paid ✅") : (lang === "ar" ? "غير مسددة ⏳" : "Unpaid ⏳")}`,
      !inv.isPaid && inv.paymentPhone ? (lang === "ar" ? `رقم تحويل المحفظة / كاش: ${inv.paymentPhone}` : `Phone / Cash Wallet: ${inv.paymentPhone}`) : "",
      !inv.isPaid && inv.paymentInstaPay ? (lang === "ar" ? `عنوان إنستاباي (IPA): ${inv.paymentInstaPay}` : `InstaPay Address (IPA): ${inv.paymentInstaPay}`) : "",
      `تاريخ الإصدار: ${new Date(inv.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}`,
      resolveInvoiceEndDate(inv) ? `تاريخ انتهاء الصلاحية: ${resolveInvoiceEndDate(inv)}${inv.itemType === "topup" ? " (مطابق لنهاية الاشتراك)" : ""}` : "",
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(summary);
    setCopiedId(inv.id);
    toast({
      title: lang === "ar" ? "تم نسخ تفاصيل الفاتورة!" : "Invoice Summary Copied!",
      description: lang === "ar" ? "تم نسخ النص إلى الحافظة بنجاح." : "Copied to clipboard.",
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Export invoices list to CSV
  const exportToCSV = () => {
    if (filteredInvoices.length === 0) return;

    const headers = [
      "Invoice Number",
      "Type",
      "Company",
      "Client",
      "Email",
      "Phone",
      "Title",
      "Tokens Quota",
      "Amount USD",
      `Amount (${currencyInfo.code})`,
      "State",
      "Paid",
      "Issue Date",
    ];

    const rows = filteredInvoices.map((inv) => [
      inv.invoiceNumber,
      inv.itemType,
      `"${inv.companyName.replace(/"/g, '""')}"`,
      `"${inv.clientName.replace(/"/g, '""')}"`,
      inv.clientEmail,
      inv.clientPhone,
      `"${(lang === "ar" ? inv.titleAr : inv.titleEn).replace(/"/g, '""')}"`,
      inv.tokenQuota || 0,
      inv.priceUsd,
      convertPrice(inv.priceUsd),
      inv.state,
      inv.isPaid ? "Paid" : "Unpaid",
      new Date(inv.issueDate).toISOString().slice(0, 10),
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bot-manager-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-16">
      {/* ── Top Header Banner ── */}
      <div
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 sm:p-8 text-white shadow-xl shadow-emerald-600/10 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #091e2f 0%, #0c334d 50%, #065f46 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-teal-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold">
              <Receipt className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "إدارة الفواتير والاشتراكات" : "Bills & Invoices Center"}</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
              {lang === "ar" ? "الفواتير وسندات القبض" : "Billing & Invoices"}
            </h1>
            <p className="text-emerald-100/80 text-xs sm:text-sm leading-relaxed">
              {lang === "ar"
                ? "كشف شامل لكافة فواتير الاشتراكات، شحن الرصيد، واستهلاك الحصص. يمكنك إرسال نسخة رسمية من أي فاتورة للعميل عبر البريد الإلكتروني أو الواتساب بنقرة واحدة."
                : "Manage and inspect all subscription plan, top-up, and quota usage invoices. Send a copy of any invoice via Email or WhatsApp instantly."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Global Send Copy Button */}
            <Button
              onClick={() => {
                if (invoices.length > 0) {
                  handleOpenSendCopy(invoices[0]);
                } else {
                  toast({
                    title: lang === "ar" ? "لا توجد فواتير" : "No Invoices",
                    description: lang === "ar" ? "لا توجد فواتير مسجلة حالياً لإرسال نسخة منها." : "No invoices found.",
                  });
                }
              }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-9 px-3.5 sm:px-4 gap-2 shadow-lg shadow-emerald-500/25 rounded-xl transition-all w-full sm:w-auto justify-center cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{lang === "ar" ? "إرسال نسخة من فاتورة" : "Send Invoice Copy"}</span>
            </Button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 gap-1.5 rounded-xl backdrop-blur-sm flex-1 sm:flex-initial justify-center cursor-pointer"
                title={lang === "ar" ? "تحميل كشف الفواتير كملف CSV" : "Export invoices as CSV"}
              >
                <Download className="w-4 h-4 text-emerald-300" />
                <span>{lang === "ar" ? "تصدير (CSV)" : "Export CSV"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 gap-1.5 rounded-xl backdrop-blur-sm flex-1 sm:flex-initial justify-center cursor-pointer"
                title={lang === "ar" ? "طباعة الكشف" : "Print summary"}
              >
                <Printer className="w-4 h-4 text-teal-300" />
                <span>{lang === "ar" ? "طباعة" : "Print"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 px-3 rounded-xl backdrop-blur-sm shrink-0 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Overview Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-3 sm:p-5 flex items-center gap-2.5 sm:gap-3.5 [direction:ltr]">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4 sm:w-6 sm:h-6 text-emerald-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "إجمالي الفواتير" : "Total Invoices"}
              </p>
              <h3 className="text-lg sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">{stats.totalCount}</h3>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                {lang === "ar" ? `${stats.paidCount} مسددة • ${stats.unpaidCount} غير مسددة` : `${stats.paidCount} Paid • ${stats.unpaidCount} Unpaid`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-3 sm:p-5 flex items-center gap-2.5 sm:gap-3.5 [direction:ltr]">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 sm:w-6 sm:h-6 text-blue-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "القيمة الإجمالية" : "Total Value"}
              </p>
              <h3 className="text-lg sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">
                ${stats.totalUsd.toLocaleString()}{" "}
                <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground">USD</span>
              </h3>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                ≈ {stats.totalLocal.toLocaleString()} {currencyInfo.symbol}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-3 sm:p-5 flex items-center gap-2.5 sm:gap-3.5 [direction:ltr]">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 sm:w-6 sm:h-6 text-violet-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "الشركات المسجلة" : "Companies"}
              </p>
              <h3 className="text-lg sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">{stats.uniqueCompanies}</h3>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                {lang === "ar" ? "شركات مسجلة بالفواتير" : "Companies with invoices"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-3 sm:p-5 flex items-center gap-2.5 sm:gap-3.5 [direction:ltr]">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Coins className="w-4 h-4 sm:w-6 sm:h-6 text-amber-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "الباقات والشحن" : "Plans & Top-ups"}
              </p>
              <h3 className="text-lg sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">
                {stats.planCount + stats.topupCount}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                {lang === "ar" ? `${stats.planCount} باقة • ${stats.topupCount} شحن` : `${stats.planCount} plans • ${stats.topupCount} topups`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col gap-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-2xl p-3.5 sm:p-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-muted-foreground absolute right-3.5 rtl:right-3.5 ltr:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              placeholder={
                lang === "ar"
                  ? "بحث برقم الفاتورة، اسم الشركة، اسم العميل، الهاتف، البريد..."
                  : "Search by invoice #, company, client, phone, email..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rtl:pr-10 ltr:pl-10 h-10 bg-background text-sm rounded-xl border-border/60"
            />
          </div>

          {/* View Mode Toggle: Grouped by Company vs Flat Table */}
          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center rounded-xl bg-background border border-border/60 p-1 shrink-0">
            <Button
              type="button"
              variant={viewMode === "grouped" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grouped")}
              className={`h-8 px-3 text-xs gap-1.5 rounded-lg font-semibold transition-all justify-center ${
                viewMode === "grouped"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "مجمعة حسب الشركات" : "Grouped by Company"}</span>
            </Button>
            <Button
              type="button"
              variant={viewMode === "flat" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("flat")}
              className={`h-8 px-3 text-xs gap-1.5 rounded-lg font-semibold transition-all justify-center ${
                viewMode === "flat"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "جدول موحد" : "Flat Table"}</span>
            </Button>
          </div>
        </div>

        {/* Second Row: Specific Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
          {/* Company Filter */}
          <Select value={selectedCompanyFilter} onValueChange={setSelectedCompanyFilter}>
            <SelectTrigger className="w-full sm:w-[170px] h-9 text-xs bg-background rounded-xl border-border/60">
              <Building2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder={lang === "ar" ? "الشركة" : "Company"} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="all">{lang === "ar" ? "جميع الشركات" : "All Companies"}</SelectItem>
              {companiesList.map((c) => (
                <SelectItem key={c.key} value={c.key} className="text-xs">
                  {c.name} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[130px] h-9 text-xs bg-background rounded-xl border-border/60">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder={lang === "ar" ? "نوع الفاتورة" : "Type"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "جميع الأنواع" : "All Types"}</SelectItem>
              <SelectItem value="plan">{lang === "ar" ? "باقات الاشتراك" : "Plans"}</SelectItem>
              <SelectItem value="topup">{lang === "ar" ? "شحن رصيد إضافي" : "Top-up Packs"}</SelectItem>
              <SelectItem value="quota_usage">{lang === "ar" ? "استهلاك الحصص" : "Quota Usage"}</SelectItem>
            </SelectContent>
          </Select>

          {/* State Filter (Active / Pending only) */}
          <Select value={stateFilter} onValueChange={(v: any) => setStateFilter(v)}>
            <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[120px] h-9 text-xs bg-background rounded-xl border-border/60">
              <SelectValue placeholder={lang === "ar" ? "الحالة" : "State"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "جميع الحالات" : "All States"}</SelectItem>
              <SelectItem value="active">{lang === "ar" ? "نشطة (Active)" : "Active"}</SelectItem>
              <SelectItem value="pending">{lang === "ar" ? "معلقة (Pending)" : "Pending"}</SelectItem>
            </SelectContent>
          </Select>

          {/* Paid Filter (Paid / Unpaid) */}
          <Select value={paidFilter} onValueChange={(v: any) => setPaidFilter(v)}>
            <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[120px] h-9 text-xs bg-background rounded-xl border-border/60">
              <SelectValue placeholder={lang === "ar" ? "السداد" : "Paid"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "جميع السداد" : "All Payment"}</SelectItem>
              <SelectItem value="paid">{lang === "ar" ? "مسددة (✓)" : "Paid (✓)"}</SelectItem>
              <SelectItem value="unpaid">{lang === "ar" ? "غير مسددة" : "Unpaid"}</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[150px] h-9 text-xs bg-background rounded-xl border-border/60">
              <CalendarRange className="w-3.5 h-3.5 mr-1.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder={allDaysLabel} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="all">{allDaysLabel}</SelectItem>
              {dateOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Currency Switcher */}
          <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="w-full sm:w-[110px] h-9 text-xs bg-background rounded-xl border-border/60 font-semibold text-emerald-600 dark:text-emerald-400">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                <SelectItem key={c.code} value={c.code} className="text-xs">
                  {c.code} ({c.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Reset Filters */}
          {(selectedCompanyFilter !== "all" || typeFilter !== "all" || stateFilter !== "all" || paidFilter !== "all" || dateFilter !== "all" || searchQuery.trim()) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedCompanyFilter("all");
                setTypeFilter("all");
                setStateFilter("all");
                setPaidFilter("all");
                setDateFilter("all");
                setSearchQuery("");
              }}
              className="w-full sm:w-auto h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground justify-center cursor-pointer"
            >
              {lang === "ar" ? "إعادة ضبط الفلاتر" : "Reset Filters"}
            </Button>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: GROUPED BY COMPANY OR FLAT TABLE ── */}
      {viewMode === "grouped" ? (
        <div className="space-y-4">
          {/* Header Bar above groups: total count & expand/collapse all */}
          <div className="flex items-center justify-between px-2 text-xs">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-500" />
              <span className="font-bold text-foreground">
                {lang === "ar"
                  ? `فواتير الشركات (${groupedCompanies.length} شركة)`
                  : `Company Bills (${groupedCompanies.length} companies)`}
              </span>
              <span className="text-muted-foreground">
                • {filteredInvoices.length} {lang === "ar" ? "فاتورة إجمالاً" : "invoices total"}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAll}
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2.5 rounded-lg border-border/60"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "توسيع الكل" : "Expand All"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAll}
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2.5 rounded-lg border-border/60"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "طي الكل" : "Collapse All"}</span>
              </Button>
            </div>
          </div>

          {isLoading ? (
            <Card className="border-border/60 bg-card/60 p-12 text-center text-muted-foreground rounded-2xl">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
              <span>{lang === "ar" ? "جاري تحميل الفواتير..." : "Loading invoices..."}</span>
            </Card>
          ) : groupedCompanies.length === 0 ? (
            <Card className="border-border/60 bg-card/60 p-12 text-center text-muted-foreground rounded-2xl">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="font-semibold">{lang === "ar" ? "لا توجد فواتير مطابقة للبحث" : "No invoices found"}</p>
              <p className="text-[11px] text-muted-foreground/80 mt-1">
                {lang === "ar" ? "جرّب تغيير فلاتر البحث أو حدد شركة أخرى." : "Try adjusting your search filters."}
              </p>
            </Card>
          ) : (
            groupedCompanies.map((group) => {
              const isCollapsed = Boolean(collapsedCompanies[group.companyKey]);
              const groupLocalTotal = convertPrice(group.totalUsd);
              const isAllPaid = group.unpaidCount === 0;

              return (
                <Card
                  key={group.companyKey}
                  className="border-border/70 bg-card/75 backdrop-blur-sm shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden"
                >
                  {/* Company Header Banner (Click to toggle) */}
                  <div
                    onClick={() => toggleCompanyCollapse(group.companyKey)}
                    className="p-4 sm:p-5 bg-gradient-to-r from-muted/50 via-muted/30 to-background border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-base sm:text-lg text-foreground truncate max-w-sm sm:max-w-md">
                            {group.companyName}
                          </h3>
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-bold">
                            {group.totalInvoices} {lang === "ar" ? (group.totalInvoices === 1 ? "فاتورة واحدة" : group.totalInvoices === 2 ? "فاتورتان" : "فواتير") : "Invoices"}
                          </Badge>
                          {/* Payment status badge strictly based on Paid column */}
                          {isAllPaid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-medium">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {lang === "ar" ? "مسددة بالكامل" : "All Paid"}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-medium">
                              <Clock className="w-3 h-3 mr-1" />
                              {lang === "ar" ? `${group.unpaidCount} غير مسددة` : `${group.unpaidCount} Unpaid`}
                            </Badge>
                          )}
                          {/* Subscription state badge based on State column */}
                          {group.pendingStateCount > 0 && (
                            <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-border/80 text-[10px] font-medium">
                              <Hourglass className="w-3 h-3 mr-1" />
                              {lang === "ar" ? `${group.pendingStateCount} معلقة (حالة)` : `${group.pendingStateCount} Pending (State)`}
                            </Badge>
                          )}
                        </div>

                        {/* Client details subtitle */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5">
                          {group.clientName && (
                            <span className="flex items-center gap-1 font-medium text-foreground/80">
                              <User className="w-3.5 h-3.5 text-muted-foreground" />
                              {group.clientName}
                            </span>
                          )}
                          {group.clientEmail && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3 text-muted-foreground/70" />
                              {group.clientEmail}
                            </span>
                          )}
                          {group.clientPhone && (
                            <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                              <MessageCircle className="w-3 h-3 text-emerald-500/70" />
                              {group.clientPhone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side summary & toggle button */}
                    <div className="flex items-center justify-between md:justify-end gap-5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/40">
                      <div className="text-right rtl:text-right ltr:text-left">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold block">
                          {lang === "ar" ? "إجمالي فواتير الشركة" : "Company Invoices Total"}
                        </span>
                        <div className="flex items-baseline gap-1.5 justify-end">
                          <span className="font-extrabold text-base sm:text-lg text-emerald-600 dark:text-emerald-400 font-mono">
                            ${group.totalUsd.toLocaleString()} USD
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground font-mono block">
                          ≈ {groupLocalTotal.toLocaleString()} {currencyInfo.symbol}
                        </span>
                      </div>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {/* Company Three Dots Dropdown Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-8 h-8 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80"
                              title={lang === "ar" ? "خيارات الشركة والفواتير" : "Company & Invoice Options"}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-4 h-4" />
                              <span className="sr-only">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="w-60 shadow-xl border border-border/80" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuLabel className="text-xs font-semibold flex items-center justify-between pb-1.5">
                              <span className="font-bold text-foreground truncate max-w-[140px]">{group.companyName}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {group.invoices.length} {lang === "ar" ? "فواتير" : "bills"}
                              </span>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => {
                                if (group.invoices.length > 0) {
                                  setViewingInvoice(group.invoices[0]);
                                  setViewInvoiceModalOpen(true);
                                }
                              }}
                              className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                            >
                              <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>{lang === "ar" ? "عرض فاتورة الاستهلاك" : "View Usage Invoice"}</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                if (group.invoices.length > 0) {
                                  handleSendBillEmail(group.invoices[0]);
                                }
                              }}
                              className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                            >
                              <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                              <span>{lang === "ar" ? "إرسال الفاتورة عبر البريد" : "Send Bill via Email"}</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                if (group.invoices.length > 0) {
                                  handleCopySummary(group.invoices[0]);
                                }
                              }}
                              className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                            >
                              <Copy className="w-4 h-4 text-cyan-500 shrink-0" />
                              <span>{lang === "ar" ? "نسخ ملخص الفاتورة" : "Copy Bill Summary"}</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                if (group.invoices.length > 0) {
                                  handleDownloadInvoiceCard(group.invoices[0]);
                                }
                              }}
                              className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                            >
                              <Download className="w-4 h-4 text-blue-500 shrink-0" />
                              <span>{lang === "ar" ? "تحميل بطاقة الفاتورة" : "Download Invoice Card"}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-8 h-8 p-0 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
                          title={isCollapsed ? (lang === "ar" ? "توسيع الفواتير" : "Expand") : (lang === "ar" ? "طي الفواتير" : "Collapse")}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCompanyCollapse(group.companyKey);
                          }}
                        >
                          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Company Invoices (Expanded) */}
                  {!isCollapsed && (
                    <>
                      {/* Desktop Table View (>= md) */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full min-w-[700px] text-xs">
                        <thead>
                          <tr className="border-b border-border/50 bg-muted/25 text-muted-foreground font-semibold">
                            <th className="p-3 text-right rtl:text-right ltr:text-left">{lang === "ar" ? "رقم الفاتورة" : "Invoice #"}</th>
                            <th className="p-3 text-right rtl:text-right ltr:text-left">{lang === "ar" ? "البند / الباقة" : "Item / Plan"}</th>
                            <th className="p-3 text-center">{lang === "ar" ? "رصيد الرموز" : "Tokens"}</th>
                            <th className="p-3 text-center">{lang === "ar" ? "تاريخ الإصدار" : "Date"}</th>
                            <th className="p-3 text-right rtl:text-right ltr:text-left font-bold text-foreground">
                              {lang === "ar" ? `المبلغ (${currencyInfo.code})` : `Amount (${currencyInfo.code})`}
                            </th>
                            <th className="p-3 text-center">{lang === "ar" ? "الحالة" : "State"}</th>
                            <th className="p-3 text-center">{lang === "ar" ? "السداد" : "Paid"}</th>
                            <th className="p-3 text-center min-w-[140px]">{lang === "ar" ? "الإجراءات" : "Actions"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {group.invoices.map((inv) => {
                            const localPrice = convertPrice(inv.priceUsd);

                            return (
                              <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                                {/* Invoice # & Type */}
                                <td className="p-3 font-mono text-[11px] font-bold text-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <span>#{inv.invoiceNumber}</span>
                                    {inv.itemType === "plan" && (
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/30 text-blue-500 bg-blue-500/10">
                                        {lang === "ar" ? "باقة" : "Plan"}
                                      </Badge>
                                    )}
                                    {inv.itemType === "topup" && (
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-500 bg-amber-500/10">
                                        {lang === "ar" ? "شحن" : "Topup"}
                                      </Badge>
                                    )}
                                    {inv.itemType === "quota_usage" && (
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                                        {lang === "ar" ? "حصة" : "Quota"}
                                      </Badge>
                                    )}
                                  </div>
                                </td>

                                {/* Item / Title */}
                                <td className="p-3">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-foreground">
                                      {lang === "ar" ? inv.titleAr : inv.titleEn}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {inv.billingCycleAr} {inv.retentionDays ? `• حفظ ${inv.retentionDays} يوم` : ""}
                                    </span>
                                  </div>
                                </td>

                                {/* Token Quota */}
                                <td className="p-3 text-center font-mono font-semibold text-blue-600 dark:text-blue-400">
                                  {inv.isVoided || inv.state === "voided" ? (
                                    <div className="flex flex-col items-center">
                                      <span className="line-through text-muted-foreground/60 text-xs">
                                        {inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"}
                                      </span>
                                      <span className="text-[10px] text-rose-500 font-bold">
                                        {lang === "ar" ? "مخصومة" : "Deducted"}
                                      </span>
                                    </div>
                                  ) : inv.isPaused || inv.state === "paused" ? (
                                    <div className="flex flex-col items-center">
                                      <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">
                                        {inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"}
                                      </span>
                                      <span className="text-[10px] text-blue-500 font-semibold">
                                        {lang === "ar" ? "مجمدة مؤقتاً" : "Paused / Frozen"}
                                      </span>
                                    </div>
                                  ) : (
                                    inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"
                                  )}
                                </td>

                                {/* Issue Date & Expiration Date */}
                                <td className="p-3 text-center font-mono text-muted-foreground">
                                  <div>
                                    {new Date(inv.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </div>
                                  {resolveInvoiceEndDate(inv) && (
                                    <div
                                      className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1 mt-1"
                                      title={lang === "ar" ? "تاريخ انتهاء الصلاحية" : "Expiration Date"}
                                    >
                                      <Clock className="w-2.5 h-2.5 shrink-0" />
                                      <span>
                                        {lang === "ar" ? "ينتهي:" : "Exp:"}{" "}
                                        {resolveInvoiceEndDate(inv)}
                                      </span>
                                    </div>
                                  )}
                                </td>

                                {/* Price */}
                                <td className="p-3 text-right rtl:text-right ltr:text-left">
                                  {inv.isVoided || inv.state === "voided" ? (
                                    <div className="flex flex-col">
                                      <span className="line-through text-muted-foreground/60 text-xs font-mono">
                                        ${inv.priceUsd} USD
                                      </span>
                                      <span className="text-[10px] text-rose-500 font-bold">
                                        {lang === "ar" ? "ملغاة ومخصومة" : "Voided & Deducted"}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col">
                                      <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                                        ${inv.priceUsd} USD
                                      </span>
                                      <span className="text-[11px] text-muted-foreground font-mono">
                                        ≈ {localPrice.toLocaleString()} {currencyInfo.symbol}
                                      </span>
                                    </div>
                                  )}
                                </td>

                                {/* State ('active', 'pending', 'paused', or 'voided') */}
                                <td className="p-3 text-center">
                                  {inv.isVoided || inv.state === "voided" ? (
                                    <Badge variant="outline" className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-semibold gap-1">
                                      <Ban className="w-3 h-3" />
                                      {lang === "ar" ? "ملغاة" : "Voided"}
                                    </Badge>
                                  ) : inv.isPaused || inv.state === "paused" ? (
                                    <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-semibold gap-1">
                                      <Pause className="w-3 h-3" />
                                      {lang === "ar" ? "معلقة مؤقتاً" : "Paused"}
                                    </Badge>
                                  ) : inv.state === "active" ? (
                                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      {lang === "ar" ? "نشطة" : "Active"}
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                      {lang === "ar" ? "معلقة" : "Pending"}
                                    </Badge>
                                  )}
                                </td>

                                {/* Paid (field that when checked indicates paid) */}
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePaid(inv)}
                                    disabled={togglingInvoice === inv.invoiceNumber}
                                    title={
                                      inv.isPaid
                                        ? (lang === "ar" ? "مسددة (انقر لإلغاء السداد)" : "Paid (Click to mark unpaid)")
                                        : (lang === "ar" ? "غير مسددة (انقر للتحديد كمسددة)" : "Unpaid (Click to mark paid)")
                                    }
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none ${
                                      inv.isPaid
                                        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                                        : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted/70 hover:border-emerald-500/40"
                                    }`}
                                  >
                                    <span
                                      className={`w-4 h-4 rounded-[4px] flex items-center justify-center transition-all ${
                                        inv.isPaid
                                          ? "bg-emerald-600 text-white shadow-xs"
                                          : "border-2 border-muted-foreground/40 bg-background"
                                      }`}
                                    >
                                      {inv.isPaid && <Check className="w-3 h-3 stroke-[3]" />}
                                    </span>
                                    <span className="text-[11px]">
                                      {inv.isPaid ? (lang === "ar" ? "مسددة" : "Paid") : (lang === "ar" ? "غير مسددة" : "Unpaid")}
                                    </span>
                                  </button>
                                </td>

                                {/* Actions */}
                                <td className="p-3 text-center whitespace-nowrap min-w-[170px]">
                                  <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                    {/* Direct 1-Click Share Button (Matches Quota Usage Bill) */}
                                    <Button
                                      size="sm"
                                      onClick={() => handleSendBillEmail(inv)}
                                      disabled={isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber}
                                      title={lang === "ar" ? "مشاركة وإرسال الفاتورة كصورة فوراً إلى إيميل العميل (بنقرة واحدة)" : "Share invoice card image directly to client email (1-click)"}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] h-7 px-2.5 gap-1.5 shadow-sm rounded-lg shrink-0 cursor-pointer"
                                    >
                                      {isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Share2 className="w-3 h-3" />
                                      )}
                                      <span>{lang === "ar" ? "مشاركة الفاتورة" : "Share Bill"}</span>
                                    </Button>

                                    {/* Download Invoice Card Button */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDownloadInvoiceCard(inv)}
                                      className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg shrink-0 cursor-pointer"
                                      title={lang === "ar" ? "تحميل بطاقة الفاتورة (PNG)" : "Download Invoice Card (PNG)"}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </Button>

                                    {/* View Invoice Button */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setViewingInvoice(inv);
                                        setViewInvoiceModalOpen(true);
                                      }}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg shrink-0 cursor-pointer"
                                      title={lang === "ar" ? "معاينة الفاتورة" : "View Invoice"}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                    {/* Three dots Actions Dropdown Menu */}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg shrink-0"
                                          title={lang === "ar" ? "المزيد من الإجراءات" : "More Actions"}
                                        >
                                          <MoreVertical className="w-4 h-4" />
                                          <span className="sr-only">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="w-60 shadow-xl border border-border/80">
                                        <DropdownMenuLabel className="text-xs font-semibold flex items-center justify-between pb-1.5">
                                          <span className="font-mono font-bold text-foreground">#{inv.invoiceNumber}</span>
                                          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                            {inv.companyName}
                                          </span>
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                         <DropdownMenuItem
                                           onClick={() => {
                                             setViewingInvoice(inv);
                                             setViewInvoiceModalOpen(true);
                                           }}
                                           className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                         >
                                           <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
                                           <span>{lang === "ar" ? "عرض فاتورة الاستهلاك" : "View Usage Invoice"}</span>
                                         </DropdownMenuItem>
                                         <DropdownMenuItem
                                           onClick={() => handleSendBillEmail(inv)}
                                           className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                         >
                                           <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                                           <span>{lang === "ar" ? "إرسال الفاتورة عبر البريد" : "Send Bill via Email"}</span>
                                         </DropdownMenuItem>
                                         <DropdownMenuItem
                                           onClick={() => handleCopySummary(inv)}
                                           className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                         >
                                           {copiedId === inv.id ? (
                                             <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                           ) : (
                                             <Copy className="w-4 h-4 text-cyan-500 shrink-0" />
                                           )}
                                           <span>{lang === "ar" ? "نسخ ملخص الفاتورة" : "Copy Bill Summary"}</span>
                                         </DropdownMenuItem>
                                         <DropdownMenuItem
                                           onClick={() => handleDownloadInvoiceCard(inv)}
                                           className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                         >
                                           <Download className="w-4 h-4 text-blue-500 shrink-0" />
                                           <span>{lang === "ar" ? "تحميل بطاقة الفاتورة" : "Download Invoice Card"}</span>
                                         </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleTogglePaid(inv)}
                                          disabled={togglingInvoice === inv.invoiceNumber}
                                          className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                                        >
                                          {inv.isPaid ? (
                                            <>
                                              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                                              <span>{lang === "ar" ? "تحديد كـ غير مسددة" : "Mark as Unpaid"}</span>
                                            </>
                                          ) : (
                                            <>
                                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                              <span>{lang === "ar" ? "تأكيد السداد (مسددة)" : "Mark as Paid"}</span>
                                            </>
                                          )}
                                        </DropdownMenuItem>
                                        {!inv.isVoided && inv.state !== "voided" && (
                                          <>
                                            <DropdownMenuSeparator />
                                            {inv.isPaused || inv.state === "paused" ? (
                                              <DropdownMenuItem
                                                onClick={() => handleOpenResumeDialog(inv)}
                                                className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 focus:bg-emerald-500/10"
                                              >
                                                <Play className="w-4 h-4 text-emerald-500 fill-current shrink-0" />
                                                <span>{lang === "ar" ? "استئناف العملية والرموز" : "Resume Transaction"}</span>
                                              </DropdownMenuItem>
                                            ) : (
                                              <DropdownMenuItem
                                                onClick={() => handleOpenPauseDialog(inv)}
                                                className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-blue-600 dark:text-blue-400 focus:text-blue-600 focus:bg-blue-500/10"
                                              >
                                                <Pause className="w-4 h-4 text-blue-500 shrink-0" />
                                                <span>{lang === "ar" ? "إيقاف مؤقت وتجميد الرموز" : "Pause & Freeze Tokens"}</span>
                                              </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem
                                              onClick={() => handleOpenVoidDialog(inv)}
                                              className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-amber-600 dark:text-amber-400 focus:text-amber-600 focus:bg-amber-500/10"
                                            >
                                              <Ban className="w-4 h-4 text-amber-500 shrink-0" />
                                              <span>{lang === "ar" ? "إلغاء حجز العملية وخصم الرموز" : "Cancel Booking & Void"}</span>
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => handleOpenDeleteDialog(inv)}
                                          className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10"
                                        >
                                          <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                                          <span>{lang === "ar" ? "حذف الفاتورة نهائياً" : "Delete Invoice"}</span>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>

                        {/* Company Invoices Summary Footer */}
                        <tfoot>
                          <tr className="border-t-2 border-border/60 bg-muted/30 font-semibold text-foreground">
                            <td colSpan={2} className="p-3">
                              <span className="text-xs text-muted-foreground">
                                {lang === "ar"
                                  ? `مجموع فواتير ${group.companyName} (${group.totalInvoices} فواتير)`
                                  : `Total for ${group.companyName} (${group.totalInvoices} invoices)`}
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono text-blue-600 dark:text-blue-400">
                              {group.totalTokens > 0 ? group.totalTokens.toLocaleString() : "—"}
                            </td>
                            <td className="p-3 text-center text-muted-foreground text-[11px]">
                              {lang === "ar" ? "آخر فاتورة: " : "Latest: "}
                              {new Date(group.latestDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}
                            </td>
                            <td className="p-3 text-right rtl:text-right ltr:text-left font-mono">
                              <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                ${group.totalUsd.toLocaleString()} USD
                              </span>
                              <span className="block text-[11px] text-muted-foreground font-normal">
                                ≈ {groupLocalTotal.toLocaleString()} {currencyInfo.symbol}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-[11px] text-muted-foreground font-medium">
                                {group.activeStateCount} {lang === "ar" ? "نشطة" : "Active"}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                  {group.paidCount}/{group.totalInvoices} {lang === "ar" ? "مسددة" : "Paid"}
                                </span>
                                {group.unpaidCount > 0 && (
                                  <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                    {group.unpaidCount} {lang === "ar" ? "غير مسددة" : "Unpaid"}
                                  </span>
                                )}
                                {Boolean(group.voidedCount && group.voidedCount > 0) && (
                                  <span className="text-[10px] font-medium text-rose-500">
                                    {group.voidedCount} {lang === "ar" ? "ملغاة ومخصومة" : "Voided"}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center text-[10px] text-muted-foreground">
                              —
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Mobile Cards View (< md) */}
                    <div className="block md:hidden divide-y divide-border/40 bg-background/50">
                      {group.invoices.map((inv) => {
                        const localPrice = convertPrice(inv.priceUsd);
                        const invoiceEndDate = resolveInvoiceEndDate(inv);

                        return (
                          <div key={inv.id} className="p-3.5 space-y-3 hover:bg-muted/15 transition-colors">
                            {/* Top Row: Invoice #, item type, state */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-bold text-foreground">#{inv.invoiceNumber}</span>
                                {inv.itemType === "plan" && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/30 text-blue-500 bg-blue-500/10">
                                    {lang === "ar" ? "باقة" : "Plan"}
                                  </Badge>
                                )}
                                {inv.itemType === "topup" && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-500 bg-amber-500/10">
                                    {lang === "ar" ? "شحن" : "Topup"}
                                  </Badge>
                                )}
                                {inv.itemType === "quota_usage" && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                                    {lang === "ar" ? "حصة" : "Quota"}
                                  </Badge>
                                )}
                              </div>

                              <div className="shrink-0">
                                {inv.isVoided || inv.state === "voided" ? (
                                  <Badge variant="outline" className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-semibold gap-1">
                                    <Ban className="w-2.5 h-2.5" />
                                    <span>{lang === "ar" ? "ملغاة" : "Voided"}</span>
                                  </Badge>
                                ) : inv.isPaused || inv.state === "paused" ? (
                                  <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-semibold gap-1">
                                    <Pause className="w-2.5 h-2.5" />
                                    <span>{lang === "ar" ? "معلقة مؤقتاً" : "Paused"}</span>
                                  </Badge>
                                ) : inv.state === "active" ? (
                                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>{lang === "ar" ? "نشطة" : "Active"}</span>
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    <span>{lang === "ar" ? "معلقة" : "Pending"}</span>
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Title & Cycle Details */}
                            <div>
                              <h4 className="font-bold text-sm text-foreground">
                                {lang === "ar" ? inv.titleAr : inv.titleEn}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                                <span>{inv.billingCycleAr}</span>
                                {inv.retentionDays && <span>• حفظ {inv.retentionDays} يوم</span>}
                                {invoiceEndDate && (
                                  <span className="text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-1">
                                    <Clock className="w-2.5 h-2.5 shrink-0" />
                                    <span>{lang === "ar" ? "ينتهي:" : "Exp:"} {invoiceEndDate}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Key Metrics: Amount, Tokens, Date */}
                            <div className="grid grid-cols-2 gap-2 bg-muted/30 border border-border/50 rounded-xl p-2.5 text-xs">
                              <div>
                                <span className="text-[10px] text-muted-foreground block font-medium">
                                  {lang === "ar" ? "المبلغ المستحق:" : "Amount:"}
                                </span>
                                {inv.isVoided || inv.state === "voided" ? (
                                  <div>
                                    <span className="line-through text-muted-foreground/60 text-xs font-mono">${inv.priceUsd} USD</span>
                                    <span className="text-[10px] text-rose-500 font-bold block">{lang === "ar" ? "ملغاة ومخصومة" : "Voided"}</span>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                                      ${inv.priceUsd} USD
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-mono block">
                                      ≈ {localPrice.toLocaleString()} {currencyInfo.symbol}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="border-s border-border/50 ps-2.5">
                                <span className="text-[10px] text-muted-foreground block font-medium">
                                  {lang === "ar" ? "رصيد الرموز:" : "Tokens:"}
                                </span>
                                <div className="font-mono font-bold text-sm text-blue-500 mt-0.5">
                                  {inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"}
                                </div>
                                <span className="text-[10px] text-muted-foreground block mt-0.5">
                                  📅 {new Date(inv.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}
                                </span>
                              </div>
                            </div>

                            {/* Action Row: Paid Switcher & Buttons */}
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleTogglePaid(inv)}
                                disabled={togglingInvoice === inv.invoiceNumber}
                                title={
                                  inv.isPaid
                                    ? (lang === "ar" ? "مسددة (انقر لإلغاء السداد)" : "Paid (Click to mark unpaid)")
                                    : (lang === "ar" ? "غير مسددة (انقر للتحديد كمسددة)" : "Unpaid (Click to mark paid)")
                                }
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none ${
                                  inv.isPaid
                                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                    : "bg-muted/50 border-border/70 text-muted-foreground"
                                }`}
                              >
                                <span
                                  className={`w-4 h-4 rounded-[4px] flex items-center justify-center transition-all ${
                                    inv.isPaid
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "border-2 border-muted-foreground/40 bg-background"
                                  }`}
                                >
                                  {inv.isPaid && <Check className="w-3 h-3 stroke-[3]" />}
                                </span>
                                <span className="text-[11px]">
                                  {inv.isPaid ? (lang === "ar" ? "مسددة" : "Paid") : (lang === "ar" ? "غير مسددة" : "Unpaid")}
                                </span>
                              </button>

                              <div className="flex items-center gap-1.5">
                                {/* Direct 1-Click Share Button */}
                                <Button
                                  size="sm"
                                  onClick={() => handleSendBillEmail(inv)}
                                  disabled={isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber}
                                  title={lang === "ar" ? "مشاركة وإرسال الفاتورة بنقرة واحدة" : "Share Bill (1-click)"}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-2.5 gap-1.5 shadow-sm rounded-lg cursor-pointer"
                                >
                                  {isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Share2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>{lang === "ar" ? "مشاركة الفاتورة" : "Share"}</span>
                                </Button>

                                {/* Download Image */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownloadInvoiceCard(inv)}
                                  className="h-8 w-8 p-0 text-emerald-600 dark:text-emerald-400 rounded-lg cursor-pointer"
                                  title={lang === "ar" ? "تحميل بطاقة الفاتورة (PNG)" : "Download Card (PNG)"}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setViewingInvoice(inv);
                                    setViewInvoiceModalOpen(true);
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                                  title={lang === "ar" ? "معاينة الفاتورة" : "View Invoice"}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg cursor-pointer"
                                      title={lang === "ar" ? "المزيد من الإجراءات" : "More Actions"}
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                      <span className="sr-only">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="w-60 shadow-xl border border-border/80">
                                    <DropdownMenuLabel className="text-xs font-semibold flex items-center justify-between pb-1.5">
                                      <span className="font-mono font-bold text-foreground">#{inv.invoiceNumber}</span>
                                      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                        {inv.companyName}
                                      </span>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setViewingInvoice(inv);
                                        setViewInvoiceModalOpen(true);
                                      }}
                                      className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                    >
                                      <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
                                      <span>{lang === "ar" ? "عرض فاتورة الاستهلاك" : "View Usage Invoice"}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleSendBillEmail(inv)}
                                      className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                    >
                                      <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                                      <span>{lang === "ar" ? "إرسال الفاتورة عبر البريد" : "Send Bill via Email"}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleCopySummary(inv)}
                                      className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                    >
                                      {copiedId === inv.id ? (
                                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                      ) : (
                                        <Copy className="w-4 h-4 text-cyan-500 shrink-0" />
                                      )}
                                      <span>{lang === "ar" ? "نسخ ملخص الفاتورة" : "Copy Bill Summary"}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDownloadInvoiceCard(inv)}
                                      className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                                    >
                                      <Download className="w-4 h-4 text-blue-500 shrink-0" />
                                      <span>{lang === "ar" ? "تحميل بطاقة الفاتورة" : "Download Invoice Card"}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleTogglePaid(inv)}
                                      disabled={togglingInvoice === inv.invoiceNumber}
                                      className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                                    >
                                      {inv.isPaid ? (
                                        <>
                                          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                                          <span>{lang === "ar" ? "تحديد كـ غير مسددة" : "Mark as Unpaid"}</span>
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                          <span>{lang === "ar" ? "تأكيد السداد (مسددة)" : "Mark as Paid"}</span>
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                    {!inv.isVoided && inv.state !== "voided" && (
                                      <>
                                        <DropdownMenuSeparator />
                                        {inv.isPaused || inv.state === "paused" ? (
                                          <DropdownMenuItem
                                            onClick={() => handleOpenResumeDialog(inv)}
                                            className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 focus:bg-emerald-500/10"
                                          >
                                            <Play className="w-4 h-4 text-emerald-500 fill-current shrink-0" />
                                            <span>{lang === "ar" ? "استئناف العملية والرموز" : "Resume Transaction"}</span>
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem
                                            onClick={() => handleOpenPauseDialog(inv)}
                                            className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-blue-600 dark:text-blue-400 focus:text-blue-600 focus:bg-blue-500/10"
                                          >
                                            <Pause className="w-4 h-4 text-blue-500 shrink-0" />
                                            <span>{lang === "ar" ? "إيقاف مؤقت وتجميد الرموز" : "Pause & Freeze Tokens"}</span>
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem
                                          onClick={() => handleOpenVoidDialog(inv)}
                                          className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-amber-600 dark:text-amber-400 focus:text-amber-600 focus:bg-amber-500/10"
                                        >
                                          <Ban className="w-4 h-4 text-amber-500 shrink-0" />
                                          <span>{lang === "ar" ? "إلغاء حجز العملية وخصم الرموز" : "Cancel Booking & Void"}</span>
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleOpenDeleteDialog(inv)}
                                      className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10"
                                    >
                                      <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                                      <span>{lang === "ar" ? "حذف الفاتورة نهائياً" : "Delete Invoice"}</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Mobile Company Summary Box */}
                      <div className="p-3 bg-muted/40 text-xs flex flex-col gap-1.5 font-medium border-t border-border/50">
                        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                          <span>{lang === "ar" ? "إجمالي فواتير الشركة:" : "Total invoices:"}</span>
                          <span className="font-bold text-foreground">{group.totalInvoices}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                          <span>{lang === "ar" ? "إجمالي الرموز:" : "Total Tokens:"}</span>
                          <span className="font-mono font-bold text-blue-500">{group.totalTokens > 0 ? group.totalTokens.toLocaleString() : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                          <span>{lang === "ar" ? "المجموع الكلي:" : "Total Amount:"}</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            ${group.totalUsd.toLocaleString()} USD (~ {groupLocalTotal.toLocaleString()} {currencyInfo.symbol})
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                          <span>{lang === "ar" ? "حالة السداد:" : "Payment status:"}</span>
                          <span className="font-bold text-foreground">{group.paidCount}/{group.totalInvoices} {lang === "ar" ? "مسددة" : "Paid"}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* ── FLAT TABLE VIEW (ALTERNATIVE VIEW) ── */
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden rounded-2xl">
          {/* Desktop Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[750px] text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-muted-foreground font-semibold">
                  <th className="p-3.5 text-right rtl:text-right ltr:text-left">{lang === "ar" ? "رقم الفاتورة" : "Invoice #"}</th>
                  <th className="p-3.5 text-right rtl:text-right ltr:text-left">{lang === "ar" ? "الشركة / العميل" : "Company / Client"}</th>
                  <th className="p-3.5 text-right rtl:text-right ltr:text-left">{lang === "ar" ? "البند / الباقة" : "Item / Plan"}</th>
                  <th className="p-3.5 text-center">{lang === "ar" ? "رصيد الرموز" : "Tokens"}</th>
                  <th className="p-3.5 text-center">{lang === "ar" ? "تاريخ الإصدار" : "Date"}</th>
                  <th className="p-3.5 text-right rtl:text-right ltr:text-left font-bold text-foreground">{lang === "ar" ? `المبلغ (${currencyInfo.code})` : `Amount (${currencyInfo.code})`}</th>
                  <th className="p-3.5 text-center">{lang === "ar" ? "الحالة" : "State"}</th>
                  <th className="p-3.5 text-center">{lang === "ar" ? "السداد" : "Paid"}</th>
                  <th className="p-3.5 text-center min-w-[140px]">{lang === "ar" ? "إجراءات الفاتورة" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                      <span>{lang === "ar" ? "جاري تحميل الفواتير..." : "Loading invoices..."}</span>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-muted-foreground">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="font-semibold">{lang === "ar" ? "لا توجد فواتير مطابقة للبحث" : "No invoices found"}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">
                        {lang === "ar" ? "جرّب تغيير فلاتر البحث أو حدد فترة أخرى." : "Try adjusting your search filters."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const localPrice = convertPrice(inv.priceUsd);

                    return (
                      <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                        {/* Invoice Number & Type */}
                        <td className="p-3.5 font-mono text-[11px] font-bold text-foreground">
                          <div className="flex items-center gap-1.5">
                            <span>#{inv.invoiceNumber}</span>
                            {inv.itemType === "plan" && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/30 text-blue-500 bg-blue-500/10">
                                {lang === "ar" ? "باقة" : "Plan"}
                              </Badge>
                            )}
                            {inv.itemType === "topup" && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-500 bg-amber-500/10">
                                {lang === "ar" ? "شحن" : "Topup"}
                              </Badge>
                            )}
                            {inv.itemType === "quota_usage" && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                                {lang === "ar" ? "حصة" : "Quota"}
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Company & Client */}
                        <td className="p-3.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground text-xs">{inv.companyName}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {inv.clientName} {inv.clientPhone ? `• ${inv.clientPhone}` : ""}
                            </span>
                          </div>
                        </td>

                        {/* Item / Plan Title */}
                        <td className="p-3.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {lang === "ar" ? inv.titleAr : inv.titleEn}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {inv.billingCycleAr} {inv.retentionDays ? `• حفظ ${inv.retentionDays} يوم` : ""}
                            </span>
                          </div>
                        </td>

                        {/* Token Quota */}
                        <td className="p-3.5 text-center font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {inv.isVoided || inv.state === "voided" ? (
                            <div className="flex flex-col items-center">
                              <span className="line-through text-muted-foreground/60 text-xs">
                                {inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"}
                              </span>
                              <span className="text-[10px] text-rose-500 font-bold">
                                {lang === "ar" ? "مخصومة" : "Deducted"}
                              </span>
                            </div>
                          ) : inv.isPaused || inv.state === "paused" ? (
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground/70 text-xs">
                                {inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"}
                              </span>
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                                {lang === "ar" ? "مجمدة مؤقتاً" : "Paused"}
                              </span>
                            </div>
                          ) : (
                            inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"
                          )}
                        </td>

                        {/* Issue Date & Expiration Date */}
                        <td className="p-3.5 text-center font-mono text-muted-foreground">
                          <div>
                            {new Date(inv.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          {resolveInvoiceEndDate(inv) && (
                            <div
                              className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1 mt-1"
                              title={lang === "ar" ? "تاريخ انتهاء الصلاحية" : "Expiration Date"}
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>
                                {lang === "ar" ? "ينتهي:" : "Exp:"}{" "}
                                {resolveInvoiceEndDate(inv)}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="p-3.5 text-right rtl:text-right ltr:text-left">
                          {inv.isVoided || inv.state === "voided" ? (
                            <div className="flex flex-col">
                              <span className="line-through text-muted-foreground/60 text-xs font-mono">
                                ${inv.priceUsd} USD
                              </span>
                              <span className="text-[10px] text-rose-500 font-bold">
                                {lang === "ar" ? "ملغاة ومخصومة" : "Voided & Deducted"}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                                ${inv.priceUsd} USD
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                ≈ {localPrice.toLocaleString()} {currencyInfo.symbol}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* State ('active', 'pending', 'paused', or 'voided') */}
                        <td className="p-3.5 text-center">
                          {inv.isVoided || inv.state === "voided" ? (
                            <Badge variant="outline" className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-semibold gap-1">
                              <Ban className="w-3 h-3" />
                              {lang === "ar" ? "ملغاة" : "Voided"}
                            </Badge>
                          ) : inv.isPaused || inv.state === "paused" ? (
                            <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-semibold gap-1">
                              <Pause className="w-3 h-3" />
                              {lang === "ar" ? "معلقة مؤقتاً" : "Paused"}
                            </Badge>
                          ) : inv.state === "active" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {lang === "ar" ? "نشطة" : "Active"}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              {lang === "ar" ? "معلقة" : "Pending"}
                            </Badge>
                          )}
                        </td>

                        {/* Paid (field that when checked indicates paid) */}
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleTogglePaid(inv)}
                            disabled={togglingInvoice === inv.invoiceNumber}
                            title={
                              inv.isPaid
                                ? (lang === "ar" ? "مسددة (انقر لإلغاء السداد)" : "Paid (Click to mark unpaid)")
                                : (lang === "ar" ? "غير مسددة (انقر للتحديد كمسددة)" : "Unpaid (Click to mark paid)")
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none ${
                              inv.isPaid
                                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                                : "bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted/70 hover:border-emerald-500/40"
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-[4px] flex items-center justify-center transition-all ${
                                inv.isPaid
                                  ? "bg-emerald-600 text-white shadow-xs"
                                  : "border-2 border-muted-foreground/40 bg-background"
                              }`}
                            >
                              {inv.isPaid && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                            <span className="text-[11px]">
                              {inv.isPaid ? (lang === "ar" ? "مسددة" : "Paid") : (lang === "ar" ? "غير مسددة" : "Unpaid")}
                            </span>
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 text-center whitespace-nowrap min-w-[170px]">
                          <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                            {/* Direct 1-Click Share Button (Matches Quota Usage Bill) */}
                            <Button
                              size="sm"
                              onClick={() => handleSendBillEmail(inv)}
                              disabled={isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber}
                              title={lang === "ar" ? "مشاركة وإرسال الفاتورة كصورة فوراً إلى إيميل العميل (بنقرة واحدة)" : "Share invoice card image directly to client email (1-click)"}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] h-7 px-2.5 gap-1.5 shadow-sm rounded-lg shrink-0 cursor-pointer"
                            >
                              {isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Share2 className="w-3 h-3" />
                              )}
                              <span>{lang === "ar" ? "مشاركة الفاتورة" : "Share Bill"}</span>
                            </Button>

                            {/* Download Invoice Card Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadInvoiceCard(inv)}
                              className="h-7 w-7 p-0 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg shrink-0 cursor-pointer"
                              title={lang === "ar" ? "تحميل بطاقة الفاتورة (PNG)" : "Download Invoice Card (PNG)"}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>

                            {/* View Invoice Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setViewingInvoice(inv);
                                setViewInvoiceModalOpen(true);
                              }}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg shrink-0 cursor-pointer"
                              title={lang === "ar" ? "معاينة الفاتورة" : "View Invoice"}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {/* Three dots Actions Dropdown Menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg shrink-0"
                                  title={lang === "ar" ? "المزيد من الإجراءات" : "More Actions"}
                                >
                                  <MoreVertical className="w-4 h-4" />
                                  <span className="sr-only">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="w-60 shadow-xl border border-border/80">
                                <DropdownMenuLabel className="text-xs font-semibold flex items-center justify-between pb-1.5">
                                  <span className="font-mono font-bold text-foreground">#{inv.invoiceNumber}</span>
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                    {inv.companyName}
                                  </span>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setViewingInvoice(inv);
                                    setViewInvoiceModalOpen(true);
                                  }}
                                  className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                                >
                                  <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
                                  <span>{lang === "ar" ? "عرض فاتورة الاستهلاك" : "View Usage Invoice"}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleSendBillEmail(inv)}
                                  className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                                >
                                  <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                                  <span>{lang === "ar" ? "إرسال الفاتورة عبر البريد" : "Send Bill via Email"}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCopySummary(inv)}
                                  className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                                >
                                  {copiedId === inv.id ? (
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-cyan-500 shrink-0" />
                                  )}
                                  <span>{lang === "ar" ? "نسخ ملخص الفاتورة" : "Copy Bill Summary"}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDownloadInvoiceCard(inv)}
                                  className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                                >
                                  <Download className="w-4 h-4 text-blue-500 shrink-0" />
                                  <span>{lang === "ar" ? "تحميل بطاقة الفاتورة" : "Download Invoice Card"}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleTogglePaid(inv)}
                                  disabled={togglingInvoice === inv.invoiceNumber}
                                  className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                                >
                                  {inv.isPaid ? (
                                    <>
                                      <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                                      <span>{lang === "ar" ? "تحديد كـ غير مسددة" : "Mark as Unpaid"}</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                      <span>{lang === "ar" ? "تأكيد السداد (مسددة)" : "Mark as Paid"}</span>
                                    </>
                                  )}
                                </DropdownMenuItem>
                                {!inv.isVoided && inv.state !== "voided" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {inv.isPaused || inv.state === "paused" ? (
                                      <DropdownMenuItem
                                        onClick={() => handleOpenResumeDialog(inv)}
                                        className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 focus:bg-emerald-500/10"
                                      >
                                        <Play className="w-4 h-4 text-emerald-500 fill-current shrink-0" />
                                        <span>{lang === "ar" ? "استئناف العملية والرموز" : "Resume Transaction"}</span>
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => handleOpenPauseDialog(inv)}
                                        className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-blue-600 dark:text-blue-400 focus:text-blue-600 focus:bg-blue-500/10"
                                      >
                                        <Pause className="w-4 h-4 text-blue-500 shrink-0" />
                                        <span>{lang === "ar" ? "إيقاف مؤقت وتجميد الرموز" : "Pause & Freeze Tokens"}</span>
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => handleOpenVoidDialog(inv)}
                                      className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-amber-600 dark:text-amber-400 focus:text-amber-600 focus:bg-amber-500/10"
                                    >
                                      <Ban className="w-4 h-4 text-amber-500 shrink-0" />
                                      <span>{lang === "ar" ? "إلغاء حجز العملية وخصم الرموز" : "Cancel Booking & Void"}</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleOpenDeleteDialog(inv)}
                                  className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10"
                                >
                                  <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                                  <span>{lang === "ar" ? "حذف الفاتورة نهائياً" : "Delete Invoice"}</span>
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

          {/* Mobile Flat Cards View (< md) */}
          <div className="block md:hidden">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                <span className="text-xs">{lang === "ar" ? "جاري تحميل الفواتير..." : "Loading invoices..."}</span>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-xs">{lang === "ar" ? "لا توجد فواتير مطابقة للبحث" : "No invoices found"}</p>
                <p className="text-[11px] text-muted-foreground/80 mt-1">
                  {lang === "ar" ? "جرّب تغيير فلاتر البحث أو حدد فترة أخرى." : "Try adjusting your search filters."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40 bg-background/50">
                {filteredInvoices.map((inv) => {
                  const localPrice = convertPrice(inv.priceUsd);
                  const invoiceEndDate = resolveInvoiceEndDate(inv);

                  return (
                    <div key={inv.id} className="p-3.5 space-y-3 hover:bg-muted/15 transition-colors">
                      {/* Row 1: Invoice # + type badge + state */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-foreground">#{inv.invoiceNumber}</span>
                          {inv.itemType === "plan" && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/30 text-blue-500 bg-blue-500/10">
                              {lang === "ar" ? "باقة" : "Plan"}
                            </Badge>
                          )}
                          {inv.itemType === "topup" && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/30 text-amber-500 bg-amber-500/10">
                              {lang === "ar" ? "شحن" : "Topup"}
                            </Badge>
                          )}
                          {inv.itemType === "quota_usage" && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                              {lang === "ar" ? "حصة" : "Quota"}
                            </Badge>
                          )}
                        </div>

                        <div className="shrink-0">
                          {inv.isVoided || inv.state === "voided" ? (
                            <Badge variant="outline" className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] font-semibold gap-1">
                              <Ban className="w-2.5 h-2.5" />
                              <span>{lang === "ar" ? "ملغاة" : "Voided"}</span>
                            </Badge>
                          ) : inv.isPaused || inv.state === "paused" ? (
                            <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-semibold gap-1">
                              <Pause className="w-2.5 h-2.5" />
                              <span>{lang === "ar" ? "معلقة مؤقتاً" : "Paused"}</span>
                            </Badge>
                          ) : inv.state === "active" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>{lang === "ar" ? "نشطة" : "Active"}</span>
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span>{lang === "ar" ? "معلقة" : "Pending"}</span>
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Company & Client Name */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-bold text-foreground flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          {inv.companyName}
                        </span>
                        {inv.clientName && (
                          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                            <User className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                            {inv.clientName}
                          </span>
                        )}
                        {inv.clientPhone && (
                          <span className="text-muted-foreground font-mono text-[11px] flex items-center gap-1">
                            <MessageCircle className="w-3 h-3 text-emerald-500/70 shrink-0" />
                            {inv.clientPhone}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Title & Cycle Details */}
                      <div>
                        <h4 className="font-bold text-sm text-foreground">
                          {lang === "ar" ? inv.titleAr : inv.titleEn}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                          <span>{inv.billingCycleAr}</span>
                          {inv.retentionDays && <span>• حفظ {inv.retentionDays} يوم</span>}
                          {invoiceEndDate && (
                            <span className="text-blue-600 dark:text-blue-400 font-medium inline-flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span>{lang === "ar" ? "ينتهي:" : "Exp:"} {invoiceEndDate}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Row 4: Key Metrics: Amount, Tokens, Date */}
                      <div className="grid grid-cols-2 gap-2 bg-muted/30 border border-border/50 rounded-xl p-2.5 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground block font-medium">
                            {lang === "ar" ? "المبلغ المستحق:" : "Amount:"}
                          </span>
                          {inv.isVoided || inv.state === "voided" ? (
                            <div>
                              <span className="line-through text-muted-foreground/60 text-xs font-mono">${inv.priceUsd} USD</span>
                              <span className="text-[10px] text-rose-500 font-bold block">{lang === "ar" ? "ملغاة ومخصومة" : "Voided"}</span>
                            </div>
                          ) : (
                            <div>
                              <div className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                                ${inv.priceUsd} USD
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono block">
                                ≈ {localPrice.toLocaleString()} {currencyInfo.symbol}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="border-s border-border/50 ps-2.5">
                          <span className="text-[10px] text-muted-foreground block font-medium">
                            {lang === "ar" ? "رصيد الرموز:" : "Tokens:"}
                          </span>
                          <div className="font-mono font-bold text-sm text-blue-500 mt-0.5">
                            {inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"}
                          </div>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            📅 {new Date(inv.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}
                          </span>
                        </div>
                      </div>

                      {/* Row 5: Action Row: Paid Switcher & Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePaid(inv)}
                          disabled={togglingInvoice === inv.invoiceNumber}
                          title={
                            inv.isPaid
                              ? (lang === "ar" ? "مسددة (انقر لإلغاء السداد)" : "Paid (Click to mark unpaid)")
                              : (lang === "ar" ? "غير مسددة (انقر للتحديد كمسددة)" : "Unpaid (Click to mark paid)")
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none ${
                            inv.isPaid
                              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted/50 border-border/70 text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-[4px] flex items-center justify-center transition-all ${
                              inv.isPaid
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "border-2 border-muted-foreground/40 bg-background"
                            }`}
                          >
                            {inv.isPaid && <Check className="w-3 h-3 stroke-[3]" />}
                          </span>
                          <span className="text-[11px]">
                            {inv.isPaid ? (lang === "ar" ? "مسددة" : "Paid") : (lang === "ar" ? "غير مسددة" : "Unpaid")}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          {/* Direct 1-Click Share Button */}
                          <Button
                            size="sm"
                            onClick={() => handleSendBillEmail(inv)}
                            disabled={isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber}
                            title={lang === "ar" ? "مشاركة وإرسال الفاتورة بنقرة واحدة" : "Share Bill (1-click)"}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-2.5 gap-1.5 shadow-sm rounded-lg cursor-pointer"
                          >
                            {isSendingCopy && sendingInvoiceNumber === inv.invoiceNumber ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Share2 className="w-3.5 h-3.5" />
                            )}
                            <span>{lang === "ar" ? "مشاركة الفاتورة" : "Share"}</span>
                          </Button>

                          {/* Download Image */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadInvoiceCard(inv)}
                            className="h-8 w-8 p-0 text-emerald-600 dark:text-emerald-400 rounded-lg cursor-pointer"
                            title={lang === "ar" ? "تحميل بطاقة الفاتورة (PNG)" : "Download Card (PNG)"}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setViewingInvoice(inv);
                              setViewInvoiceModalOpen(true);
                            }}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                            title={lang === "ar" ? "معاينة الفاتورة" : "View Invoice"}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg cursor-pointer"
                                title={lang === "ar" ? "المزيد من الإجراءات" : "More Actions"}
                              >
                                <MoreVertical className="w-4 h-4" />
                                <span className="sr-only">{lang === "ar" ? "الإجراءات" : "Actions"}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="w-60 shadow-xl border border-border/80">
                              <DropdownMenuLabel className="text-xs font-semibold flex items-center justify-between pb-1.5">
                                <span className="font-mono font-bold text-foreground">#{inv.invoiceNumber}</span>
                                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                  {inv.companyName}
                                </span>
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setViewingInvoice(inv);
                                  setViewInvoiceModalOpen(true);
                                }}
                                className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                              >
                                <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span>{lang === "ar" ? "عرض فاتورة الاستهلاك" : "View Usage Invoice"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleSendBillEmail(inv)}
                                className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                              >
                                <Mail className="w-4 h-4 text-amber-500 shrink-0" />
                                <span>{lang === "ar" ? "إرسال الفاتورة عبر البريد" : "Send Bill via Email"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCopySummary(inv)}
                                className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                              >
                                {copiedId === inv.id ? (
                                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : (
                                  <Copy className="w-4 h-4 text-cyan-500 shrink-0" />
                                )}
                                <span>{lang === "ar" ? "نسخ ملخص الفاتورة" : "Copy Bill Summary"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDownloadInvoiceCard(inv)}
                                className="text-xs cursor-pointer gap-2.5 py-1.5 font-medium"
                              >
                                <Download className="w-4 h-4 text-blue-500 shrink-0" />
                                <span>{lang === "ar" ? "تحميل بطاقة الفاتورة" : "Download Invoice Card"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleTogglePaid(inv)}
                                disabled={togglingInvoice === inv.invoiceNumber}
                                className="text-xs cursor-pointer gap-2 py-1.5 font-medium"
                              >
                                {inv.isPaid ? (
                                  <>
                                    <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                                    <span>{lang === "ar" ? "تحديد كـ غير مسددة" : "Mark as Unpaid"}</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span>{lang === "ar" ? "تأكيد السداد (مسددة)" : "Mark as Paid"}</span>
                                  </>
                                )}
                              </DropdownMenuItem>
                              {!inv.isVoided && inv.state !== "voided" && (
                                <>
                                  <DropdownMenuSeparator />
                                  {inv.isPaused || inv.state === "paused" ? (
                                    <DropdownMenuItem
                                      onClick={() => handleOpenResumeDialog(inv)}
                                      className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-emerald-600 dark:text-emerald-400 focus:text-emerald-600 focus:bg-emerald-500/10"
                                    >
                                      <Play className="w-4 h-4 text-emerald-500 fill-current shrink-0" />
                                      <span>{lang === "ar" ? "استئناف العملية والرموز" : "Resume Transaction"}</span>
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={() => handleOpenPauseDialog(inv)}
                                      className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-blue-600 dark:text-blue-400 focus:text-blue-600 focus:bg-blue-500/10"
                                    >
                                      <Pause className="w-4 h-4 text-blue-500 shrink-0" />
                                      <span>{lang === "ar" ? "إيقاف مؤقت وتجميد الرموز" : "Pause & Freeze Tokens"}</span>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => handleOpenVoidDialog(inv)}
                                    className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-amber-600 dark:text-amber-400 focus:text-amber-600 focus:bg-amber-500/10"
                                  >
                                    <Ban className="w-4 h-4 text-amber-500 shrink-0" />
                                    <span>{lang === "ar" ? "إلغاء حجز العملية وخصم الرموز" : "Cancel Booking & Void"}</span>
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleOpenDeleteDialog(inv)}
                                className="text-xs cursor-pointer gap-2 py-1.5 font-medium text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-500/10"
                              >
                                <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                                <span>{lang === "ar" ? "حذف الفاتورة نهائياً" : "Delete Invoice"}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* ── MODAL: SEND INVOICE COPY (إرسال نسخة من الفاتورة) ── */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Dialog open={sendCopyModalOpen} onOpenChange={setSendCopyModalOpen}>
        <DialogContent
          className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-[92vw] sm:max-w-lg rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <DialogHeader className="border-b border-border/50 pb-4">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold text-foreground">
              <Send className="w-5 h-5 text-emerald-500 shrink-0" />
              <span>{lang === "ar" ? "إرسال نسخة من الفاتورة" : "Send Invoice Copy"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "إرسال نسخة رسمية ومعتمدة من الفاتورة إلى العميل أو أي بريد/واتساب مخصص."
                : "Send an official certified copy of this invoice to the client or custom recipient."}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 py-2">
              {/* Selected Invoice Banner */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    #{selectedInvoice.invoiceNumber}
                  </span>
                  <span className="font-extrabold text-foreground">
                    ${selectedInvoice.priceUsd} USD{" "}
                    <span className="font-normal text-muted-foreground text-[11px]">
                      (~ {convertPrice(selectedInvoice.priceUsd).toLocaleString()} {currencyInfo.symbol})
                    </span>
                  </span>
                </div>
                <div className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? selectedInvoice.titleAr : selectedInvoice.titleEn}
                </div>
                <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
                  <span>🏢 {selectedInvoice.companyName}</span>
                  <span>•</span>
                  <span>👤 {selectedInvoice.clientName}</span>
                </div>
              </div>

              {/* Channel 1: Email Dispatch */}
              <div className="space-y-2.5 border border-border/60 rounded-xl p-3.5 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendViaEmail}
                      onChange={(e) => setSendViaEmail(e.target.checked)}
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>{lang === "ar" ? "إرسال بطاقة الفاتورة كصورة (Gmail / Email)" : "Send invoice card as image (Gmail / Email)"}</span>
                  </label>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{lang === "ar" ? "بطاقة صورة معتمدة 📷" : "Visual Image Card 📷"}</span>
                </div>

                {sendViaEmail && (
                  <div className="pt-1.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[11px] text-muted-foreground block">
                        {lang === "ar" ? "البريد الإلكتروني للمستلم:" : "Recipient Email:"}
                      </span>
                      {settingsNotificationEmail && (
                        <button
                          type="button"
                          onClick={() => setRecipientEmail(settingsNotificationEmail)}
                          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer break-all"
                          title={lang === "ar" ? "استخدام بريد الإعدادات" : "Use settings email"}
                        >
                          <span>🔑 {settingsNotificationEmail}</span>
                        </button>
                      )}
                    </div>
                    <Input
                      type="email"
                      placeholder="client@example.com"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                    {settingsNotificationEmail && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900/40 text-blue-900 dark:text-blue-200">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="break-all">
                            {lang === "ar"
                              ? "البريد المرتبط بـ RESEND_API_KEY في الإعدادات: "
                              : "Email linked with RESEND_API_KEY: "}
                            <strong className="underline">{settingsNotificationEmail}</strong>
                          </span>
                        </span>
                        {recipientEmail !== settingsNotificationEmail && (
                          <button
                            type="button"
                            onClick={() => setRecipientEmail(settingsNotificationEmail)}
                            className="text-xs font-bold text-blue-700 dark:text-blue-300 underline hover:text-blue-950 dark:hover:text-white shrink-0 self-start sm:self-auto cursor-pointer"
                          >
                            {lang === "ar" ? "استخدامه الآن" : "Apply"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Channel 2: WhatsApp Dispatch */}
              <div className="space-y-2.5 border border-border/60 rounded-xl p-3.5 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendViaWhatsApp}
                      onChange={(e) => setSendViaWhatsApp(e.target.checked)}
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{lang === "ar" ? "إرسال نسخة عبر الواتساب (WhatsApp)" : "Send copy via WhatsApp"}</span>
                  </label>
                  <span className="text-[10px] text-muted-foreground">WhatsApp API & Link</span>
                </div>

                {sendViaWhatsApp && (
                  <div className="pt-1.5 space-y-1">
                    <span className="text-[11px] text-muted-foreground block">
                      {lang === "ar" ? "رقم الهاتف / الواتساب للمستلم:" : "Recipient WhatsApp / Phone:"}
                    </span>
                    <Input
                      type="tel"
                      placeholder="01012345678 أو 9665..."
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      className="h-9 text-xs bg-background direction-ltr text-right"
                    />
                  </div>
                )}
              </div>

              {/* Optional Custom Admin Note */}
              <div className="space-y-1">
                <span className="text-xs font-semibold text-foreground block">
                  {lang === "ar" ? "ملاحظة أو رسالة إضافية من الإدارة (اختياري):" : "Admin Custom Note (Optional):"}
                </span>
                <Textarea
                  placeholder={
                    lang === "ar"
                      ? "اكتب أي ملاحظة تريد إرفاقها مع الفاتورة للعميل هنا..."
                      : "Add any custom note to accompany the invoice..."
                  }
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  rows={2}
                  className="text-xs bg-background resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-3 border-t border-border/50 pt-3 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSendCopyModalOpen(false)}
              disabled={isSendingCopy}
              className="text-xs w-full sm:w-auto cursor-pointer"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>

            <Button
              size="sm"
              onClick={handleSendCopySubmit}
              disabled={isSendingCopy || (!sendViaEmail && !sendViaWhatsApp)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm w-full sm:w-auto cursor-pointer"
            >
              {isSendingCopy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{lang === "ar" ? "إرسال النسخة الآن" : "Send Copy Now"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* ── Pause Invoice & Token Quota Confirmation Dialog ── */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] sm:w-[92vw] sm:max-w-md rounded-2xl p-4 sm:p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-2">
              <Pause className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">
              {lang === "ar" ? "إيقاف العملية مؤقتاً وتجميد الرموز" : "Pause Transaction & Freeze Tokens"}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              {invoiceToPause && (lang === "ar"
                ? `هل أنت متأكد من إيقاف عملية الفاتورة #${invoiceToPause.invoiceNumber} مؤقتاً؟ سيتم منع العميل من استخدام الرموز المرتبطة بها حتى تقوم باستئنافها.`
                : `Are you sure you want to pause invoice #${invoiceToPause.invoiceNumber}? Associated tokens will be withheld until resumed.`)}
            </DialogDescription>
          </DialogHeader>

          {invoiceToPause && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">
                    {lang === "ar" ? invoiceToPause.titleAr : invoiceToPause.titleEn}
                  </span>
                  <span className="font-mono font-bold text-foreground text-sm">
                    ${invoiceToPause.priceUsd} USD
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-800 dark:text-blue-300 space-y-1 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <Pause className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>
                      {lang === "ar"
                        ? `عند تأكيد الإيقاف المؤقت:`
                        : `Upon confirmation:`}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] font-normal space-y-0.5 text-blue-900 dark:text-blue-200 ps-1">
                    {Boolean(invoiceToPause.tokenQuota && invoiceToPause.tokenQuota > 0) ? (
                      <li>
                        {lang === "ar"
                          ? `حجب وتجميد ${invoiceToPause.tokenQuota?.toLocaleString()} رمز من حصة العميل مؤقتاً حتى لا يتمكن من استخدامها.`
                          : `Withhold ${invoiceToPause.tokenQuota?.toLocaleString()} tokens from user quota so they cannot utilize them.`}
                      </li>
                    ) : (
                      <li>
                        {lang === "ar"
                          ? "إيقاف العملية وحجب استخدام ميزاتها مؤقتاً."
                          : "Temporarily pause transaction features."}
                      </li>
                    )}
                    <li>
                      {lang === "ar"
                        ? "يمكنك استئناف العملية في أي وقت بنقرة واحدة وإعادة الرموز للعميل."
                        : "You can resume at any time to restore tokens to the client."}
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">
                  {lang === "ar" ? "سبب الإيقاف المؤقت (اختياري):" : "Pause Reason (Optional):"}
                </label>
                <Input
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: مراجعة الدفع، تعليق الحساب مؤقتاً..." : "e.g., Payment verification, temporary account hold..."}
                  className="text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPauseDialogOpen(false)}
              disabled={isPausing}
              className="text-xs"
            >
              {lang === "ar" ? "تراجع" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmPause}
              disabled={isPausing}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
            >
              {isPausing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{lang === "ar" ? "تأكيد الإيقاف المؤقت وتجميد الرموز" : "Confirm Pause & Freeze"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resume Invoice & Token Quota Confirmation Dialog ── */}
      <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] sm:w-[92vw] sm:max-w-md rounded-2xl p-4 sm:p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
              <Play className="w-6 h-6 fill-current" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">
              {lang === "ar" ? "استئناف العملية وإعادة تفعيل الرموز" : "Resume Transaction & Restore Tokens"}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              {invoiceToResume && (lang === "ar"
                ? `هل أنت متأكد من استئناف الفاتورة #${invoiceToResume.invoiceNumber}؟ سيتم إعادة تفعيل الرموز للعميل فوراً.`
                : `Are you sure you want to resume invoice #${invoiceToResume.invoiceNumber}? Tokens will be restored immediately.`)}
            </DialogDescription>
          </DialogHeader>

          {invoiceToResume && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">
                    {lang === "ar" ? invoiceToResume.titleAr : invoiceToResume.titleEn}
                  </span>
                  <span className="font-mono font-bold text-foreground text-sm">
                    ${invoiceToResume.priceUsd} USD
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 space-y-1 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 fill-current" />
                    <span>
                      {lang === "ar"
                        ? `عند تأكيد الاستئناف:`
                        : `Upon resuming:`}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] font-normal space-y-0.5 text-emerald-900 dark:text-emerald-200 ps-1">
                    {Boolean(invoiceToResume.tokenQuota && invoiceToResume.tokenQuota > 0) && (
                      <li>
                        {lang === "ar"
                          ? `إعادة إضافة ${invoiceToResume.tokenQuota?.toLocaleString()} رمز لحصة العميل ليتمكن من استخدامها فوراً.`
                          : `Restore ${invoiceToResume.tokenQuota?.toLocaleString()} tokens to user quota for immediate use.`}
                      </li>
                    )}
                    <li>
                      {lang === "ar"
                        ? "إعادة الحالة إلى نشطة وإتاحة كافة الميزات."
                        : "Return status to active and enable all features."}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResumeDialogOpen(false)}
              disabled={isResuming}
              className="text-xs"
            >
              {lang === "ar" ? "تراجع" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmResume}
              disabled={isResuming}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
            >
              {isResuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{lang === "ar" ? "تأكيد استئناف العملية والرموز" : "Confirm Resume & Restore"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* ── Void / Cancel Booking Confirmation Dialog ── */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] sm:w-[92vw] sm:max-w-md rounded-2xl p-4 sm:p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-2">
              <Ban className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">
              {lang === "ar" ? "إلغاء حجز العملية وتجميد الفاتورة" : "Cancel Booking & Void Transaction"}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              {invoiceToVoid && (lang === "ar"
                ? `هل أنت متأكد من إلغاء العملية للفاتورة #${invoiceToVoid.invoiceNumber} للعميل: ${invoiceToVoid.clientName}؟ سيتم وسم العملية كـ ملغاة (Voided).`
                : `Are you sure you want to void invoice #${invoiceToVoid.invoiceNumber} for client ${invoiceToVoid.clientName}? The booking will be marked as Voided.`)}
            </DialogDescription>
          </DialogHeader>

          {invoiceToVoid && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm">
                    {lang === "ar" ? invoiceToVoid.titleAr : invoiceToVoid.titleEn}
                  </span>
                  <span className="font-mono font-bold text-foreground text-sm">
                    ${invoiceToVoid.priceUsd} USD
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-1 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      {lang === "ar"
                        ? `عند تأكيد الإلغاء، سيتم تلقائياً:`
                        : `Upon confirmation, the following will be deducted:`}
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] font-normal space-y-0.5 text-amber-900 dark:text-amber-200 ps-1">
                    {Boolean(invoiceToVoid.tokenQuota && invoiceToVoid.tokenQuota > 0) && (
                      <li>
                        {lang === "ar"
                          ? `خصم ${invoiceToVoid.tokenQuota?.toLocaleString()} رمز (Tokens) من رصيد الشركة.`
                          : `Deduct ${invoiceToVoid.tokenQuota?.toLocaleString()} tokens from company quota.`}
                      </li>
                    )}
                    <li>
                      {lang === "ar"
                        ? `خصم تكلفة العملية (${invoiceToVoid.priceUsd}$ USD) وإلغاؤها من فواتير وحساب العميل.`
                        : `Deduct transaction cost ($${invoiceToVoid.priceUsd} USD) from customer account.`}
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">
                  {lang === "ar" ? "سبب الإلغاء (اختياري):" : "Void Reason (Optional):"}
                </label>
                <Input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: طلب العميل إلغاء الحجز، أو استرداد المبلغ..." : "e.g., Client requested cancellation, or refunded..."}
                  className="text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVoidDialogOpen(false)}
              disabled={isVoiding}
              className="text-xs"
            >
              {lang === "ar" ? "تراجع" : "Dismiss"}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmVoid}
              disabled={isVoiding}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
            >
              {isVoiding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              <span>{lang === "ar" ? "تأكيد إلغاء العملية وخصم التكلفة والرموز" : "Confirm Void & Deduct"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Invoice Confirmation Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] sm:w-[92vw] sm:max-w-md rounded-2xl p-4 sm:p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-2">
              <Trash2 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold text-rose-600 dark:text-rose-400">
              {lang === "ar" ? "حذف الفاتورة نهائياً" : "Delete Invoice Permanently"}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              {invoiceToDelete && (lang === "ar"
                ? `هل أنت متأكد من حذف الفاتورة #${invoiceToDelete.invoiceNumber}؟ سيتم حذفها نهائياً من سجلات الفواتير والاشتراكات.`
                : `Are you sure you want to permanently delete invoice #${invoiceToDelete.invoiceNumber}? It will be removed from all billing logs.`)}
            </DialogDescription>
          </DialogHeader>

          {invoiceToDelete && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-1">
              <div className="font-bold text-foreground">
                {lang === "ar" ? invoiceToDelete.titleAr : invoiceToDelete.titleEn}
              </div>
              <div className="text-muted-foreground">
                {lang === "ar" ? "الشركة: " : "Company: "}{invoiceToDelete.companyName} • {invoiceToDelete.priceUsd}$ USD
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="text-xs"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>{lang === "ar" ? "نعم، حذف نهائي" : "Yes, Delete"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: VIEW INVOICE FULL DETAILS ── */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Dialog open={viewInvoiceModalOpen} onOpenChange={setViewInvoiceModalOpen}>
        <DialogContent
          className="max-w-2xl w-[calc(100vw-1.5rem)] sm:w-[92vw] sm:max-w-2xl rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          {viewingInvoice && (() => {
            const localAmount = convertPrice(viewingInvoice.priceUsd);
            const invoiceEndDate = resolveInvoiceEndDate(viewingInvoice);

            return (
              <div className="space-y-4 sm:space-y-5">
                {/* Invoice Branded Header */}
                <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-2xl p-4 sm:p-6 border border-white/10 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="inline-block px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-[11px] font-semibold text-blue-200 mb-2">
                        BOT MANAGER • OFFICIAL INVOICE
                      </div>
                      <h2 className="text-lg sm:text-xl font-extrabold">
                        {lang === "ar" ? "فاتورة معتمدة ورسمية" : "Official Certified Invoice"}
                      </h2>
                      <p className="text-xs text-blue-200/80 mt-1 font-mono">
                        #{viewingInvoice.invoiceNumber}
                      </p>
                    </div>

                    <div className="flex flex-row sm:flex-col items-stretch sm:items-end flex-wrap gap-2 shrink-0">
                      <div className="text-right rtl:text-right ltr:text-left bg-emerald-500/20 border border-emerald-400/30 rounded-xl px-3 py-1.5 sm:py-2 flex-1 sm:flex-initial">
                        <span className="block text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                          {lang === "ar" ? "الحالة" : "Status"}
                        </span>
                        <strong className="text-xs sm:text-sm text-emerald-400">
                          {viewingInvoice.status === "paid" || viewingInvoice.status === "activated"
                            ? (lang === "ar" ? "✅ مسددة ومفعلة" : "✅ Paid & Active")
                            : (lang === "ar" ? "⏳ بانتظار الاعتماد" : "⏳ Pending")}
                        </strong>
                      </div>

                      {/* Prominent End Date Header Badge */}
                      <div className="bg-blue-500/25 border border-blue-400/40 rounded-xl px-3 py-1.5 text-right rtl:text-right ltr:text-left flex-1 sm:flex-initial">
                        <span className="block text-[9px] uppercase tracking-wider text-blue-200 font-semibold">
                          {lang === "ar" ? "تاريخ انتهاء الصلاحية" : "Expiration End Date"}
                        </span>
                        <strong className="text-xs text-blue-100 font-mono">
                          📅 {invoiceEndDate || (lang === "ar" ? "حسب دورة الاشتراك" : "Per Active Cycle")}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billed To / Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-muted/20 border border-border/60 rounded-xl p-3.5 sm:p-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{lang === "ar" ? "العميل:" : "Client:"}</span>
                    <strong className="text-foreground text-sm block mt-0.5">{viewingInvoice.clientName}</strong>
                    <span className="block text-muted-foreground mt-1 break-all">{viewingInvoice.clientEmail}</span>
                    {viewingInvoice.clientPhone && <span className="block text-muted-foreground font-mono mt-0.5">{viewingInvoice.clientPhone}</span>}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{lang === "ar" ? "الشركة:" : "Company:"}</span>
                    <strong className="text-foreground text-sm block mt-0.5">{viewingInvoice.companyName}</strong>
                    <span className="block text-muted-foreground mt-1">
                      {lang === "ar" ? "تاريخ الإصدار:" : "Date:"} {new Date(viewingInvoice.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}
                    </span>
                  </div>

                  {/* Prominent Full-Width End Date Card (Matching Image 2) */}
                  <div className="col-span-1 sm:col-span-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-muted-foreground text-[10px] block font-medium">
                          {lang === "ar" ? "فترة صلاحية الحصة (Quota Validity Period):" : "Quota Validity Period:"}
                        </span>
                        <strong className="text-emerald-800 dark:text-emerald-200 text-sm font-mono block mt-0.5">
                          📅 {new Date(viewingInvoice.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")} → {invoiceEndDate || (lang === "ar" ? "ساري المفعول" : "Active")}
                        </strong>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 self-start sm:self-auto">
                      {viewingInvoice.itemType === "topup"
                        ? (lang === "ar" ? "شحن رصيد إضافي ⚡" : "Top-up Allowance ⚡")
                        : (lang === "ar" ? "اشتراك باقة معتمدة ✓" : "Active Subscription ✓")}
                    </Badge>
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <div className="border border-border/60 rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[460px] sm:min-w-full text-xs">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground">
                        <th className="p-3 text-right rtl:text-right ltr:text-left">{lang === "ar" ? "البند" : "Item"}</th>
                        <th className="p-3 text-center">{lang === "ar" ? "الدورة" : "Cycle"}</th>
                        <th className="p-3 text-center">{lang === "ar" ? "الرموز" : "Tokens"}</th>
                        <th className="p-3 text-right rtl:text-right ltr:text-left">{lang === "ar" ? "المبلغ" : "Amount"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-3.5">
                          <strong className="block text-foreground text-sm">
                            {lang === "ar" ? viewingInvoice.titleAr : viewingInvoice.titleEn}
                          </strong>
                          {invoiceEndDate && (
                            <div className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1.5 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                              <Calendar className="w-3 h-3 shrink-0" />
                              <span>
                                {lang === "ar" ? "تاريخ انتهاء الصلاحية:" : "Expires:"} {invoiceEndDate}
                              </span>
                              {viewingInvoice.itemType === "topup" && (
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  {lang === "ar" ? "(مطابق لنهاية الاشتراك)" : "(Matches sub)"}
                                </span>
                              )}
                            </div>
                          )}
                          {viewingInvoice.retentionDays && (
                            <span className="text-[11px] text-muted-foreground block mt-1">
                              {lang === "ar" ? `سياسة الحفظ: ${viewingInvoice.retentionDays} يوم` : `Retention: ${viewingInvoice.retentionDays} days`}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center text-muted-foreground font-medium">
                          {viewingInvoice.billingCycleAr}
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-blue-500">
                          {viewingInvoice.tokenQuota?.toLocaleString()}
                        </td>
                        <td className="p-3.5 text-right rtl:text-right ltr:text-left font-mono font-bold text-sm text-foreground">
                          ${viewingInvoice.priceUsd} USD
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            ≈ {localAmount.toLocaleString()} {currencyInfo.symbol}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Payment Details for Unpaid Invoice */}
                {viewingInvoice.isPaid === false && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                          {lang === "ar" ? "بيانات وطرق السداد للعميل" : "Payment Transfer Details"}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40">
                        {lang === "ar" ? "غير مسددة" : "Unpaid"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Phone / Wallet */}
                      <div className="bg-card/90 border border-border/70 rounded-lg p-3 flex flex-col justify-between gap-2 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5 font-medium text-[11px]">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            {lang === "ar" ? "رقم الهاتف / كاش:" : "Phone / Cash Wallet:"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPayment(viewingInvoice.paymentPhone || "01000000000", "phone")}
                            className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          >
                            {copiedPayment === "phone" ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedPayment === "phone" ? (lang === "ar" ? "تم النسخ" : "Copied") : (lang === "ar" ? "نسخ" : "Copy")}</span>
                          </button>
                        </div>
                        <div className="font-mono font-bold text-sm text-foreground bg-muted/50 px-2.5 py-1.5 rounded-md select-all overflow-x-auto" dir="ltr">
                          {viewingInvoice.paymentPhone || "01000000000"}
                        </div>
                      </div>

                      {/* InstaPay IPA */}
                      <div className="bg-card/90 border border-border/70 rounded-lg p-3 flex flex-col justify-between gap-2 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5 font-medium text-[11px]">
                            <CreditCard className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            {lang === "ar" ? "عنوان إنستاباي (IPA):" : "InstaPay Address (IPA):"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPayment(viewingInvoice.paymentInstaPay || "username@instapay", "instapay")}
                            className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                          >
                            {copiedPayment === "instapay" ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedPayment === "instapay" ? (lang === "ar" ? "تم النسخ" : "Copied") : (lang === "ar" ? "نسخ" : "Copy")}</span>
                          </button>
                        </div>
                        <div className="font-mono font-bold text-xs sm:text-sm text-foreground bg-muted/50 px-2.5 py-1.5 rounded-md select-all overflow-x-auto break-all" dir="ltr">
                          {viewingInvoice.paymentInstaPay || "username@instapay"}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {lang === "ar"
                        ? "يتم تزويد العميل بهاتين الوسيلتين لسداد المبلغ المستحق عبر الإيميل والواتساب."
                        : "These payment details are automatically included in the client's invoice email and WhatsApp notice."}
                    </p>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-border/60">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    {/* Direct 1-Click Share Button (Matches Quota Usage Bill) */}
                    <Button
                      size="sm"
                      onClick={() => handleSendBillEmail(viewingInvoice)}
                      disabled={isSendingCopy}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-sm w-full sm:w-auto justify-center cursor-pointer"
                      title={lang === "ar" ? "مشاركة وإرسال الفاتورة كصورة فوراً إلى إيميل العميل (بنقرة واحدة)" : "Share invoice card directly to client email"}
                    >
                      {isSendingCopy ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{lang === "ar" ? "جارٍ المشاركة..." : "Sharing..."}</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span>{lang === "ar" ? "مشاركة الفاتورة (إيميل)" : "Share Bill (Email)"}</span>
                        </>
                      )}
                    </Button>

                    {/* Download Image Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadInvoiceCard(viewingInvoice)}
                      className="text-xs gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 w-full sm:w-auto justify-center cursor-pointer"
                      title={lang === "ar" ? "تحميل بطاقة الفاتورة عالية الدقة PNG" : "Download PNG"}
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{lang === "ar" ? "تحميل الصورة" : "Download Image"}</span>
                    </Button>

                    {/* Advanced Custom Send (WhatsApp / Custom Notes) */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setViewInvoiceModalOpen(false);
                        handleOpenSendCopy(viewingInvoice);
                      }}
                      className="text-xs gap-1.5 text-muted-foreground hover:text-foreground w-full sm:w-auto justify-center cursor-pointer"
                      title={lang === "ar" ? "إرسال نسخة مخصصة عبر واتساب أو بريد إضافي" : "Send custom copy"}
                    >
                      <Send className="w-3.5 h-3.5 text-blue-500" />
                      <span>{lang === "ar" ? "خيارات مخصصة" : "Custom Options"}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopySummary(viewingInvoice)}
                      className="text-xs gap-1.5 w-full sm:w-auto justify-center cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{lang === "ar" ? "نسخ التفاصيل" : "Copy"}</span>
                    </Button>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewInvoiceModalOpen(false)}
                    className="text-xs w-full sm:w-auto justify-center cursor-pointer"
                  >
                    {lang === "ar" ? "إغلاق" : "Close"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
