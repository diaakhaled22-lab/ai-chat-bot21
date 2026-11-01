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
  retentionDays?: number | null;
  channels?: string[];
  tools?: string[];
  status: "paid" | "activated" | "pending";
  issueDate: string;
  notes?: string;
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
  const [typeFilter, setTypeFilter] = useState<"all" | "plan" | "topup" | "quota_usage">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "activated" | "pending">("all");
  const [selectedCurrency, setSelectedCurrency] = useState("EGP");

  // Send Copy Modal state
  const [sendCopyModalOpen, setSendCopyModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [sendViaWhatsApp, setSendViaWhatsApp] = useState(true);
  const [customNotes, setCustomNotes] = useState("");
  const [isSendingCopy, setIsSendingCopy] = useState(false);

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

  const invoices = data?.invoices || [];
  const rates = data?.rates || {};

  // Currency rate calculator
  const currencyInfo = SUPPORTED_CURRENCIES[selectedCurrency] || SUPPORTED_CURRENCIES.EGP;
  const activeRate = rates[selectedCurrency] || currencyInfo.rate;

  const convertPrice = (usd: number) => {
    return Math.round(usd * activeRate);
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Type filter
      if (typeFilter !== "all" && inv.itemType !== typeFilter) return false;

      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "paid" && inv.status !== "paid" && inv.status !== "activated") return false;
        if (statusFilter === "pending" && inv.status !== "pending") return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = inv.invoiceNumber.toLowerCase().includes(q);
        const compMatch = inv.companyName.toLowerCase().includes(q);
        const clientMatch = inv.clientName.toLowerCase().includes(q);
        const titleMatch = (inv.titleAr + " " + inv.titleEn).toLowerCase().includes(q);
        if (!numMatch && !compMatch && !clientMatch && !titleMatch) return false;
      }

      return true;
    });
  }, [invoices, typeFilter, statusFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = invoices.length;
    const planCount = invoices.filter((i) => i.itemType === "plan").length;
    const topupCount = invoices.filter((i) => i.itemType === "topup").length;
    const quotaCount = invoices.filter((i) => i.itemType === "quota_usage").length;
    const totalUsd = invoices.reduce((acc, i) => acc + (i.priceUsd || 0), 0);
    const totalLocal = convertPrice(totalUsd);

    return { totalCount, planCount, topupCount, quotaCount, totalUsd, totalLocal };
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
      `الحالة: ${inv.status === "paid" || inv.status === "activated" ? "معتمدة ومسددة ✅" : "معلقة ⏳"}`,
      `تاريخ الإصدار: ${new Date(inv.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}`,
    ].join("\n");

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
      "Status",
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
      inv.status,
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
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {lang === "ar" ? "إجمالي الفواتير" : "Total Invoices"}
              </p>
              <h3 className="text-xl font-extrabold text-foreground mt-0.5">{stats.totalCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {lang === "ar" ? "القيمة الإجمالية" : "Total Value"}
              </p>
              <h3 className="text-xl font-extrabold text-foreground mt-0.5">
                ${stats.totalUsd.toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">USD</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                ≈ {stats.totalLocal.toLocaleString()} {currencyInfo.symbol}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {lang === "ar" ? "فواتير الباقات" : "Plan Invoices"}
              </p>
              <h3 className="text-xl font-extrabold text-foreground mt-0.5">{stats.planCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {lang === "ar" ? "شحن رصيد / حصص" : "Top-up & Quotas"}
              </p>
              <h3 className="text-xl font-extrabold text-foreground mt-0.5">
                {stats.topupCount + stats.quotaCount}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-2xl p-4 shadow-sm">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-muted-foreground absolute right-3.5 rtl:right-3.5 ltr:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder={
              lang === "ar"
                ? "بحث برقم الفاتورة، اسم الشركة، اسم العميل..."
                : "Search by invoice #, company, client..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rtl:pr-10 ltr:pl-10 h-10 bg-background text-sm rounded-xl border-border/60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-[140px] h-10 text-xs bg-background rounded-xl border-border/60">
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

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[130px] h-10 text-xs bg-background rounded-xl border-border/60">
              <SelectValue placeholder={lang === "ar" ? "الحالة" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "جميع الحالات" : "All Status"}</SelectItem>
              <SelectItem value="paid">{lang === "ar" ? "نشطة / مسددة" : "Active / Paid"}</SelectItem>
              <SelectItem value="pending">{lang === "ar" ? "معلقة" : "Pending"}</SelectItem>
            </SelectContent>
          </Select>

          {/* Currency Switcher */}
          <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
            <SelectTrigger className="w-[120px] h-10 text-xs bg-background rounded-xl border-border/60 font-semibold text-emerald-600 dark:text-emerald-400">
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
        </div>
      </div>

      {/* ── Invoices List Table ── */}
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
                <th className="p-3.5 text-center">{lang === "ar" ? "الحالة" : "Status"}</th>
                <th className="p-3.5 text-center">{lang === "ar" ? "إجراءات الفاتورة" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    <span>{lang === "ar" ? "جاري تحميل الفواتير..." : "Loading invoices..."}</span>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
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
                  const isPaid = inv.status === "paid" || inv.status === "activated";

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
                        {inv.tokenQuota ? inv.tokenQuota.toLocaleString() : "—"}
                      </td>

                      {/* Issue Date */}
                      <td className="p-3.5 text-center font-mono text-muted-foreground">
                        {new Date(inv.issueDate).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>

                      {/* Amount */}
                      <td className="p-3.5 text-right rtl:text-right ltr:text-left">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                            ${inv.priceUsd} USD
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            ≈ {localPrice.toLocaleString()} {currencyInfo.symbol}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        {isPaid ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px]">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {lang === "ar" ? "مسددة ونشطة" : "Active & Paid"}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px]">
                            <Clock className="w-3 h-3 mr-1" />
                            {lang === "ar" ? "معلقة" : "Pending"}
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* ── THE PROMINENT "SEND COPY" BUTTON ── */}
                          <Button
                            size="sm"
                            onClick={() => handleOpenSendCopy(inv)}
                            title={lang === "ar" ? "إرسال نسخة من الفاتورة عبر البريد أو الواتساب" : "Send a copy via Email or WhatsApp"}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] h-7 px-2.5 gap-1 shadow-sm rounded-lg"
                          >
                            <Send className="w-3 h-3" />
                            <span>{lang === "ar" ? "إرسال نسخة" : "Send Copy"}</span>
                          </Button>

                          {/* View Full Invoice */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setViewingInvoice(inv);
                              setViewInvoiceModalOpen(true);
                            }}
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-lg"
                            title={lang === "ar" ? "معاينة الفاتورة" : "View Invoice"}
                          >
                            <Eye className="w-3 h-3" />
                          </Button>

                          {/* Copy Summary */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopySummary(inv)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-lg"
                            title={lang === "ar" ? "نسخ الملخص" : "Copy Summary"}
                          >
                            {copiedId === inv.id ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
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
      {/* ── MODAL: VIEW INVOICE FULL DETAILS ── */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <Dialog open={viewInvoiceModalOpen} onOpenChange={setViewInvoiceModalOpen}>
        <DialogContent className="max-w-2xl w-[95vw] rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          {viewingInvoice && (() => {
            const localAmount = convertPrice(viewingInvoice.priceUsd);
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
                      <p className="text-xs text-blue-200/80 mt-1">
                        #{viewingInvoice.invoiceNumber}
                      </p>
                    </div>

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
                          {viewingInvoice.retentionDays && (
                            <span className="text-[11px] text-muted-foreground block mt-0.5">
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
