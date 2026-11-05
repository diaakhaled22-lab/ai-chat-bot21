import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
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

export default function AdminBills() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "plan" | "topup" | "quota_usage">("all");
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "pending">("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [selectedCurrency, setSelectedCurrency] = useState("EGP");

  const resolveInvoiceEndDate = (inv: InvoiceItem | null | undefined): string | null => {
    if (!inv) return null;
    const raw = inv.periodEnd || inv.endDate || (() => {
      const comp = companies.find((c) => c.id === inv.companyId);
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

      await customFetch("/api/admin/invoices/toggle-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: inv.invoiceNumber,
          ticketId: inv.ticketId ?? null,
          companyId: inv.companyId ?? null,
          isPaid: newPaid,
        }),
      });

      toast({
        title: newPaid
          ? (lang === "ar" ? "✅ تم تحديد الفاتورة كـ مسددة" : "Invoice marked as Paid ✅")
          : (lang === "ar" ? "⏳ تم إلغاء سداد الفاتورة" : "Invoice marked as Unpaid ⏳"),
        description:
          lang === "ar"
            ? `الفاتورة #${inv.invoiceNumber} أصبحت ${newPaid ? "مسددة (Paid)" : "غير مسددة (Unpaid)"}.`
            : `Invoice #${inv.invoiceNumber} is now ${newPaid ? "Paid" : "Unpaid"}.`,
      });

      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
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

  // Handle open Send Copy Modal
  const handleOpenSendCopy = (invoice: InvoiceItem) => {
    setSelectedInvoice(invoice);
    setRecipientEmail(invoice.clientEmail || "");
    setRecipientPhone(invoice.clientPhone || "");
    setSendViaEmail(true);
    setSendViaWhatsApp(Boolean(invoice.clientPhone));
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

      const res = await customFetch<{
        ok: boolean;
        message: string;
        emailSent: boolean;
        whatsappSent: boolean;
        whatsappUrl?: string;
        emailError?: string;
      }>("/api/admin/invoices/send-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: selectedInvoice.invoiceNumber,
          itemType: selectedInvoice.itemType,
          title: lang === "ar" ? selectedInvoice.titleAr : selectedInvoice.titleEn,
          recipientEmail: recipientEmail.trim(),
          recipientPhone: recipientPhone.trim(),
          sendViaEmail,
          sendViaWhatsApp,
          customNotes: customNotes.trim() || undefined,
          priceUsd: selectedInvoice.priceUsd,
          priceLocal: convertedLocal,
          currencySymbol: currencyInfo.symbol,
          clientName: selectedInvoice.clientName,
          companyName: selectedInvoice.companyName,
          tokenQuota: selectedInvoice.tokenQuota,
          retentionDays: selectedInvoice.retentionDays,
          billingCycle: selectedInvoice.billingCycleAr,
        }),
      });

      const successParts: string[] = [];
      if (res.emailSent) {
        successParts.push(lang === "ar" ? `البريد (${recipientEmail})` : `Email (${recipientEmail})`);
      }
      if (res.whatsappSent) {
        successParts.push(lang === "ar" ? `الواتساب مباشرة` : `WhatsApp direct`);
      }

      toast({
        title: lang === "ar" ? "✅ تم إرسال نسخة الفاتورة بنجاح!" : "Invoice Copy Sent Successfully!",
        description:
          successParts.length > 0
            ? (lang === "ar" ? `تم الإرسال عبر: ${successParts.join(" و ")}` : `Dispatched via: ${successParts.join(", ")}`)
            : (lang === "ar" ? "تمت المعالجة وتجهيز رابط المشاركة." : "Processed successfully."),
      });

      // If WhatsApp URL was created and WhatsApp was chosen, offer direct open
      if (res.whatsappUrl && sendViaWhatsApp) {
        window.open(res.whatsappUrl, "_blank");
      }

      setSendCopyModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في الإرسال" : "Failed to Send Copy",
        description: err?.message || (lang === "ar" ? "تعذر إرسال نسخة الفاتورة." : "Could not send invoice copy."),
        variant: "destructive",
      });
    } finally {
      setIsSendingCopy(false);
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
    <div className="space-y-6 pb-16">
      {/* ── Top Header Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-emerald-600/10 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #091e2f 0%, #0c334d 50%, #065f46 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-teal-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold">
              <Receipt className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "إدارة الفواتير والاشتراكات" : "Bills & Invoices Center"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {lang === "ar" ? "الفواتير وسندات القبض" : "Billing & Invoices"}
            </h1>
            <p className="text-emerald-100/80 text-sm leading-relaxed">
              {lang === "ar"
                ? "كشف شامل لكافة فواتير الاشتراكات، شحن الرصيد، واستهلاك الحصص. يمكنك إرسال نسخة رسمية من أي فاتورة للعميل عبر البريد الإلكتروني أو الواتساب بنقرة واحدة."
                : "Manage and inspect all subscription plan, top-up, and quota usage invoices. Send a copy of any invoice via Email or WhatsApp instantly."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-9 px-4 gap-2 shadow-lg shadow-emerald-500/25 rounded-xl transition-all"
            >
              <Send className="w-4 h-4" />
              <span>{lang === "ar" ? "إرسال نسخة من فاتورة" : "Send Invoice Copy"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 gap-1.5 rounded-xl backdrop-blur-sm"
              title={lang === "ar" ? "تحميل كشف الفواتير كملف CSV" : "Export invoices as CSV"}
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span className="hidden sm:inline">{lang === "ar" ? "تصدير (CSV)" : "Export CSV"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 gap-1.5 rounded-xl backdrop-blur-sm"
              title={lang === "ar" ? "طباعة الكشف" : "Print summary"}
            >
              <Printer className="w-4 h-4 text-teal-300" />
              <span className="hidden sm:inline">{lang === "ar" ? "طباعة" : "Print"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs h-9 gap-1.5 rounded-xl backdrop-blur-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Overview Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 [direction:ltr]">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "إجمالي الفواتير" : "Total Invoices"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">{stats.totalCount}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                {lang === "ar" ? `${stats.paidCount} مسددة • ${stats.unpaidCount} غير مسددة` : `${stats.paidCount} Paid • ${stats.unpaidCount} Unpaid`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 [direction:ltr]">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "القيمة الإجمالية" : "Total Value"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">
                ${stats.totalUsd.toLocaleString()}{" "}
                <span className="text-xs font-semibold text-muted-foreground">USD</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                ≈ {stats.totalLocal.toLocaleString()} {currencyInfo.symbol}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 [direction:ltr]">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-violet-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "الشركات المسجلة" : "Companies"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">{stats.uniqueCompanies}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                {lang === "ar" ? "شركات مسجلة بالفواتير" : "Companies with invoices"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 [direction:ltr]">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0" dir={lang === "ar" ? "rtl" : "ltr"}>
              <p className="text-xs text-muted-foreground font-medium text-center truncate max-w-full">
                {lang === "ar" ? "الباقات والشحن" : "Plans & Top-ups"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-foreground mt-0.5 text-center tabular-nums">
                {stats.planCount + stats.topupCount}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 text-center font-medium truncate max-w-full">
                {lang === "ar" ? `${stats.planCount} باقة • ${stats.topupCount} شحن` : `${stats.planCount} plans • ${stats.topupCount} topups`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col gap-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-2xl p-4 shadow-sm">
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
          <div className="flex items-center rounded-xl bg-background border border-border/60 p-1 shrink-0 self-start md:self-auto">
            <Button
              type="button"
              variant={viewMode === "grouped" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grouped")}
              className={`h-8 px-3 text-xs gap-1.5 rounded-lg font-semibold transition-all ${
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
              className={`h-8 px-3 text-xs gap-1.5 rounded-lg font-semibold transition-all ${
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
            <SelectTrigger className="w-[180px] h-9 text-xs bg-background rounded-xl border-border/60">
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
            <SelectTrigger className="w-[140px] h-9 text-xs bg-background rounded-xl border-border/60">
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
            <SelectTrigger className="w-[130px] h-9 text-xs bg-background rounded-xl border-border/60">
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
            <SelectTrigger className="w-[130px] h-9 text-xs bg-background rounded-xl border-border/60">
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
            <SelectTrigger className="w-[160px] h-9 text-xs bg-background rounded-xl border-border/60">
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
            <SelectTrigger className="w-[120px] h-9 text-xs bg-background rounded-xl border-border/60 font-semibold text-emerald-600 dark:text-emerald-400">
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
              className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
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

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-8 h-8 p-0 rounded-xl text-muted-foreground hover:text-foreground"
                          title={isCollapsed ? (lang === "ar" ? "توسيع الفواتير" : "Expand") : (lang === "ar" ? "طي الفواتير" : "Collapse")}
                        >
                          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Company Invoices Table (Expanded) */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
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
                            <th className="p-3 text-center min-w-[320px]">{lang === "ar" ? "إجراءات الفاتورة" : "Actions"}</th>
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
                                <td className="p-3 text-center whitespace-nowrap min-w-[320px]">
                                  <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenSendCopy(inv)}
                                      title={lang === "ar" ? "إرسال نسخة من الفاتورة عبر البريد أو الواتساب" : "Send copy via Email or WhatsApp"}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] h-7 px-2.5 gap-1 shadow-sm rounded-lg shrink-0"
                                    >
                                      <Send className="w-3 h-3" />
                                      <span>{lang === "ar" ? "إرسال نسخة" : "Send Copy"}</span>
                                    </Button>

                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setViewingInvoice(inv);
                                        setViewInvoiceModalOpen(true);
                                      }}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg shrink-0"
                                      title={lang === "ar" ? "معاينة الفاتورة" : "View Invoice"}
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleCopySummary(inv)}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg shrink-0"
                                      title={lang === "ar" ? "نسخ الملخص" : "Copy Summary"}
                                    >
                                      {copiedId === inv.id ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </Button>

                                    {/* Pause / Resume Button */}
                                    {!inv.isVoided && inv.state !== "voided" && (
                                      inv.isPaused || inv.state === "paused" ? (
                                        <Button
                                          size="sm"
                                          onClick={() => handleOpenResumeDialog(inv)}
                                          className="h-7 px-2.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-1 shrink-0 shadow-sm"
                                          title={lang === "ar" ? "استئناف العملية وإعادة تفعيل الرموز (Resume)" : "Resume Transaction & Tokens"}
                                        >
                                          <Play className="w-3 h-3 fill-current" />
                                          <span>{lang === "ar" ? "استئناف" : "Resume"}</span>
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleOpenPauseDialog(inv)}
                                          className="h-7 px-2.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-500/15 border-blue-500/40 bg-blue-500/5 rounded-lg gap-1 shrink-0 shadow-sm"
                                          title={lang === "ar" ? "إيقاف العملية وتجميد استخدام الرموز مؤقتاً (Pause Tokens)" : "Pause Transaction & Freeze Tokens"}
                                        >
                                          <Pause className="w-3 h-3" />
                                          <span>{lang === "ar" ? "إيقاف مؤقت" : "Pause"}</span>
                                        </Button>
                                      )
                                    )}

                                    {/* Void / Cancel Booking Button */}
                                    {!inv.isVoided && inv.state !== "voided" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenVoidDialog(inv)}
                                        className="h-7 px-2.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-500/15 border-amber-500/40 bg-amber-500/5 rounded-lg gap-1 shrink-0 shadow-sm"
                                        title={lang === "ar" ? "إلغاء حجز العملية وخصم الرموز (Void & Deduct Tokens)" : "Cancel Booking & Void"}
                                      >
                                        <Ban className="w-3 h-3" />
                                        <span>{lang === "ar" ? "إلغاء العملية" : "Void"}</span>
                                      </Button>
                                    )}

                                    {/* Delete Invoice Button */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenDeleteDialog(inv)}
                                      className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg shrink-0"
                                      title={lang === "ar" ? "حذف الفاتورة نهائياً" : "Delete Invoice"}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
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
                  )}
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* ── FLAT TABLE VIEW (ALTERNATIVE VIEW) ── */
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
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
                  <th className="p-3.5 text-center min-w-[320px]">{lang === "ar" ? "إجراءات الفاتورة" : "Actions"}</th>
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
                        <td className="p-3.5 text-center whitespace-nowrap min-w-[320px]">
                          <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                            <Button
                              size="sm"
                              onClick={() => handleOpenSendCopy(inv)}
                              title={lang === "ar" ? "إرسال نسخة من الفاتورة عبر البريد أو الواتساب" : "Send a copy via Email or WhatsApp"}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] h-7 px-2.5 gap-1 shadow-sm rounded-lg shrink-0"
                            >
                              <Send className="w-3 h-3" />
                              <span>{lang === "ar" ? "إرسال نسخة" : "Send Copy"}</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setViewingInvoice(inv);
                                setViewInvoiceModalOpen(true);
                              }}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg shrink-0"
                              title={lang === "ar" ? "معاينة الفاتورة" : "View Invoice"}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopySummary(inv)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg shrink-0"
                              title={lang === "ar" ? "نسخ الملخص" : "Copy Summary"}
                            >
                              {copiedId === inv.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>

                            {/* Pause / Resume Button */}
                            {!inv.isVoided && inv.state !== "voided" && (
                              inv.isPaused || inv.state === "paused" ? (
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenResumeDialog(inv)}
                                  className="h-7 px-2.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-1 shrink-0 shadow-sm"
                                  title={lang === "ar" ? "استئناف العملية وإعادة تفعيل الرموز (Resume)" : "Resume Transaction & Tokens"}
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{lang === "ar" ? "استئناف" : "Resume"}</span>
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenPauseDialog(inv)}
                                  className="h-7 px-2.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-500/15 border-blue-500/40 bg-blue-500/5 rounded-lg gap-1 shrink-0 shadow-sm"
                                  title={lang === "ar" ? "إيقاف العملية وتجميد استخدام الرموز مؤقتاً (Pause Tokens)" : "Pause Transaction & Freeze Tokens"}
                                >
                                  <Pause className="w-3 h-3" />
                                  <span>{lang === "ar" ? "إيقاف مؤقت" : "Pause"}</span>
                                </Button>
                              )
                            )}

                            {/* Void / Cancel Booking Button */}
                            {!inv.isVoided && inv.state !== "voided" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenVoidDialog(inv)}
                                className="h-7 px-2.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-500/15 border-amber-500/40 bg-amber-500/5 rounded-lg gap-1 shrink-0 shadow-sm"
                                title={lang === "ar" ? "إلغاء حجز العملية وخصم الرموز والتكلفة (Void & Deduct)" : "Cancel Booking & Void"}
                              >
                                <Ban className="w-3 h-3" />
                                <span>{lang === "ar" ? "إلغاء العملية" : "Void"}</span>
                              </Button>
                            )}

                            {/* Delete Invoice Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDeleteDialog(inv)}
                              className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-lg shrink-0"
                              title={lang === "ar" ? "حذف الفاتورة نهائياً" : "Delete Invoice"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* ── MODAL: SEND INVOICE COPY (إرسال نسخة من الفاتورة) ── */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Dialog open={sendCopyModalOpen} onOpenChange={setSendCopyModalOpen}>
        <DialogContent className="max-w-lg w-[95vw] rounded-2xl p-6">
          <DialogHeader className="border-b border-border/50 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Send className="w-5 h-5 text-emerald-500" />
              <span>{lang === "ar" ? "إرسال نسخة من الفاتورة" : "Send Invoice Copy"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "إرسال نسخة رسمية ومعتمدة من الفاتورة إلى العميل أو أي بريد/واتساب مخصص."
                : "Send an official certified copy of this invoice to the client or custom recipient."}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 py-2">
              {/* Selected Invoice Banner */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
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
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>🏢 {selectedInvoice.companyName}</span>
                  <span>•</span>
                  <span>👤 {selectedInvoice.clientName}</span>
                </div>
              </div>

              {/* Channel 1: Email Dispatch */}
              <div className="space-y-2.5 border border-border/60 rounded-xl p-3.5 bg-card">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendViaEmail}
                      onChange={(e) => setSendViaEmail(e.target.checked)}
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    <Mail className="w-4 h-4 text-blue-500" />
                    <span>{lang === "ar" ? "إرسال نسخة عبر البريد الإلكتروني (Email)" : "Send copy via Email"}</span>
                  </label>
                  <span className="text-[10px] text-muted-foreground">HTML Invoice</span>
                </div>

                {sendViaEmail && (
                  <div className="pt-1.5 space-y-1">
                    <span className="text-[11px] text-muted-foreground block">
                      {lang === "ar" ? "البريد الإلكتروني للمستلم:" : "Recipient Email:"}
                    </span>
                    <Input
                      type="email"
                      placeholder="client@example.com"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                )}
              </div>

              {/* Channel 2: WhatsApp Dispatch */}
              <div className="space-y-2.5 border border-border/60 rounded-xl p-3.5 bg-card">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendViaWhatsApp}
                      onChange={(e) => setSendViaWhatsApp(e.target.checked)}
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    <MessageCircle className="w-4 h-4 text-emerald-500" />
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
              className="text-xs"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>

            <Button
              size="sm"
              onClick={handleSendCopySubmit}
              disabled={isSendingCopy || (!sendViaEmail && !sendViaWhatsApp)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm"
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
        <DialogContent className="max-w-md p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
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
        <DialogContent className="max-w-md p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
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
        <DialogContent className="max-w-md p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
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
        <DialogContent className="max-w-md p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
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
        <DialogContent className="max-w-2xl w-[95vw] rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          {viewingInvoice && (() => {
            const localAmount = convertPrice(viewingInvoice.priceUsd);
            const invoiceEndDate = resolveInvoiceEndDate(viewingInvoice);

            return (
              <div className="space-y-5">
                {/* Invoice Branded Header */}
                <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white rounded-2xl p-6 border border-white/10 shadow-md">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="inline-block px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-[11px] font-semibold text-blue-200 mb-2">
                        BOT MANAGER • OFFICIAL INVOICE
                      </div>
                      <h2 className="text-xl font-extrabold">
                        {lang === "ar" ? "فاتورة معتمدة ورسمية" : "Official Certified Invoice"}
                      </h2>
                      <p className="text-xs text-blue-200/80 mt-1 font-mono">
                        #{viewingInvoice.invoiceNumber}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right rtl:text-right ltr:text-left bg-emerald-500/20 border border-emerald-400/30 rounded-xl px-3 py-2">
                        <span className="block text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                          {lang === "ar" ? "الحالة" : "Status"}
                        </span>
                        <strong className="text-sm text-emerald-400">
                          {viewingInvoice.status === "paid" || viewingInvoice.status === "activated"
                            ? (lang === "ar" ? "✅ مسددة ومفعلة" : "✅ Paid & Active")
                            : (lang === "ar" ? "⏳ بانتظار الاعتماد" : "⏳ Pending")}
                        </strong>
                      </div>

                      {/* Prominent End Date Header Badge */}
                      <div className="bg-blue-500/25 border border-blue-400/40 rounded-xl px-3 py-1.5 text-right rtl:text-right ltr:text-left">
                        <span className="block text-[9px] uppercase tracking-wider text-blue-200 font-semibold">
                          {lang === "ar" ? "تاريخ انتهاء الصلاحية (End Date)" : "Expiration End Date"}
                        </span>
                        <strong className="text-xs text-blue-100 font-mono">
                          📅 {invoiceEndDate || (lang === "ar" ? "حسب دورة الاشتراك" : "Per Active Cycle")}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Billed To / Details */}
                <div className="grid grid-cols-2 gap-4 bg-muted/20 border border-border/60 rounded-xl p-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{lang === "ar" ? "العميل:" : "Client:"}</span>
                    <strong className="text-foreground text-sm">{viewingInvoice.clientName}</strong>
                    <span className="block text-muted-foreground mt-1">{viewingInvoice.clientEmail}</span>
                    {viewingInvoice.clientPhone && <span className="block text-muted-foreground">{viewingInvoice.clientPhone}</span>}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{lang === "ar" ? "الشركة:" : "Company:"}</span>
                    <strong className="text-foreground text-sm">{viewingInvoice.companyName}</strong>
                    <span className="block text-muted-foreground mt-1">
                      {lang === "ar" ? "تاريخ الإصدار:" : "Date:"} {new Date(viewingInvoice.issueDate).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Prominent Full-Width End Date Card */}
                  <div className="col-span-2 p-3 bg-blue-500/10 border border-blue-500/25 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="text-muted-foreground text-[10px] block font-medium">
                          {lang === "ar" ? "تاريخ انتهاء صلاحية الفاتورة (End Date):" : "Official Expiration End Date:"}
                        </span>
                        <strong className="text-foreground text-sm font-mono block mt-0.5">
                          📅 {invoiceEndDate || (lang === "ar" ? "ساري المفعول (حسب دورة الاشتراك)" : "Active (Per Subscription)")}
                        </strong>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30">
                      {viewingInvoice.itemType === "topup"
                        ? (lang === "ar" ? "شحن رصيد إضافي ⚡" : "Top-up Allowance ⚡")
                        : (lang === "ar" ? "اشتراك باقة معتمدة ✓" : "Active Subscription ✓")}
                    </Badge>
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <div className="border border-border/60 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
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
                              سياسة الحفظ: {viewingInvoice.retentionDays} يوم
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

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setViewInvoiceModalOpen(false);
                        handleOpenSendCopy(viewingInvoice);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{lang === "ar" ? "إرسال نسخة من الفاتورة" : "Send Copy"}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopySummary(viewingInvoice)}
                      className="text-xs gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{lang === "ar" ? "نسخ التفاصيل" : "Copy"}</span>
                    </Button>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewInvoiceModalOpen(false)}
                    className="text-xs"
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
