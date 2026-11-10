import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetClientCompany,
  getGetClientCompanyQueryKey,
  useGetClientChatLogRetention,
  customFetch,
} from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { useExchangeRates, CURRENCY_METADATA } from "@/hooks/use-exchange-rates";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClientOnboardingProgress, checkIsCompanyProfileComplete } from "@/components/client/ClientOnboardingProgress";
import {
  Check,
  Package,
  Lock,
  Sparkles,
  ShieldCheck,
  Zap,
  Coins,
  Building2,
  LifeBuoy,
  MessageSquare,
  Bot,
  Layers,
  ArrowRight,
  Send,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  Globe,
  Star,
  Clock,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Phone,
  RotateCcw,
  Wrench,
  Calendar as CalendarIcon,
  FileSpreadsheet,
  Users,
  Volume2,
  FileText,
  Plug,
  Code2,
  ShoppingBag,
  Database,
  SlidersHorizontal,
} from "lucide-react";
import { COMMUNICATION_CHANNELS, SYSTEM_TOOLS, DATA_SOURCE_PERMISSIONS } from "@/pages/admin/AdminPackages";
import { CLIENT_PAGES_META } from "@/pages/admin/AdminCompanies";

type CurrencyCode = "USD" | "SAR" | "AED" | "EGP";

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  nameAr: string;
  nameEn: string;
  flag: string;
  exchangeRate: number; // relative to 1 USD
}

const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: {
    code: "USD",
    symbol: "$",
    nameAr: "دولار أمريكي",
    nameEn: "US Dollar",
    flag: "🇺🇸",
    exchangeRate: 1.0,
  },
  SAR: {
    code: "SAR",
    symbol: "ر.س",
    nameAr: "ريال سعودي",
    nameEn: "Saudi Riyal",
    flag: "🇸🇦",
    exchangeRate: 3.75,
  },
  AED: {
    code: "AED",
    symbol: "د.إ",
    nameAr: "درهم إماراتي",
    nameEn: "UAE Dirham",
    flag: "🇦🇪",
    exchangeRate: 3.67,
  },
  EGP: {
    code: "EGP",
    symbol: "ج.م",
    nameAr: "جنيه مصري",
    nameEn: "Egyptian Pound",
    flag: "🇪🇬",
    exchangeRate: 48.5,
  },
};

interface PlanDef {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  monthlyPriceUsd: number;
  tokensMonthly: number;
  tokensFormatted?: string;
  popular?: boolean;
  color?: string;
  gradient?: string;
  badgeAr?: string;
  badgeEn?: string;
  featuresAr: string[];
  featuresEn: string[];
  allowedPages?: string[];
  retentionDays?: number | null;
  channels?: string[];
  tools?: string[];
  dataSources?: string[];
  isActive?: boolean;
}

const DEFAULT_PLANS: PlanDef[] = [
  {
    id: "free_trial",
    nameAr: "الباقة التجريبية المجانية (7 أيام)",
    nameEn: "Free 7-Day Trial",
    descriptionAr: "تجربة مجانية كاملة لجميع مميزات المنصة والذكاء الاصطناعي لمدة 7 أيام دون أي تكلفة.",
    descriptionEn: "Full 7-day free trial of all platform features and AI automation at zero cost.",
    monthlyPriceUsd: 0,
    tokensMonthly: 25_000,
    tokensFormatted: "25,000",
    color: "#10b981",
    gradient: "from-emerald-600/20 to-teal-600/10",
    badgeAr: "تجربة مجانية",
    badgeEn: "Free Trial",
    channels: ["widget", "telegram"],
    tools: ["leads_crm"],
    dataSources: ["website", "files"],
    retentionDays: 7,
    featuresAr: [
      "25,000 رمز مجاني (AI Tokens)",
      "صلاحية كاملة لمدة 7 أيام",
      "ويدجت الموقع الإلكتروني وبوت تليجرام",
      "قاعدة معرفية ذكية لتدريب الشات بوت",
      "إدارة المحادثات وسجلات الشات",
      "دعم فني واستشارات مجانية",
    ],
    featuresEn: [
      "25,000 Free AI Tokens",
      "Valid for 7 full days",
      "Website Widget + Telegram Bot",
      "Smart Knowledge Base training",
      "Real-time Chat Logs",
      "Free technical support",
    ],
    allowedPages: [
      "dashboard",
      "notifications",
      "company",
      "packages",
      "ai_model",
      "usage",
      "knowledge",
      "channels",
      "widget_preview",
      "support",
      "malfunctions",
      "settings",
    ],
    isActive: true,
  },
  {
    id: "starter",
    nameAr: "الباقة الأساسية (Starter)",
    nameEn: "Starter Plan",
    descriptionAr: "مثالية للمشاريع الناشئة والشركات الصغيرة لبدء أتمتة الردود وخدمة العملاء.",
    descriptionEn: "Perfect for startups and small businesses starting with AI automation.",
    monthlyPriceUsd: 20,
    tokensMonthly: 500_000,
    tokensFormatted: "500,000",
    color: "#3b82f6",
    gradient: "from-blue-600/20 to-cyan-600/10",
    channels: ["widget", "telegram"],
    tools: ["leads_crm"],
    dataSources: ["website", "files"],
    featuresAr: [
      "500,000 رمز شهرياً (AI Tokens)",
      "قناتين: ويدجت الموقع الإلكتروني + بوت تليجرام",
      "قاعدة معارف ذكية (حتى 5 مستندات/ملفات)",
      "سجلات المحادثة المباشرة",
      "إشعارات البريد الإلكتروني للتنبيهات",
      "دعم فني عبر التذاكر (خلال 24 ساعة)",
    ],
    featuresEn: [
      "500,000 monthly AI Tokens",
      "2 Channels: Website Widget + Telegram Bot",
      "Smart Knowledge Base (up to 5 documents)",
      "Real-time Chat Logs",
      "Email notifications & alerts",
      "Ticket support (response within 24h)",
    ],
    retentionDays: 3,
  },
  {
    id: "pro",
    nameAr: "الباقة الاحترافية (Professional)",
    nameEn: "Professional Plan",
    descriptionAr: "الخيار الأفضل للعيادات والشركات المتنامية مع ربط كامل بالقنوات والتقويم.",
    descriptionEn: "Best for growing companies and clinics needing multi-channel CRM & booking.",
    monthlyPriceUsd: 25,
    tokensMonthly: 1_000_000,
    tokensFormatted: "1,000,000",
    popular: true,
    color: "#2D5BE3",
    gradient: "from-[#2D5BE3]/30 via-indigo-600/20 to-purple-600/10",
    badgeAr: "الأكثر طلباً",
    badgeEn: "Most Popular",
    channels: ["widget", "telegram", "whatsapp", "messenger"],
    tools: ["calendar", "sheets", "leads_crm", "handoff", "web_sync"],
    dataSources: ["website", "files", "wordpress"],
    featuresAr: [
      "1,000,000 رمز شهرياً (AI Tokens)",
      "جميع القنوات: موقع + تليجرام + واتساب + ماسنجر",
      "قاعدة معارف غير محدودة (مستندات، روابط، مواقع)",
      "تكامل تقويم Google وجداول Google للحجوزات",
      "نظام إدارة العملاء المحتملين والحجوزات (Leads CRM)",
      "صندوق الوارد الموحد والتحويل لموظف بشري (Handoff)",
      "دعم فني أولوية عبر التذاكر والشات المباشر",
    ],
    featuresEn: [
      "1,000,000 monthly AI Tokens",
      "All channels: Website + Telegram + WhatsApp + Messenger",
      "Unlimited Knowledge Base (docs, links, scrapers)",
      "Google Calendar & Google Sheets integration",
      "Leads & Appointments CRM tracking",
      "Universal Chat Inbox with Human Handoff",
      "Priority technical support & instant alerts",
    ],
    retentionDays: 7,
  },
  {
    id: "enterprise",
    nameAr: "باقة الشركات الكبرى (Enterprise)",
    nameEn: "Enterprise Plan",
    descriptionAr: "للمؤسسات والمنصات ذات الاستهلاك العالي التي تتطلب أداءً فائقاً وتخصيصاً كاملاً.",
    descriptionEn: "For enterprises requiring high throughput, custom integrations, and SLA.",
    monthlyPriceUsd: 30,
    tokensMonthly: 1_500_000,
    tokensFormatted: "1,500,000",
    color: "#8b5cf6",
    gradient: "from-purple-600/25 to-pink-600/10",
    badgeAr: "أعلى أداء",
    badgeEn: "Top Performance",
    channels: ["widget", "telegram", "whatsapp", "messenger", "webhook"],
    tools: ["calendar", "sheets", "leads_crm", "handoff", "voice", "web_sync"],
    dataSources: ["website", "files", "wordpress", "rest_api", "shopify"],
    featuresAr: [
      "1,500,000 رمز شهرياً (AI Tokens)",
      "جميع ميزات الباقة الاحترافية بالكامل",
      "قنوات الويب هوك المخصصة (Custom Webhooks & REST API)",
      "تخصيص كامل للتوجيهات وأنظمة حماية البيانات (Prompt Security)",
      "إمكانية استخدام مفتاح API خاص أو حصة المنصة",
      "مدير حساب مخصص ومتابعة دورية للأداء",
      "اتفاقية مستوى الخدمة SLA بنسبة جاهزية 99.9%",
    ],
    featuresEn: [
      "1,500,000 monthly AI Tokens",
      "All Professional Plan features included",
      "Custom Webhooks & REST API channel integrations",
      "Custom prompt engineering & enterprise prompt security",
      "Flexibility: Own API keys or platform managed quota",
      "Dedicated account manager & performance review",
      "99.9% uptime Service Level Agreement (SLA)",
    ],
    retentionDays: 14,
  },
];

interface TopupItemDef {
  id?: string;
  tokens: number;
  formatted: string;
  priceUsd: number;
  isActive?: boolean;
}

const DEFAULT_TOPUP_PACKS: TopupItemDef[] = [
  { id: "topup-25k", tokens: 25_000, formatted: "+25K", priceUsd: 5 },
  { id: "topup-50k", tokens: 50_000, formatted: "+50K", priceUsd: 10 },
  { id: "topup-100k", tokens: 100_000, formatted: "+100K", priceUsd: 18 },
  { id: "topup-250k", tokens: 250_000, formatted: "+250K", priceUsd: 40 },
];

function formatPlanFeature(feat: string, plan: PackageItem, isAr: boolean): string {
  if (!plan.tokensMonthly) return feat;
  const formattedTokens = plan.tokensFormatted || Number(plan.tokensMonthly).toLocaleString();
  const isTokenLine = /^[\d,kKmM.]+\s*(?:monthly AI Tokens|tokens?|رمز شهرياً|رمز مجاني|رموز|رمز)/i.test(feat.trim())
    || /[\d,kKmM.]+\s*(?:monthly AI Tokens|رمز شهرياً \(AI Tokens\))/i.test(feat);
  if (isTokenLine) {
    return isAr ? `${formattedTokens} رمز شهرياً (AI Tokens)` : `${formattedTokens} monthly AI Tokens`;
  }
  return feat;
}

export default function ClientPackages() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>("USD");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  // Plan Subscription Modal State
  const [selectedPlan, setSelectedPlan] = useState<PlanDef | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clientPhone, setClientPhone] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [selectedRetention, setSelectedRetention] = useState<number | null>(30);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["widget", "telegram", "whatsapp", "messenger"]);
  const [selectedTools, setSelectedTools] = useState<string[]>(["calendar", "sheets", "leads_crm", "handoff"]);
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>(["website", "files", "wordpress"]);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [submittedPlans, setSubmittedPlans] = useState<Record<string, { phone: string; submittedAt?: string }>>({});
  const [activeSelectedPlanId, setActiveSelectedPlanId] = useState<string | null>(null);

  // Client Chat Log Retention Query
  const { data: retentionData } = useGetClientChatLogRetention();

  // Topup request modal
  const [topupPack, setTopupPack] = useState<TopupItemDef | null>(null);
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [topupNotes, setTopupNotes] = useState("");

  // Dynamically load packages from admin configuration
  const { data: catalogData } = useQuery<{
    packages: PlanDef[];
    topupPacks: TopupItemDef[];
  }>({
    queryKey: ["packages-catalog"],
    queryFn: () => customFetch("/api/client/packages/catalog"),
    staleTime: 15_000,
  });

  const plans = catalogData?.packages && catalogData.packages.length > 0 ? catalogData.packages : DEFAULT_PLANS;
  const topupPacks = catalogData?.topupPacks && catalogData.topupPacks.length > 0 ? catalogData.topupPacks : DEFAULT_TOPUP_PACKS;

  const { data: company, isLoading: isCompanyLoading } = useGetClientCompany({
    query: {
      queryKey: getGetClientCompanyQueryKey(),
      staleTime: 5_000,
    },
  });

  const isActive = Boolean(company && (company as any)?.isActive);
  const isProfileComplete = checkIsCompanyProfileComplete(company);
  const currentTokens = (company as any)?.monthlyTokenQuota ?? null;

  const { getRate, lastUpdated } = useExchangeRates();
  const currencyCfg: CurrencyConfig = {
    ...CURRENCIES[selectedCurrency],
    exchangeRate: getRate(selectedCurrency),
  };

  const storageKey = useMemo(() => `ai_plan_requests_${(company as any)?.id || "client"}`, [(company as any)?.id]);
  const activePlanStorageKey = useMemo(() => `active_selected_plan_${(company as any)?.id || "client"}`, [(company as any)?.id]);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  // 1. Determine company active plan ID directly from server or dynamic catalog match
  const companyActivePlanId = useMemo(() => {
    if (!company) return null;
    const quota = (company as any).monthlyTokenQuota;
    if (quota && quota > 0) {
      const exact = plans.find((p) => p.tokensMonthly === quota);
      if (exact) return exact.id;
    }
    if ((company as any).activePlanId) {
      return (company as any).activePlanId;
    }
    if (!(company as any).isActive) return null;
    if (!quota) return null;
    let best = plans[0];
    let minDiff = Infinity;
    for (const p of plans) {
      if (p.tokensMonthly) {
        const diff = Math.abs(p.tokensMonthly - quota);
        if (diff < minDiff) {
          minDiff = diff;
          best = p;
        }
      }
    }
    return best ? best.id : null;
  }, [company, plans]);

  // Keep activeSelectedPlanId strictly in sync with companyActivePlanId (overrides stale localStorage)
  useEffect(() => {
    if (companyActivePlanId) {
      setActiveSelectedPlanId(companyActivePlanId);
      try {
        localStorage.setItem(activePlanStorageKey, companyActivePlanId);
      } catch {}
    }
  }, [companyActivePlanId, activePlanStorageKey]);

  // Sync pendingPlanId from server response
  useEffect(() => {
    const sPending = (company as any)?.pendingPlanId;
    if (sPending && sPending !== companyActivePlanId) {
      setPendingPlanId(sPending);
    } else if (companyActivePlanId && sPending === companyActivePlanId) {
      setPendingPlanId(null);
    }
  }, [company, companyActivePlanId]);

  // Restore local storage state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setSubmittedPlans((prev) => ({ ...JSON.parse(saved), ...prev }));
      }
      if (!companyActivePlanId) {
        const savedActive = localStorage.getItem(activePlanStorageKey);
        if (savedActive) {
          setActiveSelectedPlanId(savedActive);
        }
      }
    } catch {}
  }, [storageKey, activePlanStorageKey, companyActivePlanId]);

  // Sync with remote tickets so requests on file persist across devices/sessions
  const { data: clientTickets } = useQuery<any[]>({
    queryKey: ["/api/client/tickets"],
    queryFn: () => customFetch("/api/client/tickets"),
  });

  useEffect(() => {
    if (!Array.isArray(clientTickets)) return;
    const ticketPlans: Record<string, { phone: string; submittedAt?: string }> = {};
    let latestPlanId: string | null = null;
    let latestOpenPlanId: string | null = null;
    let resolvedPlanId: string | null = null;

    for (const t of clientTickets) {
      if (!t.title) continue;
      const isSub = t.title.includes("طلب اشتراك") || t.title.includes("طلب تغيير باقة") || t.title.includes("باقة");
      if (!isSub) continue;

      let planId: string | null = null;
      const matchId = t.description?.match(/\[معرف الباقة:\s*([a-zA-Z0-9_-]+)\]/);
      if (matchId) {
        planId = matchId[1];
      } else if (t.title.includes("الأساسية") || t.title.toLowerCase().includes("starter")) {
        planId = "starter";
      } else if (t.title.includes("الاحترافية") || t.title.toLowerCase().includes("pro")) {
        planId = "pro";
      } else if (t.title.includes("المؤسسات") || t.title.toLowerCase().includes("enterprise")) {
        planId = "enterprise";
      } else if (t.title.includes("تجريبية") || t.title.toLowerCase().includes("trial")) {
        planId = "free_trial";
      }

      const matchPhone = t.description?.match(/رقم هاتف \/ واتساب للتواصل:\s*([^\n\r]+)/) || t.description?.match(/رقم الهاتف \/ واتساب للتواصل:\s*([^\n\r]+)/);
      const phone = matchPhone ? matchPhone[1].trim() : "";

      if (planId && !latestPlanId) {
        latestPlanId = planId;
      }

      if (planId && (t.status === "open" || t.status === "pending" || t.status === "in_progress") && !latestOpenPlanId) {
        latestOpenPlanId = planId;
      }

      if (planId && t.status === "resolved" && !resolvedPlanId) {
        resolvedPlanId = planId;
      }

      if (planId && phone && !ticketPlans[planId]) {
        ticketPlans[planId] = { phone, submittedAt: t.createdAt };
      }
    }

    if (resolvedPlanId && !companyActivePlanId) {
      setActiveSelectedPlanId(resolvedPlanId);
      try {
        localStorage.setItem(activePlanStorageKey, resolvedPlanId);
      } catch {}
    }

    // Set pending request if there is an active/open ticket differing from current active plan
    if (latestOpenPlanId && latestOpenPlanId !== companyActivePlanId) {
      setPendingPlanId(latestOpenPlanId);
    }

    if (Object.keys(ticketPlans).length > 0) {
      setSubmittedPlans((prev) => {
        const merged = { ...ticketPlans, ...prev };
        try {
          localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch {}
        return merged;
      });
    }
  }, [clientTickets, storageKey, activePlanStorageKey, companyActivePlanId]);

  const calcPrice = (priceUsd: number) => {
    let finalUsd = priceUsd;
    if (billingCycle === "yearly") {
      // 2 months free discount for yearly billing (pay for 10 months)
      finalUsd = (priceUsd * 10) / 12;
    }
    const converted = finalUsd * currencyCfg.exchangeRate;
    return Math.round(converted);
  };

  const submitTicketMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      customFetch("/api/client/tickets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["client-chat-logs"] });
      toast({
        title: lang === "ar" ? "تم إرسال الطلب بنجاح!" : "Request Submitted Successfully!",
        description:
          lang === "ar"
            ? "تم تسجيل طلبك وإشعار الإدارة فوراً. سيتواصل معك فريقنا لتفعيل الباقة وتأكيد التفاصيل."
            : "Your subscription request has been received. Our team will contact you to activate your plan.",
      });
      setDialogOpen(false);
      setTopupDialogOpen(false);
      setSelectedPlan(null);
      setTopupPack(null);
      setClientNotes("");
      setTopupNotes("");
      setPhoneError(null);
      setDuplicateWarning(null);
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "خطأ في إرسال الطلب" : "Error Submitting Request",
        description: err?.message || (lang === "ar" ? "تعذر إرسال الطلب حالياً" : "Failed to submit request"),
        variant: "destructive",
      });
    },
  });

  const hasActiveQuotaOrPlan = Boolean(
    (company as any)?.isActive ||
    ((company as any)?.monthlyTokenQuota && (company as any).monthlyTokenQuota > 25_000) ||
    (company as any)?.activationEnd
  );
  const isFreeTrialClaimed = Boolean((company as any)?.freeTrialClaimed) || hasActiveQuotaOrPlan;

  const handleOpenSubscribe = (plan: PlanDef) => {
    if (plan.id === "free_trial" && isFreeTrialClaimed) {
      toast({
        title: lang === "ar" ? "الباقة التجريبية غير متاحة" : "Trial Not Available",
        description: lang === "ar"
          ? "الباقة التجريبية المجانية (7 أيام) متاحة للعملاء الجدد فقط ولمرة واحدة. يمكنك اختيار إحدى باقاتنا الشهرية أو السنوية للترقية."
          : "The 7-day free trial is strictly for new clients only. Please select one of our active plans.",
        variant: "destructive",
      });
      return;
    }
    setSelectedPlan(plan);
    setPhoneError(null);
    setDuplicateWarning(null);

    // Set default retention from plan or current company retention
    setSelectedRetention(
      plan.retentionDays !== undefined
        ? plan.retentionDays
        : (retentionData?.retentionDays ?? 30)
    );

    // Pre-fill channels based on plan definition or existing company setup
    if (Array.isArray(plan.channels) && plan.channels.length > 0) {
      setSelectedChannels([...plan.channels]);
    } else {
      const activeChans: string[] = [];
      if ((company as any)?.widgetEnabled !== false) activeChans.push("widget");
      if ((company as any)?.telegramEnabled) activeChans.push("telegram");
      if ((company as any)?.whatsappEnabled) activeChans.push("whatsapp");
      if ((company as any)?.messengerEnabled) activeChans.push("messenger");
      if ((company as any)?.customWebhookEnabled) activeChans.push("webhook");
      setSelectedChannels(activeChans.length > 0 ? activeChans : ["widget", "telegram"]);
    }

    // Pre-fill tools based on plan definition or existing company setup
    if (Array.isArray(plan.tools) && plan.tools.length > 0) {
      setSelectedTools([...plan.tools]);
    } else {
      const activeTools: string[] = ["leads_crm", "handoff"];
      if ((company as any)?.googleCalendarEnabled) activeTools.push("calendar");
      if ((company as any)?.googleSheetsEnabled) activeTools.push("sheets");
      if ((company as any)?.voiceReplyEnabled) activeTools.push("voice");
      if ((company as any)?.websiteAutoSync) activeTools.push("web_sync");
      setSelectedTools(activeTools);
    }

    // Pre-fill data sources based on plan definition or existing company setup
    if (Array.isArray(plan.dataSources) && plan.dataSources.length > 0) {
      setSelectedDataSources([...plan.dataSources]);
    } else {
      const activeSources: string[] = [];
      if ((company as any)?.allowSourceWebsite !== false) activeSources.push("website");
      if ((company as any)?.allowSourceFiles !== false) activeSources.push("files");
      if ((company as any)?.allowSourceWordpress !== false) activeSources.push("wordpress");
      if ((company as any)?.allowSourceRestApi !== false) activeSources.push("rest_api");
      if ((company as any)?.allowSourceShopify !== false) activeSources.push("shopify");
      setSelectedDataSources(activeSources.length > 0 ? activeSources : ["website", "files"]);
    }

    // If this specific plan has a previously accepted/submitted request, display that phone number
    const prevPlanRequest = submittedPlans[plan.id];
    if (prevPlanRequest?.phone) {
      setClientPhone(prevPlanRequest.phone);
    } else {
      // Pre-fill with existing phone or company whatsapp number if available
      const fallbackPhone = clientPhone || (company as any)?.whatsappNumber || "";
      setClientPhone(fallbackPhone);
    }

    setDialogOpen(true);
  };

  const handlePhoneChange = (val: string) => {
    setClientPhone(val);
    if (phoneError && val.trim().length > 0) {
      setPhoneError(null);
    }
    if (selectedPlan && duplicateWarning) {
      const prevPhone = submittedPlans[selectedPlan.id]?.phone?.trim();
      if (prevPhone && val.trim() !== prevPhone) {
        setDuplicateWarning(null);
      }
    }
  };

  const handleConfirmSubscribe = () => {
    if (!selectedPlan) return;
    const trimmedPhone = clientPhone.trim();

    // 1. Validate: Phone number cannot be empty
    if (!trimmedPhone) {
      setPhoneError(
        lang === "ar"
          ? "يرجى إدخال رقم الهاتف أو الواتساب للتواصل"
          : "Please enter your Phone / WhatsApp contact number"
      );
      toast({
        title: lang === "ar" ? "رقم التواصل مطلوب" : "Phone Number Required",
        description: lang === "ar"
          ? "يرجى إدخال رقم الهاتف أو الواتساب للتواصل معك وتأكيد الطلب."
          : "Please enter your Phone or WhatsApp number to confirm your request.",
        variant: "destructive",
      });
      return;
    }

    // 2. Allow user to freely select/switch or update plans at any time with their contact number
    const isPlanChange = Boolean(activeSelectedPlanId && activeSelectedPlanId !== selectedPlan.id);
    setDuplicateWarning(null);

    // 3. Process request
    const price = calcPrice(selectedPlan.monthlyPriceUsd);
    const cycleText = billingCycle === "yearly" ? (lang === "ar" ? "سنوي" : "Yearly") : (lang === "ar" ? "شهري" : "Monthly");
    const currentSelectedPlanDef = plans.find((p) => p.id === activeSelectedPlanId);

    const title = isPlanChange
      ? `[طلب تغيير باقة] من ${currentSelectedPlanDef ? currentSelectedPlanDef.nameAr : "الباقة السابقة"} إلى ${selectedPlan.nameAr} - دورة ${cycleText}`
      : `[طلب اشتراك] ${selectedPlan.nameAr} - دورة ${cycleText}`;

    const description = [
      isPlanChange
        ? `طلب تغيير/ترقية الباقة: من [${currentSelectedPlanDef?.nameAr || activeSelectedPlanId}] إلى [${selectedPlan.nameAr} (${selectedPlan.nameEn})]`
        : `العميل يطلب الاشتراك في الباقة: ${selectedPlan.nameAr} (${selectedPlan.nameEn})`,
      `[معرف الباقة: ${selectedPlan.id}]`,
      isPlanChange && currentSelectedPlanDef ? `[الباقة السابقة: ${currentSelectedPlanDef.id}]` : null,
      `دورة الفوترة: ${cycleText}`,
      `السعر التقديري: ${price} ${currencyCfg.symbol} / شهر`,
      `رصيد الرموز المرفق: ${selectedPlan.tokensFormatted || selectedPlan.tokensMonthly.toLocaleString()} Tokens`,
      `سياسة الحذف التلقائي للاحتفاظ بالسجلات: ${selectedRetention && selectedRetention > 0 ? `${selectedRetention} يوم` : (lang === "ar" ? "دائم (بدون حذف تلقائي)" : "Permanent (Never delete)")}`,
      `قنوات التواصل المطلوب تفعيلها: ${
        selectedChannels.length > 0
          ? selectedChannels
              .map((cId) => COMMUNICATION_CHANNELS.find((ch) => ch.id === cId)?.titleAr || cId)
              .join("، ")
          : (lang === "ar" ? "لم يتم تحديد قنوات" : "None selected")
      }`,
      `الأدوات والتكاملات المطلوب تفعيلها: ${
        selectedTools.length > 0
          ? selectedTools
              .map((tId) => SYSTEM_TOOLS.find((tl) => tl.id === tId)?.titleAr || tId)
              .join("، ")
          : (lang === "ar" ? "لم يتم تحديد أدوات" : "None selected")
      }`,
      `صلاحيات مصادر البيانات المطلوب تفعيلها: ${
        selectedDataSources.length > 0
          ? selectedDataSources
              .map((dsId) => DATA_SOURCE_PERMISSIONS.find((ds) => ds.id === dsId)?.titleAr || dsId)
              .join("، ")
          : (lang === "ar" ? "لم يتم تحديد مصادر بيانات" : "None selected")
      }`,
      `رقم هاتف / واتساب للتواصل: ${trimmedPhone}`,
      clientNotes ? `ملاحظات أو متطلبات خاصة:\n${clientNotes.trim()}` : null,
      `اسم الشركة الحالي: ${(company as any)?.name ?? "لم يتم الإنشاء بعد"}`,
      `حالة الحساب الحالية: ${isActive ? "نشط" : "غير نشط / جديد"}`,
    ]
      .filter(Boolean)
      .join("\n");

    submitTicketMutation.mutate(
      { title, description },
      {
        onSuccess: () => {
          // Immediately apply chosen auto-delete retention policy to company
          customFetch("/api/client/chat-log-retention", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ retentionDays: selectedRetention }),
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/client/chat-log-retention"] });
          }).catch(() => {});

          // Immediately update company channels and tools
          customFetch("/api/client/company", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              widgetEnabled: selectedChannels.includes("widget"),
              telegramEnabled: selectedChannels.includes("telegram"),
              whatsappEnabled: selectedChannels.includes("whatsapp"),
              messengerEnabled: selectedChannels.includes("messenger"),
              googleCalendarEnabled: selectedTools.includes("calendar"),
              googleSheetsEnabled: selectedTools.includes("sheets"),
              voiceReplyEnabled: selectedTools.includes("voice"),
              websiteAutoSync: selectedTools.includes("web_sync"),
              allowSourceWebsite: selectedDataSources.includes("website"),
              allowSourceFiles: selectedDataSources.includes("files"),
              allowSourceWordpress: selectedDataSources.includes("wordpress"),
              allowSourceRestApi: selectedDataSources.includes("rest_api"),
              allowSourceShopify: selectedDataSources.includes("shopify"),
            }),
          }).then(() => {
            queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
          }).catch(() => {});

          // If the company already has an active plan different from chosen plan, treat as pending upgrade request
          if (companyActivePlanId && companyActivePlanId !== selectedPlan.id) {
            setPendingPlanId(selectedPlan.id);
            toast({
              title: lang === "ar" ? "تم إرسال طلب الترقية بنجاح ⏳" : "Plan Upgrade Request Submitted ⏳",
              description: lang === "ar"
                ? `طلبك للانتقال إلى [${selectedPlan.nameAr}] قيد المراجعة حالياً من قبل الإدارة وسيتم تفعيل الباقة فور الاعتماد.`
                : `Your request to switch to [${selectedPlan.nameEn}] has been submitted and is pending admin approval.`,
            });
          } else {
            setActiveSelectedPlanId(selectedPlan.id);
            try {
              localStorage.setItem(activePlanStorageKey, selectedPlan.id);
            } catch {}
            toast({
              title: lang === "ar" ? "تم إرسال الطلب بنجاح ✓" : "Request Submitted Successfully ✓",
              description: lang === "ar"
                ? `تم إرسال طلب الاشتراك في [${selectedPlan.nameAr}] وسيتم تفعيل الباقة فور الاعتماد.`
                : `Your subscription request for [${selectedPlan.nameEn}] has been submitted.`,
            });
          }

          // Record accepted/submitted request for the latest chosen plan only
          const updated = {
            [selectedPlan.id]: {
              phone: trimmedPhone,
              submittedAt: new Date().toISOString(),
            },
          };
          setSubmittedPlans(updated);
          try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
          } catch {}
        },
      }
    );
  };

  const handleOpenTopup = (pack: (typeof TOPUP_PACKS)[0]) => {
    setTopupPack(pack);
    setTopupDialogOpen(true);
  };

  const handleConfirmTopup = () => {
    if (!topupPack) return;
    const badge =
      topupPack.formatted === "+1000K" ||
      topupPack.formatted === "1000K" ||
      topupPack.tokens === 1_000_000
        ? "1m"
        : topupPack.formatted;
    const price = Math.round(topupPack.priceUsd * currencyCfg.exchangeRate);
    const title = `[طلب شحن رصيد إضافي] ${badge} رموز`;
    const description = [
      `طلب شحن حزمة رموز إضافية: ${badge} (${topupPack.tokens.toLocaleString()} Tokens)`,
      `السعر: ${price} ${currencyCfg.symbol}`,
      topupNotes ? `ملاحظات العميل:\n${topupNotes}` : null,
      `اسم الشركة: ${(company as any)?.name ?? "غير محدد"}`,
    ]
      .filter(Boolean)
      .join("\n");

    submitTicketMutation.mutate({ title, description });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* ── Operations Hero Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #0e1838 0%, #102354 50%, #1e3a8a 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-sky-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <Package className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {lang === "ar" ? "باقات واشتراكات الذكاء الاصطناعي" : "AI Packages & Subscriptions"}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 border border-white/30 backdrop-blur-md">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  {lang === "ar" ? "خطط مرنة تناسب نموك" : "Flexible Scaling Plans"}
                </span>
              </div>
              <p className="text-sm sm:text-base text-blue-100/90 max-w-2xl leading-relaxed">
                {lang === "ar"
                  ? "اختر الباقة المناسبة لحجم أعمالك مع حصص الرموز (AI Tokens)، ربط متعدد القنوات (تليجرام، واتساب، موقع)، وإدارة الحجوزات الذكية."
                  : "Choose the optimal plan for your business volume with AI Tokens quota, multi-channel bots, and intelligent booking management."}
              </p>
            </div>
          </div>

          {/* Quick Currency Selector */}
          <div className="flex flex-col items-center md:items-end gap-1.5 self-stretch md:self-auto">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 p-1.5 rounded-2xl justify-center">
              {(Object.keys(CURRENCIES) as CurrencyCode[]).map((cur) => {
                const cfg = CURRENCIES[cur];
                const isSel = selectedCurrency === cur;
                return (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setSelectedCurrency(cur)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSel
                        ? "bg-white text-slate-900 shadow-md scale-105"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <span>{cfg.flag}</span>
                    <span>{cfg.code}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-blue-200/90 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {selectedCurrency === "USD"
                  ? lang === "ar"
                    ? "أسعار الصرف متزامنة يومياً"
                    : "Exchange rates auto-synced daily"
                  : `1$ ≈ ${currencyCfg.exchangeRate.toFixed(2)} ${currencyCfg.symbol} (${lang === "ar" ? "سعر اليوم المباشر" : "Live daily rate"})`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Onboarding Checkpoint Progress Bar for new/inactive clients ── */}
      {!isActive && (
        <ClientOnboardingProgress currentStep="packages" company={company} />
      )}

      {!isCompanyLoading && !isActive && !isProfileComplete ? (
        <div className="rounded-3xl border border-red-500/20 bg-card p-8 sm:p-12 text-center space-y-5 shadow-lg">
          <div className="w-16 h-16 rounded-3xl bg-red-500/10 text-red-500 border border-red-500/20 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="text-xl font-bold text-foreground">
              {lang === "ar" ? "صفحة الباقات والاشتراكات مقفلة" : "Packages & Plans is Locked"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "يجب إكمال وحفظ بيانات ملف الشركة أولاً (الاسم ووصف النشاط) لتجهيز البوت وتحديد احتياجاتك قبل التمكن من اختيار الباقة والاشتراك."
                : "Before choosing a plan, you must complete and save your company profile details to set up your AI assistant."}
            </p>
          </div>
          <Link href="/client/company">
            <Button size="lg" className="bg-[#2D5BE3] hover:bg-[#254ec2] text-white font-bold rounded-2xl gap-2 shadow-lg px-8">
              <Building2 className="w-5 h-5" />
              <span>{lang === "ar" ? "الانتقال إلى ملف الشركة لإكماله (الخطوة 1) ←" : "Go to Company Profile (Step 1) →"}</span>
            </Button>
          </Link>
        </div>
      ) : (
        <>
      {/* ── Current Account & Subscription Status Card ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Subscription Status */}
        <Card className="md:col-span-2 border border-border/70 rounded-2xl shadow-sm bg-card overflow-hidden">
          <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/25 animate-pulse"
                }`}
              >
                {isActive ? <ShieldCheck className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === "ar" ? "حالة الاشتراك الحالي" : "Current Subscription Status"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
                    {isActive
                      ? lang === "ar"
                        ? "الحساب نشط"
                        : "Account Active"
                      : lang === "ar"
                      ? "قيد المراجعة والتفعيل"
                      : "Pending Activation"}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground mt-0.5">
                  {(company as any)?.name || (lang === "ar" ? "حساب جديد" : "New Account")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {isActive
                    ? lang === "ar"
                      ? "جميع ميزات الذكاء الاصطناعي والقنوات المرتبطة تعمل بكفاءة وفق حصتك المعتمدة."
                      : "All AI features and connected channels are running according to your assigned quota."
                    : lang === "ar"
                    ? "أنت في مرحلة التأسيس الأولي. اختر باقتك المفضلة أدناه واضغط على 'طلب الاشتراك' لتفعيل خدماتك."
                    : "You are in the onboarding stage. Select a plan below and request activation to start."}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-2 shrink-0 w-full sm:w-auto">
              {!isActive ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link href="/client/company">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 text-xs font-semibold w-full sm:w-auto"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      {lang === "ar" ? "ملف الشركة" : "Company Profile"}
                    </Button>
                  </Link>
                  <Link href="/client/support">
                    <Button
                      size="sm"
                      className="rounded-xl gap-1.5 text-xs font-semibold bg-[#2D5BE3] hover:bg-[#254ec2] text-white w-full sm:w-auto"
                    >
                      <LifeBuoy className="w-3.5 h-3.5" />
                      {lang === "ar" ? "فريق الدعم" : "Support"}
                    </Button>
                  </Link>
                </div>
              ) : (
                <Link href="/client/usage">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl gap-1.5 text-xs font-semibold"
                  >
                    <Coins className="w-3.5 h-3.5 text-amber-500" />
                    {lang === "ar" ? "تفاصيل الاستهلاك" : "Usage Stats"}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </Card>

        {/* Card 2: Quota Snapshot */}
        <Card className="border border-border/70 rounded-2xl shadow-sm bg-card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === "ar" ? "الحصة المخصصة" : "Assigned Quota"}
            </span>
            <Coins className="w-4 h-4 text-primary" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-foreground tabular-nums">
              {!isActive ? (
                <div className="flex flex-col">
                  <span>0 Tokens</span>
                  <span className="text-xs font-semibold text-amber-500 mt-0.5">
                    {lang === "ar" ? "(بانتظار تفعيل الباقة)" : "(Pending Activation)"}
                  </span>
                </div>
              ) : currentTokens && currentTokens > 0 ? (
                currentTokens >= 1_000_000 || Math.round(currentTokens / 1_000) === 1000 ? (
                  "1m Tokens"
                ) : (
                  `${(currentTokens / 1_000).toFixed(0)}K Tokens`
                )
              ) : (company as any)?.aiExecutionMode === "tokens" ? (
                lang === "ar" ? "مفتاح API خاص" : "Own API Key"
              ) : (
                "0 Tokens"
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isActive
                ? lang === "ar"
                  ? "تتجدد الحصة تلقائياً في دورة الفوترة المحددة"
                  : "Auto-renews each billing cycle"
                : lang === "ar"
                ? "يتم تحديد وتفعيل الحصة تلقائياً فور اعتماد واشتراك الباقة"
                : "Quota is assigned upon plan activation"}
            </p>
          </div>
          <div className="text-[11px] font-semibold text-primary flex items-center gap-1">
            <span>{currencyCfg.symbol}</span>
            <span>
              {lang === "ar"
                ? `العملة المحددة: ${currencyCfg.nameAr}`
                : `Active Currency: ${currencyCfg.nameEn}`}
            </span>
          </div>
        </Card>
      </div>

      {/* ── Billing Cycle Switcher ── */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <div className="inline-flex items-center p-1 rounded-2xl bg-muted/60 border border-border/60">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              billingCycle === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {lang === "ar" ? "اشتراك شهري" : "Monthly Billing"}
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              billingCycle === "yearly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{lang === "ar" ? "اشتراك سنوي" : "Yearly Billing"}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              {lang === "ar" ? "وفر شهرين مجاناً!" : "2 Months Free!"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Pending Upgrade Notification Banner ── */}
      {pendingPlanId && pendingPlanId !== activeSelectedPlanId && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-foreground">
                {lang === "ar"
                  ? `لديك طلب تغيير / ترقية باقة قيد المراجعة إلى [${plans.find((p) => p.id === pendingPlanId)?.nameAr || pendingPlanId}] ⏳`
                  : `You have a pending upgrade request to [${plans.find((p) => p.id === pendingPlanId)?.nameEn || pendingPlanId}] ⏳`}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {lang === "ar"
                  ? `باقتك الحالية المفعلة هي [${plans.find((p) => p.id === activeSelectedPlanId)?.nameAr || "الأساسية"}] وتعمل بكامل مميزاتها ورصيدها حتى اعتماد الترقية من الإدارة.`
                  : `Your active plan is [${plans.find((p) => p.id === activeSelectedPlanId)?.nameEn || "Starter"}] and continues running until approved.`}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs shrink-0 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 cursor-pointer"
            onClick={() => {
              const target = plans.find((p) => p.id === pendingPlanId);
              if (target) handleOpenSubscribe(target);
            }}
          >
            {lang === "ar" ? "تعديل الطلب المعلق" : "Edit Pending Request"}
          </Button>
        </div>
      )}

      {/* ── Main Plans Cards Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {plans
          .filter((plan) => {
            // Free trial plan is strictly for new clients. If client is an existing customer or has already claimed a trial, hide it.
            if (plan.id === "free_trial" && isFreeTrialClaimed && activeSelectedPlanId !== "free_trial") {
              return false;
            }
            return true;
          })
          .map((plan) => {
          const price = calcPrice(plan.monthlyPriceUsd);
          const isActivePlan = activeSelectedPlanId === plan.id;
          const isPendingPlan = !isActivePlan && pendingPlanId === plan.id;
          const isPop = plan.popular;
          const isTrial = plan.id === "free_trial";

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl transition-all duration-300 ${
                isActivePlan
                  ? "border-[2.5px] border-blue-600 dark:border-blue-500 shadow-2xl shadow-blue-500/25 ring-4 ring-blue-500/20 bg-gradient-to-b from-blue-500/10 via-card to-card lg:-translate-y-2.5 z-20"
                  : isPendingPlan
                  ? "border-[2.5px] border-amber-500 dark:border-amber-400 shadow-xl shadow-amber-500/20 ring-4 ring-amber-500/20 bg-gradient-to-b from-amber-500/10 via-card to-card lg:-translate-y-1.5 z-10"
                  : isPop
                  ? "border-2 border-border/80 hover:border-[#2D5BE3]/60 shadow-md hover:shadow-xl lg:-translate-y-1 bg-gradient-to-b from-blue-500/5 via-card to-card"
                  : "border border-border/70 hover:border-blue-500/40 shadow-md hover:shadow-lg bg-card"
              }`}
            >
              {isActivePlan ? (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30">
                  <span className="px-4 py-1 rounded-full text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/35 flex items-center gap-1.5 whitespace-nowrap border border-white/20">
                    <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    {lang === "ar" ? "باقتك المفعلة حالياً ✓" : "Currently Active Plan ✓"}
                  </span>
                </div>
              ) : isPendingPlan ? (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30">
                  <span className="px-4 py-1 rounded-full text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/35 flex items-center gap-1.5 whitespace-nowrap border border-white/20 animate-pulse">
                    <Clock className="w-3.5 h-3.5 text-white" />
                    {lang === "ar" ? "طلب ترقية قيد المراجعة ⏳" : "Upgrade Request Pending ⏳"}
                  </span>
                </div>
              ) : isPop ? (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 rounded-full text-xs font-black bg-gradient-to-r from-[#2D5BE3] to-blue-600 text-white shadow-md flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                    {lang === "ar" ? plan.badgeAr : plan.badgeEn}
                  </span>
                </div>
              ) : null}

              {/* Card Header */}
              <div className="p-6 pb-4 border-b border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                    <span>{lang === "ar" ? plan.nameAr : plan.nameEn}</span>
                    {isActivePlan && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                    {isPendingPlan && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </h3>
                  {!isPop && plan.badgeAr && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                      {lang === "ar" ? plan.badgeAr : plan.badgeEn}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2 min-h-[32px]">
                  {lang === "ar" ? plan.descriptionAr : plan.descriptionEn}
                </p>

                {/* Price Display */}
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-3xl sm:text-4xl font-black text-foreground tabular-nums">
                    {price.toLocaleString()}
                  </span>
                  <span className="text-base font-bold text-primary">
                    {currencyCfg.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    /{lang === "ar" ? "شهر" : "mo"}
                  </span>
                </div>
                {billingCycle === "yearly" && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                    {lang === "ar"
                      ? `يتم الدفع سنوياً (${(price * 12).toLocaleString()} ${currencyCfg.symbol} / سنة)`
                      : `Billed annually (${(price * 12).toLocaleString()} ${currencyCfg.symbol} / yr)`}
                  </p>
                )}

                {/* Quota Highlights */}
                <div className={`mt-4 p-2.5 rounded-xl border flex items-center justify-between ${
                  isActivePlan ? "bg-blue-500/15 border-blue-500/30" : isPendingPlan ? "bg-amber-500/15 border-amber-500/30" : "bg-primary/5 border-primary/15"
                }`}>
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      {lang === "ar" ? "حصة الرموز الشهرية" : "Monthly Tokens"}
                    </span>
                  </div>
                  <span className="text-xs font-black text-primary tabular-nums">
                    {plan.tokensFormatted || Number(plan.tokensMonthly).toLocaleString()} Tokens
                  </span>
                </div>

                {/* Auto-Delete Retention Highlight */}
                <div className="mt-2 p-2 rounded-xl border border-border/50 bg-muted/30 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{lang === "ar" ? "الاحتفاظ بالسجلات:" : "Data Retention:"}</span>
                  </div>
                  <span className="font-bold text-foreground">
                    {plan.retentionDays && plan.retentionDays > 0
                      ? `${plan.retentionDays} ${lang === "ar" ? "أيام" : "Days"}`
                      : (lang === "ar" ? "دائم (لا يحذف)" : "Permanent")}
                  </span>
                </div>

                </div>

              {/* Features List */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                <ul className="space-y-3">
                  {(lang === "ar" ? (plan.featuresAr || []) : (plan.featuresEn || plan.featuresAr || [])).map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs text-foreground/90">
                      <div className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                      <span>{formatPlanFeature(feat, plan, lang === "ar")}</span>
                    </li>
                  ))}
                </ul>

                {/* Additional Feature Categories matching Admin View */}
                <div className="space-y-2.5 pt-3 border-t border-border/40">
                  {/* Allowed Pages Badge */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                      <span>{lang === "ar" ? "الصفحات المتاحة:" : "Allowed Pages:"}</span>
                    </span>
                    <span className="bg-primary/5 text-primary border border-primary/20 text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {Array.isArray(plan.allowedPages) ? plan.allowedPages.length : CLIENT_PAGES_META.length} / {CLIENT_PAGES_META.length}
                    </span>
                  </div>

                  {/* Channels Badges */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <MessageSquare className="w-3.5 h-3.5 text-primary" />
                      <span>{lang === "ar" ? "قنوات التواصل:" : "Channels:"}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {COMMUNICATION_CHANNELS.map((ch) => {
                        const Icon = ch.icon;
                        const isIncluded = Array.isArray(plan.channels)
                          ? plan.channels.includes(ch.id)
                          : ch.id !== "webhook";
                        if (!isIncluded) return null;
                        return (
                          <div
                            key={ch.id}
                            className={`w-5 h-5 rounded flex items-center justify-center border text-[9px] ${ch.color}`}
                            title={lang === "ar" ? ch.titleAr : ch.titleEn}
                          >
                            <Icon className="w-3 h-3" />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tools Badges */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Wrench className="w-3.5 h-3.5 text-blue-500" />
                      <span>{lang === "ar" ? "الأدوات والتكاملات:" : "Tools:"}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {SYSTEM_TOOLS.map((tl) => {
                        const Icon = tl.icon;
                        const isIncluded = Array.isArray(plan.tools)
                          ? plan.tools.includes(tl.id)
                          : tl.id !== "voice";
                        if (!isIncluded) return null;
                        return (
                          <div
                            key={tl.id}
                            className={`w-5 h-5 rounded flex items-center justify-center border text-[9px] ${tl.color}`}
                            title={lang === "ar" ? tl.titleAr : tl.titleEn}
                          >
                            <Icon className="w-3 h-3" />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Data Sources Badges */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                      <Database className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{lang === "ar" ? "مصادر البيانات:" : "Data Sources:"}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {DATA_SOURCE_PERMISSIONS.map((ds) => {
                        const Icon = ds.icon;
                        const isIncluded = Array.isArray(plan.dataSources)
                          ? plan.dataSources.includes(ds.id)
                          : ds.id === "website" || ds.id === "files";
                        if (!isIncluded) return null;
                        return (
                          <div
                            key={ds.id}
                            className={`w-5 h-5 rounded flex items-center justify-center border text-[9px] ${ds.color}`}
                            title={lang === "ar" ? ds.titleAr : ds.titleEn}
                          >
                            <Icon className="w-3 h-3" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => handleOpenSubscribe(plan)}
                  disabled={(isTrial && isFreeTrialClaimed && !isActivePlan) || isActivePlan}
                  className={`w-full py-5 rounded-2xl text-xs sm:text-sm font-bold shadow-md transition-all gap-2 ${
                    isActivePlan
                      ? "bg-blue-600 hover:bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/40 cursor-default opacity-95"
                      : isPendingPlan
                      ? "bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/30 ring-2 ring-amber-400/40 cursor-pointer"
                      : isTrial
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 cursor-pointer"
                      : isPop
                      ? "bg-[#2D5BE3] hover:bg-[#254ec2] text-white shadow-blue-500/25 cursor-pointer"
                      : "bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 cursor-pointer"
                  }`}
                >
                  {isActivePlan ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span>
                        {lang === "ar" ? "باقتك المفعلة حالياً ✓" : "Currently Active Plan ✓"}
                      </span>
                    </>
                  ) : isPendingPlan ? (
                    <>
                      <Clock className="w-4 h-4 text-white" />
                      <span>
                        {lang === "ar" ? "طلب معلق (تعديل الطلب)" : "Pending Request (Edit)"}
                      </span>
                    </>
                  ) : isTrial ? (
                    <>
                      <Sparkles className="w-4 h-4 text-white" />
                      <span>
                        {lang === "ar" ? "بدء التجربة المجانية (7 أيام)" : "Start Free 7-Day Trial"}
                      </span>
                    </>
                  ) : activeSelectedPlanId ? (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      <span>
                        {lang === "ar" ? "تغيير / ترقية إلى هذه الباقة" : "Switch / Upgrade to this Plan"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        {lang === "ar" ? "طلب الاشتراك في الباقة" : "Subscribe to Plan"}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Custom Enterprise Contact Card ── */}
      <Card className="rounded-3xl border border-border/80 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-[#2D5BE3]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/15 backdrop-blur-md">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{lang === "ar" ? "باقة مخصصة لاحتياجاتك" : "Custom Enterprise Scale"}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black">
              {lang === "ar" ? "تحتاج إلى باقة مخصصة أو أحجام استهلاك غير محدودة؟" : "Need a custom high-volume quota or tailored setup?"}
            </h3>
            <p className="text-xs sm:text-sm text-blue-100/80 leading-relaxed">
              {lang === "ar"
                ? "نوفر خططاً مرنة للمستشفيات والشركات الكبرى تشمل استضافة مخصصة، نماذج ذكاء اصطناعي خاصة (On-Premise / Private LLMs)، وربط مع أنظمة ERP الخاصة."
                : "We offer tailored plans for large enterprises including private LLMs, customized workflows, and custom ERP integrations."}
            </p>
          </div>

          <Link href="/client/support">
            <Button
              size="lg"
              className="rounded-2xl px-6 py-6 font-bold bg-white text-slate-950 hover:bg-blue-50 shadow-lg text-xs sm:text-sm shrink-0 gap-2 cursor-pointer"
            >
              <LifeBuoy className="w-4 h-4 text-blue-600" />
              <span>{lang === "ar" ? "تواصل مع فريق المبيعات والدعم" : "Contact Sales / Enterprise"}</span>
            </Button>
          </Link>
        </div>
      </Card>

      {/* ── Token Top-Up Packs (شحن رصيد إضافي) ── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <span>{lang === "ar" ? "حزم شحن الرموز الإضافية (Top-ups)" : "Extra Token Top-Up Packs"}</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar"
                ? "يمكنك زيادة رصيد الرموز في أي وقت دون الحاجة لترقية باقتك الشهرية بالكامل."
                : "Top up your AI token balance on demand without changing your core subscription tier."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topupPacks.map((pack, idx) => {
            const packPrice = Math.round(pack.priceUsd * currencyCfg.exchangeRate);
            return (
              <Card
                key={idx}
                className="border border-border/70 hover:border-amber-500/40 rounded-2xl p-4 bg-card shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase">
                      {lang === "ar" ? "حزمة إضافية" : "Top-up"}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      {pack.formatted === "+1000K" || pack.formatted === "1000K" || pack.tokens === 1_000_000 ? "1m" : pack.formatted}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-foreground tabular-nums">
                      {packPrice.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-primary">{currencyCfg.symbol}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pack.tokens.toLocaleString()} {lang === "ar" ? "رمز إضافي تضاف لرصيدك" : "additional tokens"}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenTopup(pack)}
                  className="w-full mt-4 rounded-xl text-xs font-bold hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/30 gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === "ar" ? "طلب هذه الحزمة" : "Request Pack"}</span>
                </Button>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── FAQ Section ── */}
      <Card className="border border-border/70 rounded-3xl p-6 bg-card space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary" />
          <h3 className="text-base sm:text-lg font-bold text-foreground">
            {lang === "ar" ? "الأسئلة الشائعة حول الباقات والتفعيل" : "Frequently Asked Questions"}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/40 space-y-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{lang === "ar" ? "كيف يتم تفعيل حسابي كعميل جديد؟" : "How is my account activated?"}</span>
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "بمجرد إكمال بيانات شركتك وطلب الباقة المناسبة، يقوم فريق الإدارة بمراجعة الطلب وتفعيل الحساب وتحديد رصيد الرموز فوراً. ستظهر لك بعدها كافة القنوات وأدوات التحكم."
                : "After completing your company profile and requesting a plan, our team reviews and activates your account with assigned tokens immediately."}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-muted/40 border border-border/40 space-y-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{lang === "ar" ? "هل يمكنني ترقية باقتي في أي وقت؟" : "Can I upgrade my plan anytime?"}</span>
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "نعم، يمكنك ترقية اشتراكك في أي وقت وتطبيق الميزات الجديدة مباشرة."
                : "Yes, you can upgrade your subscription at any time and new features are unlocked instantly."}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-muted/40 border border-border/40 space-y-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{lang === "ar" ? "ماذا يحدث عند استهلاك كامل الرموز الشهرية؟" : "What happens when monthly quota ends?"}</span>
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "ستتلقى إشعاراً تحذيرياً عند وصول الاستهلاك إلى 80% و100%. يمكنك شراء حزمة شحن إضافية (Top-up) فوراً للاستمرار دون أي انقطاع في الردود."
                : "You receive warning alerts at 80% and 100%. You can purchase quick top-up packs anytime to keep bots active."}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-muted/40 border border-border/40 space-y-1.5">
            <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{lang === "ar" ? "ما هي خيارات وطرق الدفع المتاحة؟" : "What payment methods are supported?"}</span>
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "ندعم البطاقات الائتمانية، فودافون كاش (Vodafone Cash)، وإنستاباي (InstaPay)."
                : "We support credit cards, Vodafone Cash, and InstaPay."}
            </p>
          </div>
        </div>
      </Card>

      
        </>
      )}

      {/* ── Dialog: Subscribe to Plan ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-2xl w-[95vw] max-h-[85vh] overflow-y-auto overflow-x-hidden p-6 rounded-3xl shadow-2xl modal-custom-scroll"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <DialogHeader className="pb-3 border-b border-border/40">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <span>
                {activeSelectedPlanId && activeSelectedPlanId !== selectedPlan?.id
                  ? (lang === "ar" ? "طلب تغيير / ترقية الباقة" : "Request Plan Upgrade / Change")
                  : (lang === "ar" ? "طلب تفعيل / ترقية باقة" : "Request Plan Activation / Upgrade")}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {activeSelectedPlanId && activeSelectedPlanId !== selectedPlan?.id
                ? (lang === "ar"
                    ? "سيتم إرسال طلبك لتغيير الباقة مباشرة إلى فريق الإدارة لتحديث رصيد الرموز والمميزات فوراً."
                    : "Your plan change request will be dispatched to update your token quota and features.")
                : (lang === "ar"
                    ? "سيتم إرسال هذا الطلب مباشرة إلى فريق الإدارة لتجهيز وتفعيل باقتك على الفور."
                    : "This request will be dispatched to the admin team to configure and activate your plan.")}
            </DialogDescription>
          </DialogHeader>

          {selectedPlan && (
            <div className="space-y-4 py-4">
              {activeSelectedPlanId && activeSelectedPlanId !== selectedPlan.id && (
                <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-semibold text-foreground">
                      {lang === "ar" ? "التبديل إلى باقة جديدة" : "Switching to New Plan"}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px] font-medium">
                    {lang === "ar" ? `الانتقال إلى: ${selectedPlan.nameAr}` : `Target: ${selectedPlan.nameEn}`}
                  </span>
                </div>
              )}
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-foreground">
                    {lang === "ar" ? selectedPlan.nameAr : selectedPlan.nameEn}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedPlan.tokensFormatted || Number(selectedPlan.tokensMonthly).toLocaleString()} Tokens · {billingCycle === "yearly" ? (lang === "ar" ? "سنوي" : "Yearly") : (lang === "ar" ? "شهري" : "Monthly")}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-primary">
                    {calcPrice(selectedPlan.monthlyPriceUsd).toLocaleString()} {currencyCfg.symbol}
                  </div>
                  <span className="text-[10px] text-muted-foreground">/{lang === "ar" ? "شهر" : "mo"}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-primary" />
                    <span>{lang === "ar" ? "رقم الهاتف / واتساب للتواصل *" : "Phone / WhatsApp Contact *"}</span>
                  </label>
                  {activeSelectedPlanId === selectedPlan.id && submittedPlans[selectedPlan.id]?.phone && (
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                      {lang === "ar" ? "مسجل مسبقاً لهذه الباقة" : "Current recorded number"}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Input
                    value={clientPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="+966 5X XXX XXXX / +20 1X XXX XXXX"
                    className={`rounded-xl text-xs transition-all duration-200 pr-9 ${
                      phoneError
                        ? "border-2 border-red-500 focus-visible:ring-red-500 ring-2 ring-red-500/20 bg-red-500/5 text-foreground placeholder:text-red-400"
                        : clientPhone.trim().length > 0
                        ? "border-2 border-emerald-500 focus-visible:ring-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5 text-foreground"
                        : "border-input bg-background"
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {phoneError ? (
                      <AlertCircle className="w-4 h-4 text-red-500 animate-in zoom-in-50 duration-150" />
                    ) : clientPhone.trim().length > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-in zoom-in-50 duration-150" />
                    ) : null}
                  </div>
                </div>

                {phoneError && (
                  <p className="text-xs text-red-500 font-semibold flex items-center gap-1.5 mt-1 animate-in fade-in duration-150">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{phoneError}</span>
                  </p>
                )}

                {!phoneError && clientPhone.trim().length > 0 && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-1 animate-in fade-in duration-150">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{lang === "ar" ? "رقم التواصل مكتمل ومؤكد" : "Contact number provided"}</span>
                  </p>
                )}
              </div>

              {/* Auto-Delete Retention Policy Selection */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                    <span>{lang === "ar" ? "سياسة الحذف التلقائي للاحتفاظ بالسجلات" : "Auto-Delete Retention Policy"}</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25">
                    {selectedRetention && selectedRetention > 0
                      ? `${selectedRetention} ${lang === "ar" ? "أيام" : "Days"}`
                      : (lang === "ar" ? "دائم (بدون حذف)" : "Permanent")}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {lang === "ar"
                    ? "حدد مدة بقاء سجلات المحادثات وحجوزات العملاء في لوحة تحكمك قبل أرشفة وحذف السجلات القديمة تلقائياً."
                    : "Choose how long chat logs and CRM bookings are kept in your dashboard before being automatically purged."}
                </p>

                {/* Preset Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                  {[
                    { labelAr: "3 أيام",   labelEn: "3d",   days: 3 },
                    { labelAr: "7 أيام",   labelEn: "7d",   days: 7 },
                    { labelAr: "14 يوماً", labelEn: "14d",  days: 14 },
                    { labelAr: "30 يوماً", labelEn: "30d",  days: 30 },
                  ].map((preset) => {
                    const isSelected = (selectedRetention ?? 0) === preset.days;
                    return (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => setSelectedRetention(preset.days)}
                        className={`px-1.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all text-center cursor-pointer ${
                          isSelected
                            ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                            : "bg-background border-border/80 hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {lang === "ar" ? preset.labelAr : preset.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Allowed Pages Preview Section */}
              {selectedPlan.allowedPages && selectedPlan.allowedPages.length > 0 && (
                <div className="space-y-2 p-3.5 rounded-2xl bg-slate-500/5 border border-slate-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                      <span>{lang === "ar" ? "صفحات وأقسام لوحة التحكم المتاحة مع الباقة" : "Included Dashboard Pages"}</span>
                    </div>
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                      {selectedPlan.allowedPages.length} {lang === "ar" ? "صفحات متاحة" : "Pages"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "الصفحات والأقسام المسموح بفتحها واستخدامها في لوحة تحكم حسابك عند تفعيل هذه الباقة."
                      : "The dashboard pages and modules unlocked for your account under this plan."}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedPlan.allowedPages.map((pageId) => {
                      const pageMeta = CLIENT_PAGES_META.find((p) => p.id === pageId);
                      return (
                        <span
                          key={pageId}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-background border border-border/70 text-foreground/90 shadow-2xs"
                        >
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>{lang === "ar" ? pageMeta?.titleAr || pageId : pageMeta?.titleEn || pageId}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "ملاحظات إضافية أو قنوات مطلوبة (اختياري)" : "Additional Notes / Specific Needs (Optional)"}
                </label>
                <Textarea
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder={
                    lang === "ar"
                      ? "مثال: نرغب بربط بوت واتساب لعيادة أسنان وتخصيص تقويم حجز المواعيد..."
                      : "e.g., We need WhatsApp integration for dental booking and calendar sync..."
                  }
                  rows={3}
                  className="rounded-xl text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 p-4 sm:p-5 bg-card/95 backdrop-blur-md border-t border-border/50 gap-2 sm:gap-2 flex-col-reverse sm:flex-row justify-end z-20 mt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="rounded-xl text-xs"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleConfirmSubscribe}
              disabled={submitTicketMutation.isPending}
              className="rounded-xl text-xs font-bold bg-[#2D5BE3] hover:bg-[#254ec2] text-white gap-1.5 shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {submitTicketMutation.isPending
                  ? lang === "ar"
                    ? "جارٍ الإرسال..."
                    : "Sending..."
                  : lang === "ar"
                  ? "تأكيد وإرسال الطلب"
                  : "Confirm & Submit Request"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Request Top-Up Pack ── */}
      <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
        <DialogContent
          className="max-w-md w-[95vw] max-h-[85vh] overflow-y-auto overflow-x-hidden p-6 rounded-3xl shadow-2xl modal-custom-scroll"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <DialogHeader className="pb-3 border-b border-border/40">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <span>{lang === "ar" ? "طلب شحن رصيد إضافي" : "Request Extra Token Top-Up"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "طلب زيادة الرموز الفوري لحسابك للاستمرار دون توقف."
                : "Request an immediate top-up pack for your company."}
            </DialogDescription>
          </DialogHeader>

          {topupPack && (
            <div className="space-y-4 py-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-foreground">
                    {topupPack.formatted === "+1000K" || topupPack.formatted === "1000K" || topupPack.tokens === 1_000_000 ? "1m" : topupPack.formatted} Tokens
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {topupPack.tokens.toLocaleString()} {lang === "ar" ? "رمز ذكاء اصطناعي" : "tokens"}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-amber-600 dark:text-amber-400">
                    {Math.round(topupPack.priceUsd * currencyCfg.exchangeRate).toLocaleString()} {currencyCfg.symbol}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "ملاحظات للمسؤول (اختياري)" : "Notes for Admin (Optional)"}
                </label>
                <Textarea
                  value={topupNotes}
                  onChange={(e) => setTopupNotes(e.target.value)}
                  placeholder={lang === "ar" ? "يرجى إضافة الرصيد إلى حساب شركتي..." : "Please credit tokens to my account..."}
                  rows={2}
                  className="rounded-xl text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 p-4 bg-card/95 backdrop-blur-md border-t border-border/50 gap-2 sm:gap-2 flex justify-end z-20 mt-4">
            <Button
              variant="outline"
              onClick={() => setTopupDialogOpen(false)}
              className="rounded-xl text-xs"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleConfirmTopup}
              disabled={submitTicketMutation.isPending}
              className="rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 gap-1.5 shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {submitTicketMutation.isPending
                  ? lang === "ar"
                    ? "جارٍ الإرسال..."
                    : "Sending..."
                  : lang === "ar"
                  ? "إرسال طلب الشحن"
                  : "Submit Top-Up Request"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Plus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
