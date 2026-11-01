import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Coins,
  DollarSign,
  Star,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Eye,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Save,
  Search,
  Zap,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { CLIENT_PAGES_META } from "./AdminCompanies";

export interface PackageItem {
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
  badgeAr?: string;
  badgeEn?: string;
  featuresAr: string[];
  featuresEn: string[];
  allowedPages?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export interface TopupPackItem {
  id?: string;
  tokens: number;
  formatted: string;
  priceUsd: number;
  isActive?: boolean;
}

export interface PackagesCatalog {
  packages: PackageItem[];
  topupPacks: TopupPackItem[];
  updatedAt?: string;
}

const COLOR_PRESETS = [
  { name: "Blue", hex: "#2D5BE3" },
  { name: "Cyan", hex: "#0284c7" },
  { name: "Purple", hex: "#8b5cf6" },
  { name: "Emerald", hex: "#059669" },
  { name: "Amber", hex: "#d97706" },
  { name: "Rose", hex: "#e11d48" },
];

export default function AdminPackages() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { rates: liveRates, syncLiveRates, isSyncing, lastUpdated: ratesLastUpdated } = useExchangeRates();

  const EXCHANGE_RATES = {
    USD: 1.0,
    SAR: liveRates.SAR || 3.75,
    AED: liveRates.AED || 3.6725,
    EGP: liveRates.EGP || 56.09,
  };

  const [activeTab, setActiveTab] = useState<"plans" | "topups">("plans");
  const [searchQuery, setSearchQuery] = useState("");

  // Plan Edit / Add Modal State
  const [editingPlan, setEditingPlan] = useState<PackageItem | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isNewPlan, setIsNewPlan] = useState(false);

  // New feature inputs
  const [newFeatureAr, setNewFeatureAr] = useState("");
  const [newFeatureEn, setNewFeatureEn] = useState("");

  // Top-Up Edit / Add Modal State
  const [editingTopup, setEditingTopup] = useState<TopupPackItem | null>(null);
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  const [isNewTopup, setIsNewTopup] = useState(false);

  // Delete Confirmation Dialog
  const [deleteConfirmPlanId, setDeleteConfirmPlanId] = useState<string | null>(null);
  const [deleteConfirmTopupId, setDeleteConfirmTopupId] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Fetch Catalog
  const { data: catalog, isLoading } = useQuery<PackagesCatalog>({
    queryKey: ["admin-packages"],
    queryFn: () => customFetch("/api/admin/packages"),
  });

  const packages = catalog?.packages ?? [];
  const topupPacks = catalog?.topupPacks ?? [];

  // Update Mutation (Supports both PUT and POST seamlessly)
  const updateMutation = useMutation({
    mutationFn: async (newCatalog: { packages: PackageItem[]; topupPacks: TopupPackItem[] }) => {
      try {
        return await customFetch("/api/admin/packages", {
          method: "PUT",
          body: JSON.stringify(newCatalog),
        });
      } catch (err: any) {
        // Fallback to POST if PUT is blocked by server/proxy
        return await customFetch("/api/admin/packages", {
          method: "POST",
          body: JSON.stringify(newCatalog),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      queryClient.invalidateQueries({ queryKey: ["packages-catalog"] });
      toast({
        title: lang === "ar" ? "تم الحفظ بنجاح" : "Changes Saved",
        description: lang === "ar" ? "تم تحديث كتالوج الباقات وحزم الشحن بنجاح" : "Packages catalog updated successfully",
      });
      setIsPlanModalOpen(false);
      setIsTopupModalOpen(false);
      setDeleteConfirmPlanId(null);
      setDeleteConfirmTopupId(null);
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "خطأ في الحفظ" : "Save Error",
        description: err?.message || (lang === "ar" ? "فشل حفظ التعديلات" : "Failed to save changes"),
        variant: "destructive",
      });
    },
  });

  // Reset to Defaults Mutation
  const resetMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/packages/reset", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      queryClient.invalidateQueries({ queryKey: ["packages-catalog"] });
      toast({
        title: lang === "ar" ? "تمت إعادة التعيين للافتراضي" : "Reset to Defaults",
        description: lang === "ar" ? "تمت استعادة باقات وحزم الشحن الافتراضية بنجاح" : "Default packages catalog restored",
      });
      setIsResetConfirmOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "خطأ" : "Error",
        description: err?.message || "Failed to reset",
        variant: "destructive",
      });
    },
  });

  // ── Plan Helpers ──
  const handleOpenAddPlan = () => {
    setIsNewPlan(true);
    setEditingPlan({
      id: `plan-${Date.now().toString().slice(-4)}`,
      nameAr: "",
      nameEn: "",
      descriptionAr: "",
      descriptionEn: "",
      monthlyPriceUsd: 49,
      tokensMonthly: 100_000,
      tokensFormatted: "100,000",
      popular: false,
      color: "#2D5BE3",
      badgeAr: "",
      badgeEn: "",
      featuresAr: ["100,000 رمز شهرياً (AI Tokens)", "ويدجت الموقع وبوت تليجرام"],
      featuresEn: ["100,000 monthly AI Tokens", "Website Widget & Telegram Bot"],
      allowedPages: CLIENT_PAGES_META.map((p) => p.id),
      isActive: true,
      sortOrder: packages.length + 1,
    });
    setNewFeatureAr("");
    setNewFeatureEn("");
    setIsPlanModalOpen(true);
  };

  const handleOpenEditPlan = (plan: PackageItem) => {
    setIsNewPlan(false);
    setEditingPlan({
      ...plan,
      featuresAr: [...plan.featuresAr],
      featuresEn: [...plan.featuresEn],
      allowedPages: Array.isArray(plan.allowedPages)
        ? [...plan.allowedPages]
        : CLIENT_PAGES_META.map((p) => p.id),
    });
    setNewFeatureAr("");
    setNewFeatureEn("");
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = () => {
    if (!editingPlan) return;
    if (!editingPlan.nameAr.trim()) {
      toast({ title: lang === "ar" ? "اسم الباقة مطلوب" : "Plan name required", variant: "destructive" });
      return;
    }

    let updatedPackages = [...packages];
    if (isNewPlan) {
      updatedPackages.push(editingPlan);
    } else {
      updatedPackages = updatedPackages.map((p) => (p.id === editingPlan.id ? editingPlan : p));
    }

    updateMutation.mutate({ packages: updatedPackages, topupPacks });
  };

  const handleTogglePlanActive = (planId: string) => {
    const updated = packages.map((p) => (p.id === planId ? { ...p, isActive: p.isActive === false ? true : false } : p));
    updateMutation.mutate({ packages: updated, topupPacks });
  };

  const handleDeletePlan = (planId: string) => {
    const updated = packages.filter((p) => p.id !== planId);
    updateMutation.mutate({ packages: updated, topupPacks });
  };

  const handleMovePlan = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= packages.length) return;
    const newArr = [...packages];
    const temp = newArr[index];
    newArr[index] = newArr[targetIdx];
    newArr[targetIdx] = temp;
    // Update sortOrder
    const updated = newArr.map((p, idx) => ({ ...p, sortOrder: idx + 1 }));
    updateMutation.mutate({ packages: updated, topupPacks });
  };

  const handleDuplicatePlan = (plan: PackageItem) => {
    const copy: PackageItem = {
      ...plan,
      id: `${plan.id}-copy-${Date.now().toString().slice(-4)}`,
      nameAr: `${plan.nameAr} (نسخة)`,
      nameEn: `${plan.nameEn} (Copy)`,
      popular: false,
      sortOrder: packages.length + 1,
    };
    updateMutation.mutate({ packages: [...packages, copy], topupPacks });
  };

  // Add feature bullet
  const handleAddFeature = () => {
    if (!editingPlan) return;
    if (!newFeatureAr.trim() && !newFeatureEn.trim()) return;
    const ar = newFeatureAr.trim() || newFeatureEn.trim();
    const en = newFeatureEn.trim() || newFeatureAr.trim();
    setEditingPlan({
      ...editingPlan,
      featuresAr: [...editingPlan.featuresAr, ar],
      featuresEn: [...editingPlan.featuresEn, en],
    });
    setNewFeatureAr("");
    setNewFeatureEn("");
  };

  const handleRemoveFeature = (index: number) => {
    if (!editingPlan) return;
    setEditingPlan({
      ...editingPlan,
      featuresAr: editingPlan.featuresAr.filter((_, i) => i !== index),
      featuresEn: editingPlan.featuresEn.filter((_, i) => i !== index),
    });
  };

  // ── Top-up Helpers ──
  const handleOpenAddTopup = () => {
    setIsNewTopup(true);
    setEditingTopup({
      id: `topup-${Date.now().toString().slice(-4)}`,
      tokens: 50_000,
      formatted: "+50K",
      priceUsd: 10,
      isActive: true,
    });
    setIsTopupModalOpen(true);
  };

  const handleOpenEditTopup = (tp: TopupPackItem) => {
    setIsNewTopup(false);
    setEditingTopup({ ...tp });
    setIsTopupModalOpen(true);
  };

  const handleSaveTopup = () => {
    if (!editingTopup) return;
    let updatedTopups = [...topupPacks];
    if (isNewTopup) {
      updatedTopups.push(editingTopup);
    } else {
      updatedTopups = updatedTopups.map((tp) => (tp.id === editingTopup.id ? editingTopup : tp));
    }
    updateMutation.mutate({ packages, topupPacks: updatedTopups });
  };

  const handleDeleteTopup = (topupId: string) => {
    const updated = topupPacks.filter((tp) => tp.id !== topupId);
    updateMutation.mutate({ packages, topupPacks: updated });
  };

  const filteredPackages = packages.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.nameAr.toLowerCase().includes(q) ||
      p.nameEn.toLowerCase().includes(q) ||
      p.tokensFormatted?.toLowerCase().includes(q) ||
      String(p.monthlyPriceUsd).includes(q)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {/* ── Operations Hero Header Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #070b19 0%, #0e1838 50%, #102354 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-[#2D5BE3]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-sky-400/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <Package className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {lang === "ar" ? "إدارة باقات واشتراكات المنصة" : "Packages & Plans Management"}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 border border-white/30 backdrop-blur-md">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  {lang === "ar" ? "صلاحيات المسؤول الكاملة" : "Admin Master Controls"}
                </span>
              </div>
              <p className="text-sm sm:text-base text-blue-100/90 max-w-2xl leading-relaxed">
                {lang === "ar"
                  ? "تعديل وإضافة باقات الاشتراك، تحديد حصص الرموز (Tokens)، ضبط الأسعار، ميزات كل باقة، وحزم شحن الرصيد الإضافية المعروضة للعملاء."
                  : "Add, modify, and price subscription packages, token allocations, feature lists, and top-up packs shown to clients."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-stretch md:self-auto">
            <Button
              variant="outline"
              onClick={() => {
                syncLiveRates(undefined as any, {
                  onSuccess: () => {
                    toast({
                      title: lang === "ar" ? "تم تحديث أسعار الصرف" : "Exchange Rates Synced",
                      description: lang === "ar" ? "تم جلب أحدث أسعار العملات الحية وتحديث أسعار المنصة" : "Live daily exchange rates updated",
                    });
                  },
                });
              }}
              disabled={isSyncing}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-400/30 rounded-xl text-xs font-bold gap-1.5 cursor-pointer backdrop-blur-md"
              title={lang === "ar" ? "تحديث أسعار الصرف الحية اليومية الآن" : "Sync live daily exchange rates"}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? (lang === "ar" ? "جارٍ المزامنة..." : "Syncing...") : (lang === "ar" ? "تحديث أسعار العملات" : "Sync Rates")}</span>
            </Button>
            <Button
              onClick={handleOpenAddPlan}
              className="bg-[#2D5BE3] hover:bg-[#254ec2] text-white rounded-xl text-xs font-bold gap-2 shadow-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{lang === "ar" ? "إضافة باقة جديدة" : "Add New Plan"}</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsResetConfirmOpen(true)}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 rounded-xl text-xs font-bold gap-1.5 cursor-pointer backdrop-blur-md"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "استعادة الافتراضي" : "Reset Defaults"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="w-full space-y-6"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <TabsList className="bg-muted/60 p-1 rounded-2xl border border-border/60">
            <TabsTrigger
              value="plans"
              className="rounded-xl px-4 py-2 text-xs sm:text-sm font-bold gap-2"
            >
              <Package className="w-4 h-4" />
              <span>{lang === "ar" ? "باقات الاشتراك الشهرية" : "Subscription Plans"}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-primary/10 text-primary font-black">
                {packages.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="topups"
              className="rounded-xl px-4 py-2 text-xs sm:text-sm font-bold gap-2"
            >
              <Coins className="w-4 h-4 text-amber-500" />
              <span>{lang === "ar" ? "حزم الشحن الإضافي (Top-ups)" : "Top-Up Packs"}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black">
                {topupPacks.length}
              </span>
            </TabsTrigger>
          </TabsList>

          {activeTab === "plans" && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === "ar" ? "بحث في الباقات..." : "Search plans..."}
                className="pr-9 rounded-xl text-xs h-9 bg-card"
              />
            </div>
          )}

          {activeTab === "topups" && (
            <Button
              onClick={handleOpenAddTopup}
              size="sm"
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "إضافة حزمة شحن" : "Add Top-Up Pack"}</span>
            </Button>
          )}
        </div>

        {/* ── Content 1: Plans ── */}
        <TabsContent value="plans" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPackages.map((plan, index) => {
              const isPopular = plan.popular;
              const isInactive = plan.isActive === false;

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col rounded-3xl transition-all border ${
                    isPopular
                      ? "border-2 border-[#2D5BE3] shadow-lg shadow-blue-500/10 bg-gradient-to-b from-blue-500/5 via-card to-card"
                      : "border-border/70 hover:border-border shadow-sm bg-card"
                  } ${isInactive ? "opacity-60 bg-muted/20" : ""}`}
                >
                  {/* Badge */}
                  <div className="p-5 pb-3 border-b border-border/40 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: plan.color || "#2D5BE3" }}
                        />
                        <h3 className="font-extrabold text-base sm:text-lg text-foreground">
                          {plan.nameAr}
                        </h3>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">
                        {plan.nameEn}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isPopular && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-amber-500" />
                          <span>{lang === "ar" ? "موصى به" : "Popular"}</span>
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          !isInactive
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25"
                        }`}
                      >
                        {!isInactive
                          ? lang === "ar"
                            ? "نشطة"
                            : "Active"
                          : lang === "ar"
                          ? "معطلة"
                          : "Hidden"}
                      </span>
                    </div>
                  </div>

                  {/* Pricing & Tokens Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-foreground tabular-nums">
                          ${plan.monthlyPriceUsd}
                        </span>
                        <span className="text-xs text-muted-foreground font-semibold">
                          / {lang === "ar" ? "شهر" : "mo"}
                        </span>
                      </div>

                      {/* Currency approximations */}
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        <span>~{Math.round(plan.monthlyPriceUsd * EXCHANGE_RATES.SAR)} ر.س</span>
                        <span>·</span>
                        <span>~{Math.round(plan.monthlyPriceUsd * EXCHANGE_RATES.AED)} د.إ</span>
                        <span>·</span>
                        <span>~{Math.round(plan.monthlyPriceUsd * EXCHANGE_RATES.EGP)} ج.م</span>
                      </div>

                      {/* Quota */}
                      <div className="mt-3.5 p-2.5 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Coins className="w-3.5 h-3.5 text-primary" />
                          <span>{lang === "ar" ? "الحصة الشهرية:" : "Monthly Tokens:"}</span>
                        </div>
                        <span className="text-xs font-black text-primary tabular-nums">
                          {plan.tokensFormatted || Number(plan.tokensMonthly).toLocaleString()}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
                        {plan.descriptionAr || plan.descriptionEn}
                      </p>

                      {/* Feature summary */}
                      <div className="mt-3 space-y-1.5 pt-2 border-t border-border/30">
                        <span className="text-[11px] font-bold text-muted-foreground">
                          {lang === "ar" ? "أهم الميزات:" : "Features:"} ({plan.featuresAr.length})
                        </span>
                        <ul className="space-y-1">
                          {plan.featuresAr.slice(0, 4).map((f, i) => (
                            <li key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                              <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                              <span className="line-clamp-1">{f}</span>
                            </li>
                          ))}
                          {plan.featuresAr.length > 4 && (
                            <li className="text-[10px] text-primary font-bold">
                              +{plan.featuresAr.length - 4} {lang === "ar" ? "ميزات إضافية..." : "more features..."}
                            </li>
                          )}
                        </ul>
                      </div>

                      {/* Allowed Pages Badge */}
                      <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                          <span>{lang === "ar" ? "الصفحات المتاحة:" : "Allowed Pages:"}</span>
                        </span>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold px-2 py-0.5">
                          {Array.isArray(plan.allowedPages) ? plan.allowedPages.length : CLIENT_PAGES_META.length} / {CLIENT_PAGES_META.length}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMovePlan(index, "up")}
                          disabled={index === 0}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 cursor-pointer"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMovePlan(index, "down")}
                          disabled={index === packages.length - 1}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30 cursor-pointer"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicatePlan(plan)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                          title={lang === "ar" ? "تكرار الباقة" : "Duplicate Plan"}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleTogglePlanActive(plan.id)}
                          className={`h-7 px-2 text-[11px] font-bold rounded-lg cursor-pointer ${
                            !isInactive
                              ? "text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                              : "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                          }`}
                        >
                          {!isInactive ? (lang === "ar" ? "إخفاء" : "Hide") : (lang === "ar" ? "إظهار" : "Show")}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEditPlan(plan)}
                          className="h-7 px-2.5 text-xs font-bold rounded-lg gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3 text-primary" />
                          <span>{lang === "ar" ? "تعديل" : "Edit"}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirmPlanId(plan.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Content 2: Top-Up Packs ── */}
        <TabsContent value="topups" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {topupPacks.map((pack, idx) => (
              <Card
                key={pack.id || idx}
                className="border border-border/70 rounded-2xl p-5 bg-card flex flex-col justify-between hover:shadow-md transition-all"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase text-muted-foreground">
                      {lang === "ar" ? "حزمة شحن" : "Top-up"}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                      {pack.formatted}
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-foreground tabular-nums">
                      ${pack.priceUsd}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (~{Math.round(pack.priceUsd * EXCHANGE_RATES.SAR)} ر.س)
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-2">
                    {pack.tokens.toLocaleString()} {lang === "ar" ? "رمز ذكاء اصطناعي" : "AI Tokens"}
                  </p>
                </div>

                <div className="pt-4 border-t border-border/40 mt-4 flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold ${
                      pack.isActive !== false ? "text-emerald-500" : "text-muted-foreground"
                    }`}
                  >
                    {pack.isActive !== false
                      ? lang === "ar"
                        ? "متاحة للطلب"
                        : "Active"
                      : lang === "ar"
                      ? "معطلة"
                      : "Hidden"}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEditTopup(pack)}
                      className="h-7 px-2 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      <Pencil className="w-3 h-3 text-primary" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirmTopupId(pack.id || `pack-${idx}`)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Add / Edit Plan ── */}
      <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <span>
                {isNewPlan
                  ? lang === "ar"
                    ? "إضافة باقة اشتراك جديدة"
                    : "Add New Subscription Plan"
                  : lang === "ar"
                  ? "تعديل باقة الاشتراك"
                  : "Edit Subscription Plan"}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "تعديل تفاصيل الباقة، الحصة الشهرية، والأسعار التي ستظهر للعملاء في لوحتهم."
                : "Configure package details, monthly token quotas, and client-facing prices."}
            </DialogDescription>
          </DialogHeader>

          {editingPlan && (
            <div className="space-y-4 py-2">
              {/* Row 1: Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === "ar" ? "اسم الباقة (عربي)" : "Plan Name (Arabic)"} *
                  </label>
                  <Input
                    value={editingPlan.nameAr}
                    onChange={(e) => setEditingPlan({ ...editingPlan, nameAr: e.target.value })}
                    placeholder="مثال: الباقة الأساسية (Starter)"
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === "ar" ? "اسم الباقة (إنجليزي)" : "Plan Name (English)"} *
                  </label>
                  <Input
                    value={editingPlan.nameEn}
                    onChange={(e) => setEditingPlan({ ...editingPlan, nameEn: e.target.value })}
                    placeholder="e.g. Starter Plan"
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Row 2: Price & Tokens */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>{lang === "ar" ? "السعر الشهري (بالدولار USD)" : "Monthly Price ($ USD)"} *</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      ≈ {Math.round(editingPlan.monthlyPriceUsd * EXCHANGE_RATES.SAR)} ر.س / {Math.round(editingPlan.monthlyPriceUsd * EXCHANGE_RATES.EGP)} ج.م
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min={0}
                      value={editingPlan.monthlyPriceUsd}
                      onChange={(e) =>
                        setEditingPlan({ ...editingPlan, monthlyPriceUsd: parseFloat(e.target.value) || 0 })
                      }
                      className="pl-7 rounded-xl text-xs font-bold tabular-nums"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>{lang === "ar" ? "حصة الرموز الشهرية (Tokens)" : "Monthly AI Tokens"} *</span>
                    <span className="text-[10px] text-primary font-bold">
                      {Number(editingPlan.tokensMonthly).toLocaleString()} Tokens
                    </span>
                  </label>
                  <Input
                    type="number"
                    step={10000}
                    min={0}
                    value={editingPlan.tokensMonthly}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setEditingPlan({
                        ...editingPlan,
                        tokensMonthly: val,
                        tokensFormatted: val.toLocaleString(),
                      });
                    }}
                    className="rounded-xl text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              {/* Row 3: Descriptions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === "ar" ? "الوصف المختصر (عربي)" : "Short Description (Arabic)"}
                  </label>
                  <Textarea
                    value={editingPlan.descriptionAr}
                    onChange={(e) => setEditingPlan({ ...editingPlan, descriptionAr: e.target.value })}
                    rows={2}
                    className="rounded-xl text-xs"
                    placeholder="مثالية للمشاريع الناشئة لبدء أتمتة الردود..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === "ar" ? "الوصف المختصر (إنجليزي)" : "Short Description (English)"}
                  </label>
                  <Textarea
                    value={editingPlan.descriptionEn}
                    onChange={(e) => setEditingPlan({ ...editingPlan, descriptionEn: e.target.value })}
                    rows={2}
                    className="rounded-xl text-xs"
                    placeholder="Perfect for startups and small teams..."
                  />
                </div>
              </div>

              {/* Row 4: Badges & Popular */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border/40">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === "ar" ? "شارة التمييز (عربي)" : "Badge Text (AR)"}
                  </label>
                  <Input
                    value={editingPlan.badgeAr || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, badgeAr: e.target.value })}
                    placeholder="مثال: الأكثر طلباً / خصم 20%"
                    className="rounded-xl text-xs bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    {lang === "ar" ? "شارة التمييز (إنجليزي)" : "Badge Text (EN)"}
                  </label>
                  <Input
                    value={editingPlan.badgeEn || ""}
                    onChange={(e) => setEditingPlan({ ...editingPlan, badgeEn: e.target.value })}
                    placeholder="e.g. Most Popular"
                    className="rounded-xl text-xs bg-background"
                  />
                </div>
                <div className="flex flex-col justify-center space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      {lang === "ar" ? "تمييز كباقة رئيسية" : "Popular Highlight"}
                    </span>
                    <Switch
                      checked={Boolean(editingPlan.popular)}
                      onCheckedChange={(checked) => setEditingPlan({ ...editingPlan, popular: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      {lang === "ar" ? "إظهار للعملاء (نشطة)" : "Visible to Clients"}
                    </span>
                    <Switch
                      checked={editingPlan.isActive !== false}
                      onCheckedChange={(checked) => setEditingPlan({ ...editingPlan, isActive: checked })}
                    />
                  </div>
                </div>
              </div>

              {/* Row 5: Theme Color */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "لون الباقة" : "Card Accent Color"}
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setEditingPlan({ ...editingPlan, color: c.hex })}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer border-2 ${
                        editingPlan.color === c.hex ? "scale-110 border-white shadow-md ring-2 ring-primary" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                  <Input
                    value={editingPlan.color || "#2D5BE3"}
                    onChange={(e) => setEditingPlan({ ...editingPlan, color: e.target.value })}
                    className="w-24 h-7 text-xs font-mono rounded-lg ml-2"
                  />
                </div>
              </div>

              {/* Row 6: Features Manager */}
              <div className="space-y-2 pt-2 border-t border-border/40">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>{lang === "ar" ? "قائمة ميزات الباقة (Features List)" : "Plan Features"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({editingPlan.featuresAr.length} {lang === "ar" ? "ميزات مسجلة" : "features"})
                  </span>
                </label>

                <div className="space-y-1.5 max-h-48 overflow-y-auto p-2 rounded-xl bg-muted/30 border border-border/40">
                  {editingPlan.featuresAr.map((feat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-background text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">{feat}</span>
                        {editingPlan.featuresEn[idx] && editingPlan.featuresEn[idx] !== feat && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            ({editingPlan.featuresEn[idx]})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(idx)}
                        className="text-muted-foreground hover:text-rose-500 p-1 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Feature Inputs */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Input
                    value={newFeatureAr}
                    onChange={(e) => setNewFeatureAr(e.target.value)}
                    placeholder={lang === "ar" ? "ميزة جديدة بالعربية..." : "New feature in Arabic..."}
                    className="rounded-xl text-xs flex-1"
                  />
                  <Input
                    value={newFeatureEn}
                    onChange={(e) => setNewFeatureEn(e.target.value)}
                    placeholder={lang === "ar" ? "ترجمة الميزة بالإنجليزية..." : "Feature in English..."}
                    className="rounded-xl text-xs flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddFeature}
                    className="rounded-xl text-xs font-bold gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === "ar" ? "إضافة" : "Add"}</span>
                  </Button>
                </div>
              </div>

              {/* Row 7: Allowed Client Pages */}
              <div className="space-y-3 pt-3 border-t border-border/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-muted/40 p-3.5 rounded-2xl border border-border/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-primary" />
                      <label className="text-xs font-bold text-foreground">
                        {lang === "ar" ? "الصفحات المتاحة للعميل في هذه الباقة" : "Allowed Client Pages for this Plan"}
                      </label>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[11px] font-bold px-2 py-0.5">
                        {(editingPlan.allowedPages ?? CLIENT_PAGES_META.map((p) => p.id)).length} / {CLIENT_PAGES_META.length}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {lang === "ar"
                        ? "حدد الصفحات التي يستطيع العميل المشترك في هذه الباقة الوصول إليها في قائمته الجانبية. الصفحات غير المحددة سيتم حجبها تلقائياً."
                        : "Select the sidebar pages that clients on this subscription plan will be able to access. Unchecked pages will be hidden."}
                    </p>
                  </div>

                  {/* Presets */}
                  <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditingPlan({
                          ...editingPlan,
                          allowedPages: CLIENT_PAGES_META.map((p) => p.id),
                        })
                      }
                      className="text-[11px] h-7 px-2.5 rounded-lg font-medium cursor-pointer"
                    >
                      {lang === "ar" ? "تفعيل الكل" : "Enable All"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditingPlan({
                          ...editingPlan,
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
                        })
                      }
                      className="text-[11px] h-7 px-2.5 rounded-lg font-medium cursor-pointer"
                    >
                      {lang === "ar" ? "الوضع الأساسي" : "Core"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditingPlan({
                          ...editingPlan,
                          allowedPages: ["dashboard", "packages", "support"],
                        })
                      }
                      className="text-[11px] h-7 px-2 text-destructive hover:text-destructive rounded-lg cursor-pointer"
                    >
                      {lang === "ar" ? "الحد الأدنى" : "Minimal"}
                    </Button>
                  </div>
                </div>

                {/* Grid of Pages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1 pr-1.5">
                  {CLIENT_PAGES_META.map((page) => {
                    const Icon = page.icon;
                    const allowedList = editingPlan.allowedPages ?? CLIENT_PAGES_META.map((p) => p.id);
                    const isAllowed = allowedList.includes(page.id);

                    const togglePage = () => {
                      const updated = isAllowed
                        ? allowedList.filter((id) => id !== page.id)
                        : [...allowedList, page.id];
                      setEditingPlan({ ...editingPlan, allowedPages: updated });
                    };

                    return (
                      <div
                        key={page.id}
                        onClick={togglePage}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 select-none ${
                          isAllowed
                            ? "bg-primary/5 border-primary/40 shadow-sm"
                            : "bg-muted/20 border-border/60 opacity-60 hover:opacity-90"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isAllowed
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-semibold block truncate">
                              {lang === "ar" ? page.titleAr : page.titleEn}
                            </span>
                            <span className="text-[10px] text-muted-foreground block truncate font-mono">
                              {page.id}
                            </span>
                          </div>
                        </div>

                        <Switch
                          checked={isAllowed}
                          onCheckedChange={togglePage}
                          className="shrink-0 scale-75"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              onClick={() => setIsPlanModalOpen(false)}
              className="rounded-xl text-xs cursor-pointer"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleSavePlan}
              disabled={updateMutation.isPending}
              className="rounded-xl text-xs font-bold bg-[#2D5BE3] hover:bg-[#254ec2] text-white gap-1.5 cursor-pointer shadow-md"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {updateMutation.isPending
                  ? lang === "ar"
                    ? "جارٍ الحفظ..."
                    : "Saving..."
                  : lang === "ar"
                  ? "حفظ التعديلات"
                  : "Save Changes"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Add / Edit Top-Up ── */}
      <Dialog open={isTopupModalOpen} onOpenChange={setIsTopupModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <span>
                {isNewTopup
                  ? lang === "ar"
                    ? "إضافة حزمة شحن رصيد"
                    : "Add Top-Up Pack"
                  : lang === "ar"
                  ? "تعديل حزمة الشحن"
                  : "Edit Top-Up Pack"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {editingTopup && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "عدد الرموز المضافة (Tokens)" : "Token Count"}
                </label>
                <Input
                  type="number"
                  step={5000}
                  min={1000}
                  value={editingTopup.tokens}
                  onChange={(e) => {
                    const tokens = parseInt(e.target.value) || 0;
                    setEditingTopup({
                      ...editingTopup,
                      tokens,
                      formatted: `+${Math.round(tokens / 1000)}K`,
                    });
                  }}
                  className="rounded-xl text-xs font-bold tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  {lang === "ar" ? "التسمية المختصرة" : "Badge Label"}
                </label>
                <Input
                  value={editingTopup.formatted}
                  onChange={(e) => setEditingTopup({ ...editingTopup, formatted: e.target.value })}
                  placeholder="+50K"
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{lang === "ar" ? "السعر (بالدولار USD)" : "Price ($ USD)"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    ≈ {Math.round(editingTopup.priceUsd * EXCHANGE_RATES.SAR)} ر.س
                  </span>
                </label>
                <Input
                  type="number"
                  min={1}
                  value={editingTopup.priceUsd}
                  onChange={(e) =>
                    setEditingTopup({ ...editingTopup, priceUsd: parseFloat(e.target.value) || 0 })
                  }
                  className="rounded-xl text-xs font-bold tabular-nums"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-foreground">
                  {lang === "ar" ? "متاحة للطلب في لوحة العميل" : "Active & Visible"}
                </span>
                <Switch
                  checked={editingTopup.isActive !== false}
                  onCheckedChange={(checked) => setEditingTopup({ ...editingTopup, isActive: checked })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              onClick={() => setIsTopupModalOpen(false)}
              className="rounded-xl text-xs cursor-pointer"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={handleSaveTopup}
              disabled={updateMutation.isPending}
              className="rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "حفظ الحزمة" : "Save Pack"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirm Plan Delete ── */}
      <Dialog open={Boolean(deleteConfirmPlanId)} onOpenChange={() => setDeleteConfirmPlanId(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <span>{lang === "ar" ? "تأكيد حذف الباقة" : "Confirm Plan Deletion"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "هل أنت متأكد من رغبتك في حذف هذه الباقة من الكتالوج؟ لن تظهر للعملاء بعد الآن."
                : "Are you sure you want to delete this package from the catalog?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmPlanId(null)}
              className="rounded-xl text-xs cursor-pointer"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmPlanId && handleDeletePlan(deleteConfirmPlanId)}
              className="rounded-xl text-xs font-bold cursor-pointer"
            >
              {lang === "ar" ? "حذف الباقة" : "Delete Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Confirm Topup Delete ── */}
      <Dialog open={Boolean(deleteConfirmTopupId)} onOpenChange={() => setDeleteConfirmTopupId(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <span>{lang === "ar" ? "تأكيد حذف حزمة الشحن" : "Confirm Top-Up Deletion"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "هل أنت متأكد من حذف هذه الحزمة؟"
                : "Are you sure you want to delete this top-up pack?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmTopupId(null)}
              className="rounded-xl text-xs cursor-pointer"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmTopupId && handleDeleteTopup(deleteConfirmTopupId)}
              className="rounded-xl text-xs font-bold cursor-pointer"
            >
              {lang === "ar" ? "حذف الحزمة" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Reset Confirmation ── */}
      <Dialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-amber-600">
              <RotateCcw className="w-5 h-5 text-amber-500" />
              <span>{lang === "ar" ? "استعادة الكتالوج الافتراضي" : "Reset to Default Catalog"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "سيؤدي هذا الإجراء إلى إعادة تعيين جميع الباقات (Starter, Professional, Enterprise) وحزم الشحن إلى الإعدادات الأولية للمنصة."
                : "This will revert all packages and top-up packs back to platform defaults."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsResetConfirmOpen(false)}
              className="rounded-xl text-xs cursor-pointer"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer"
            >
              {resetMutation.isPending
                ? lang === "ar"
                  ? "جارٍ الاستعادة..."
                  : "Resetting..."
                : lang === "ar"
                ? "تأكيد الاستعادة"
                : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
