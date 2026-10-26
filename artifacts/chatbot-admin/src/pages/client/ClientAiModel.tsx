import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  useGetClientCompany,
  useUpdateClientCompany,
  getGetClientCompanyQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  Bot,
  Sparkles,
  Zap,
  Lock,
  Eye,
  EyeOff,
  UserRound,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Coins,
  KeyRound,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Check,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  AI_PROVIDERS,
  type AiProvider,
  mergeDynamicModels,
  type AiModelCatalogResponse,
} from "@/lib/ai-models";

type AiStatus = {
  status: "ok" | "no_quota" | "no_platform_key" | "no_key" | "invalid_key" | "quota_exceeded" | "error" | "no_company";
  mode?: "quota" | "tokens";
  provider?: string;
  model?: string;
  isSupportAgent?: boolean;
  detail?: string;
};

type QuotaData = {
  quota: number | null;
  usedTokens: number;
  percentUsed: number | null;
  warning: "ok" | "near" | "exceeded" | "none";
  model?: string;
  provider?: string;
};

export default function ClientAiModel() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: company, isLoading } = useGetClientCompany();
  const updateCompany = useUpdateClientCompany();

  // Mode tracking
  const userToggledRef = useRef(false);
  const [activeMode, setActiveMode] = useState<"quota" | "tokens">("quota");

  // Form states with smart initial values
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>("openrouter");
  const [selectedModel, setSelectedModel] = useState<string>("openrouter/free");
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState(false);
  const initialized = useRef(false);

  // Connection testing state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
    provider?: string;
    model?: string;
    mode?: string;
  } | null>(null);

  // Monthly Quota Data Query
  const { data: quotaData } = useQuery<QuotaData>({
    queryKey: ["client-company-quota"],
    queryFn: () => customFetch<QuotaData>("/api/client/company/quota"),
    enabled: true,
    refetchInterval: 60_000,
  });

  // Dynamic model catalog
  const { data: syncedAiModels } = useQuery<AiModelCatalogResponse>({
    queryKey: ["client-ai-model-catalog"],
    queryFn: () => customFetch("/api/client/ai-models") as Promise<AiModelCatalogResponse>,
    enabled: !!company,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  // Effective Quota Defaults
  const quotaProvider = (company as any)?.quotaAiProvider || (quotaData as any)?.provider || "openrouter";
  const quotaModel = (company as any)?.quotaAiModel || (quotaData as any)?.model || "openrouter/free";

  // Sync state from server on company load
  useEffect(() => {
    if (company && !initialized.current) {
      if ((company as any).aiExecutionMode && !userToggledRef.current) {
        setActiveMode((company as any).aiExecutionMode);
      }

      // Pre-fill provider: use company provider if valid, otherwise fallback to quotaProvider or openrouter
      const initialProvider = (company.aiProvider && company.aiProvider in AI_PROVIDERS)
        ? (company.aiProvider as AiProvider)
        : (quotaProvider in AI_PROVIDERS ? (quotaProvider as AiProvider) : "openrouter");
      setSelectedProvider(initialProvider);

      // Pre-fill model: use company model if valid, otherwise fallback to quotaModel
      if (company.aiModel) {
        setSelectedModel(
          company.aiModel.includes("nemotron-nano")
            ? "nvidia/nemotron-3.5-lightning:free"
            : company.aiModel
        );
      } else {
        setSelectedModel(quotaModel || "openrouter/free");
      }

      if (company.aiAgentApiKey) {
        setApiKey(company.aiAgentApiKey);
      }

      initialized.current = true;
    }
  }, [company, quotaProvider, quotaModel]);

  // AI Connection Status Query
  const { data: aiStatus, isLoading: aiStatusLoading, refetch: refetchAiStatus } = useQuery<AiStatus>({
    queryKey: ["client-ai-status", activeMode],
    queryFn: () => customFetch(`/api/client/company/ai-status?mode=${activeMode}`) as Promise<AiStatus>,
    enabled: !!company,
    staleTime: 30_000,
    retry: false,
  });

  // Mode Switch Mutation
  const toggleExecutionModeMutation = useMutation({
    mutationFn: async (mode: "quota" | "tokens") => {
      try {
        return await customFetch("/api/client/company/execution-mode", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
      } catch {
        return await customFetch("/api/client/company", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: company?.name || "Company",
            aiExecutionMode: mode,
          }),
        });
      }
    },
    onMutate: (mode) => {
      userToggledRef.current = true;
      setActiveMode(mode);
    },
    onSuccess: (_, mode) => {
      userToggledRef.current = true;
      setActiveMode(mode);
      queryClient.setQueryData(getGetClientCompanyQueryKey(), (old: any) => {
        if (!old) return old;
        return { ...old, aiExecutionMode: mode };
      });
      queryClient.invalidateQueries({ queryKey: ["client-ai-status"] });
      queryClient.invalidateQueries({ queryKey: ["client-company-quota"] });
      queryClient.invalidateQueries({ queryKey: ["/client/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["client-dashboard"] });
      toast({
        title: lang === "ar"
          ? (mode === "quota" ? "تم تفعيل نمط: حصة المنصة (Quota)" : "تم تفعيل نمط: رموز API الخاصة (API Tokens)")
          : (mode === "quota" ? "Switched to: Admin Quota Mode" : "Switched to: API Tokens Mode"),
        description: lang === "ar"
          ? (mode === "quota"
              ? "يعتمد المساعد الآن على حصة الرموز المخصصة لشركتك من قِبل الإدارة."
              : (company?.aiAgentApiKey || apiKey
                  ? "يعتمد المساعد الآن على مفتاح API الخاص بشركتك دون قيود الحصة."
                  : "يرجى إضافة مفتاح API الخاص بك في قسم إعدادات الذكاء الاصطناعي أدناه لتفعيل الردود."))
          : (mode === "quota"
              ? "Your assistant is now using the monthly quota assigned by the platform admin."
              : (company?.aiAgentApiKey || apiKey
                  ? "Your assistant is now using your company's own API tokens."
                  : "Please add your API key in the AI Configuration section below to activate responses.")),
      });
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "فشل تبديل النمط على الخادم" : "Failed to switch mode on server",
        description: err?.message || (lang === "ar" ? "حدث خطأ أثناء حفظ النمط." : "Error updating execution mode."),
        variant: "destructive",
      });
    },
  });

  const handleToggleMode = (newMode: "quota" | "tokens") => {
    if (newMode === activeMode) return;
    userToggledRef.current = true;
    setActiveMode(newMode);
    toggleExecutionModeMutation.mutate(newMode);
  };

  // Switch Provider and auto-select recommended model
  const handleSelectProvider = (key: AiProvider) => {
    setSelectedProvider(key);
    setTestResult(null);
    const models = mergeDynamicModels(
      (AI_PROVIDERS[key]?.models ?? []) as unknown as Array<{ value: string; label: string; free: boolean }>,
      syncedAiModels?.providers?.[key]
    );
    const defaultModel = models.find((m) => m.free) || models[0];
    if (defaultModel) {
      setSelectedModel(defaultModel.value);
    }
  };

  // Test AI Connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await customFetch<{
        ok: boolean;
        message?: string;
        error?: string;
        latencyMs?: number;
        provider?: string;
        model?: string;
        mode?: string;
      }>("/api/client/company/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel || undefined,
          apiKey: apiKey || undefined,
          mode: activeMode,
        }),
      });

      if (res.ok) {
        setTestResult({
          ok: true,
          message: res.message || (lang === "ar" ? "✅ الاتصال بالذكاء الاصطناعي يعمل بنجاح!" : "✅ AI connection test succeeded!"),
          latencyMs: res.latencyMs,
          provider: res.provider,
          model: res.model,
          mode: res.mode,
        });
        queryClient.invalidateQueries({ queryKey: ["client-ai-status"] });
      } else {
        setTestResult({
          ok: false,
          message: res.error || (lang === "ar" ? "❌ تعذر الاتصال بمزود الذكاء الاصطناعي." : "❌ AI connection test failed."),
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err?.message || (lang === "ar" ? "❌ حدث خطأ أثناء فحص الاتصال." : "❌ An error occurred while testing connection."),
      });
    } finally {
      setTesting(false);
    }
  };

  // Save Settings
  const handleSaveSettings = () => {
    updateCompany.mutate(
      {
        data: {
          name: company?.name || "Company",
          aiProvider: selectedProvider,
          aiModel: selectedModel || null,
          aiAgentApiKey: apiKey || null,
          aiExecutionMode: activeMode,
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["client-ai-status"] });
          queryClient.invalidateQueries({ queryKey: ["client-company-quota"] });
          queryClient.invalidateQueries({ queryKey: ["/client/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["client-dashboard"] });
          toast({
            title: lang === "ar" ? "تم حفظ إعدادات الذكاء الاصطناعي" : "AI Settings Saved",
            description: lang === "ar" ? "تم تحديث مزود ونموذج الذكاء الاصطناعي ومفتاح الـ API بنجاح." : "Your AI provider, model, and key have been saved.",
          });
        },
        onError: (err: any) => {
          toast({
            title: lang === "ar" ? "فشل الحفظ" : "Save Failed",
            description: err?.message || (lang === "ar" ? "حدث خطأ أثناء حفظ الإعدادات." : "Could not save AI settings."),
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 w-full pb-12">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const hasOwnKey = Boolean(apiKey || company?.aiAgentApiKey);

  // Model catalog for selected provider
  const allModels = mergeDynamicModels(
    (AI_PROVIDERS[selectedProvider]?.models ?? []) as unknown as Array<{ value: string; label: string; free: boolean }>,
    syncedAiModels?.providers?.[selectedProvider]
  );
  const freeModels = allModels.filter((m) => m.free);
  const paidModels = allModels.filter((m) => !m.free);
  const hasBothTiers = freeModels.length > 0 && paidModels.length > 0;
  const currentIsFree = freeModels.some((m) => m.value === selectedModel);
  const currentIsPaid = paidModels.some((m) => m.value === selectedModel);

  const showQuotaBanner = activeMode === "quota" && quotaData && quotaData.warning !== "none" && quotaData.warning !== "ok";

  return (
    <div className="space-y-8 w-full pb-12">
      {/* ── Header ── */}
      {/* ── Bot Manager Hero Operations Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-microchip text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                {lang === "ar" ? "محرك الذكاء الاصطناعي المركزي" : "AI Intelligence Engine"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "نموذج ومزود الذكاء الاصطناعي" : "AI Model & Provider"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "تحكم في مزود الذكاء الاصطناعي، النموذج الذكي، مفاتيح الـ API، ونمط تشغيل الرموز لشركتك."
                  : "Manage your AI provider, model selection, API credentials, and execution mode."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 0. Active Operating Engine Hero Card (المحرك الفعلي المشغّل للردود) ── */}
      <div className="rounded-2xl border border-[#DCE7FF] dark:border-slate-800 bg-card p-6 shadow-md shadow-[#2D5BE3]/15 space-y-4 border-l-4 border-l-[#2D5BE3]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`p-2.5 rounded-xl ${activeMode === "quota" ? "bg-amber-500/15 text-amber-500" : "bg-blue-500/15 text-blue-500"} shrink-0`}>
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-base text-foreground">
                  {lang === "ar" ? "المحرك الذكي الفعلي المعتمد للمحادثات" : "Currently Operating AI Engine"}
                </span>
                <Badge
                  className={
                    activeMode === "quota"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold"
                      : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-semibold"
                  }
                >
                  {activeMode === "quota"
                    ? (lang === "ar" ? "حصة المنصة (Platform Quota)" : "Admin Quota Mode")
                    : (lang === "ar" ? "رموز ومفتاح API الخاص (Own API Key)" : "Own API Key Mode")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeMode === "quota"
                  ? (lang === "ar"
                      ? "مساعدك الذكي يعمل حالياً بالاعتماد على رصيد حصة المنصة الشهرية المخصص مجاناً من الإدارة."
                      : "Your assistant is actively generating responses using the platform quota without requiring a private API key.")
                  : (lang === "ar"
                      ? "مساعدك الذكي يعمل حالياً بالاعتماد على مفتاح API ونموذج شركتك الخاص دون أي حدود للحصة."
                      : "Your assistant is using your company's own private API credentials without platform quota limits.")}
              </p>
            </div>
          </div>
        </div>

        {/* 3 Metric Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Active Provider */}
          <div className="rounded-lg bg-muted/30 border border-[#DCE7FF] p-3 text-xs space-y-1">
            <span className="text-muted-foreground block text-[11px] font-medium">
              {lang === "ar" ? "المزود المشغّل حالياً:" : "Operating Provider:"}
            </span>
            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <span className="text-base">
                {activeMode === "quota"
                  ? (AI_PROVIDERS[quotaProvider as AiProvider]?.icon || "🟣")
                  : (AI_PROVIDERS[selectedProvider]?.icon || "🤖")}
              </span>
              <span>
                {activeMode === "quota"
                  ? (AI_PROVIDERS[quotaProvider as AiProvider]?.label || quotaProvider.toUpperCase())
                  : (AI_PROVIDERS[selectedProvider]?.label || selectedProvider.toUpperCase())}
              </span>
            </span>
          </div>

          {/* Active Model */}
          <div className="rounded-lg bg-muted/30 border border-[#DCE7FF] p-3 text-xs space-y-1">
            <span className="text-muted-foreground block text-[11px] font-medium">
              {lang === "ar" ? "النموذج الذكي الفعلي:" : "Operating Model:"}
            </span>
            <span className="font-mono font-semibold text-xs text-foreground block truncate">
              {activeMode === "quota" ? quotaModel : (selectedModel || (lang === "ar" ? "النموذج الافتراضي" : "Default Model"))}
            </span>
          </div>

          {/* Balance / Status */}
          <div className="rounded-lg bg-muted/30 border border-[#DCE7FF] p-3 text-xs space-y-1">
            <span className="text-muted-foreground block text-[11px] font-medium">
              {activeMode === "quota" ? (lang === "ar" ? "رصيد الحصة الشهرية:" : "Monthly Token Quota:") : (lang === "ar" ? "حالة المفتاح الخاص:" : "Private API Key:")}
            </span>
            <span className="font-semibold text-xs text-foreground block">
              {activeMode === "quota"
                ? (company?.monthlyTokenQuota && company.monthlyTokenQuota > 0
                    ? `${Number(company.monthlyTokenQuota).toLocaleString()} ${lang === "ar" ? "رمز" : "tokens"}`
                    : (lang === "ar" ? "غير محددة من الإدارة" : "Not allocated yet"))
                : (apiKey || company?.aiAgentApiKey
                    ? (lang === "ar" ? "✓ مسجل ومشفر عبر الخادم" : "✓ Key Configured")
                    : (lang === "ar" ? "⚠️ غير مسجل (مطلوب للرد)" : "⚠️ Key Missing"))}
            </span>
          </div>
        </div>
      </div>

      {/* ── 1. AI Live Status Indicator ── */}
      <div className="space-y-2">
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
            aiStatusLoading
              ? "border-border bg-muted/30"
              : aiStatus?.status === "ok"
              ? "border-emerald-500/40 bg-emerald-500/8"
              : aiStatus?.status === "no_quota" || aiStatus?.status === "no_key" || aiStatus?.status === "no_platform_key"
              ? "border-amber-500/40 bg-amber-500/8"
              : aiStatus?.status === "quota_exceeded"
              ? "border-orange-500/40 bg-orange-500/8"
              : aiStatus?.status === "invalid_key"
              ? "border-red-500/40 bg-red-500/8"
              : aiStatus?.status === "error"
              ? "border-rose-500/40 bg-rose-500/8"
              : "border-border bg-muted/30"
          }`}
        >
          <div className="flex items-center gap-3">
            {aiStatusLoading ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/30 animate-pulse" />
            ) : aiStatus?.status === "ok" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.4)]" />
            ) : (aiStatus?.status as string) === "insufficient_credits" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_2px_rgba(245,158,11,0.3)]" />
            ) : aiStatus?.status === "no_quota" || aiStatus?.status === "no_key" || aiStatus?.status === "no_platform_key" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_2px_rgba(245,158,11,0.3)]" />
            ) : aiStatus?.status === "quota_exceeded" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_6px_2px_rgba(249,115,22,0.3)]" />
            ) : aiStatus?.status === "invalid_key" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.3)]" />
            ) : aiStatus?.status === "error" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_2px_rgba(244,63,94,0.3)]" />
            ) : (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
            )}

            <div className="flex-1 min-w-0">
              <span className="font-semibold block text-foreground">
                {aiStatusLoading ? (
                  lang === "ar" ? "جاري فحص اتصال الذكاء الاصطناعي…" : "Checking AI connection…"
                ) : aiStatus?.status === "ok" ? (
                  activeMode === "quota"
                    ? (lang === "ar" ? "وكيل حصة المنصة متصل وجاهز للعمل" : "Platform Quota AI is connected and ready")
                    : (lang === "ar" ? "مفتاح الـ API الخاص بشركتك متصل ويعمل بنجاح" : "Company API key is connected and working")
                ) : (aiStatus?.status as string) === "insufficient_credits" ? (
                  lang === "ar"
                    ? "رصيد حسابك غير كافٍ لتشغيل هذا النموذج المدفوع (يرجى شحن رصيد OpenRouter)"
                    : "Insufficient credits for this paid model — please top up OpenRouter balance"
                ) : aiStatus?.status === "no_quota" ? (
                  lang === "ar" ? "لم يتم تخصيص حصة رموز لهذه الشركة من قِبل المسؤول حتى الآن" : "No token quota allocated yet by administrator"
                ) : aiStatus?.status === "no_key" ? (
                  lang === "ar" ? "لم يتم إدخال مفتاح API خاص بالشركة" : "No company API key configured"
                ) : aiStatus?.status === "no_platform_key" ? (
                  lang === "ar" ? "لم يقم المسؤول بتهيئة مفتاح وكيل حصص المنصة" : "Platform Quota AI key not configured"
                ) : aiStatus?.status === "quota_exceeded" ? (
                  activeMode === "quota"
                    ? (lang === "ar" ? "تم استهلاك كامل حصة الرموز الشهرية المخصصة لشركتك" : "Monthly token quota fully consumed")
                    : (lang === "ar" ? "تم تجاوز الحصة لمفتاح الـ API الخاص بشركتك" : "Quota exceeded — API rate limit reached")
                ) : aiStatus?.status === "invalid_key" ? (
                  activeMode === "quota"
                    ? (lang === "ar" ? "مفتاح وكيل الحصص في المنصة غير صالح" : "Platform Quota AI key is invalid")
                    : (lang === "ar" ? "مفتاح API الخاص بشركتك غير صالح أو منتهي الصلاحية" : "Invalid API key — authentication failed")
                ) : aiStatus?.status === "error" ? (
                  lang === "ar" ? "تعذر الاتصال بمزود الذكاء الاصطناعي" : "AI connection error"
                ) : (
                  lang === "ar" ? "حالة الذكاء الاصطناعي غير معروفة" : "AI status unknown"
                )}
              </span>

              {!aiStatusLoading && (aiStatus?.model || quotaModel) && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground font-mono break-all leading-relaxed bg-background/50 px-2 py-0.5 rounded border border-[#DCE7FF]">
                    {(aiStatus?.provider || (activeMode === "quota" ? quotaProvider : selectedProvider))} / {aiStatus?.model?.includes("nemotron-nano") ? "nvidia/nemotron-3.5-lightning:free" : (aiStatus?.model || (activeMode === "quota" ? quotaModel : selectedModel))}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                      (aiStatus?.mode || activeMode) === "quota"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                    }`}
                  >
                    {(aiStatus?.mode || activeMode) === "quota"
                      ? (lang === "ar" ? "حصة المنصة" : "Platform Quota")
                      : (lang === "ar" ? "مفتاحك الخاص" : "Own API Key")}
                  </span>
                </div>
              )}

              {aiStatus?.status === "no_quota" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (lang === "ar"
                    ? "المساعد مضبوط على نمط الحصة ولكن لم يتم تخصيص رصيد رموز بعد. يرجى من المسؤول تحديد حصة أو التبديل إلى نمط رموز API الخاصة."
                    : "Chatbot is in Quota mode, but no monthly tokens have been assigned yet. You can switch to API Tokens mode.")}
                </p>
              )}
              {aiStatus?.status === "no_key" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (lang === "ar"
                    ? "نمط العمل محدد على رموز API الخاصة. أدخل مفتاحك في القسم أدناه لتفعيل الردود الذكية."
                    : "Mode is set to API Tokens. Add your API key below to activate auto-responses.")}
                </p>
              )}
              {aiStatus?.status === "quota_exceeded" && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 leading-relaxed">
                  {aiStatus.detail}
                </p>
              )}
              {aiStatus?.status === "invalid_key" && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 leading-relaxed">
                  {aiStatus.detail}
                </p>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 h-7 px-2 text-xs"
            onClick={() => refetchAiStatus()}
            disabled={aiStatusLoading}
          >
            <RotateCcw className={`w-3 h-3 mr-1 ${aiStatusLoading ? "animate-spin" : ""}`} />
            {lang === "ar" ? "إعادة الفحص" : "Recheck"}
          </Button>
        </div>

        {/* Color legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_1px_rgba(16,185,129,0.5)]" />
            {lang === "ar" ? "متصل ويعمل" : "Connected & working"}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_5px_1px_rgba(245,158,11,0.5)]" />
            {lang === "ar" ? "لا توجد حصة / لا يوجد مفتاح" : "No quota / No API Key"}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_5px_1px_rgba(249,115,22,0.5)]" />
            {lang === "ar" ? "تجاوز الحصة" : "Quota exceeded"}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_1px_rgba(239,68,68,0.5)]" />
            {lang === "ar" ? "مفتاح غير صالح أو خطأ" : "Invalid key / Error"}
          </span>
        </div>
      </div>

      {/* ── 2. AI Execution Mode Toggle Switch (Token Source) ── */}
      <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-xl p-5 shadow-md shadow-[#2D5BE3]/15 space-y-4 border-l-4 border-l-[#2D5BE3]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-base text-foreground">
                  {lang === "ar" ? "نمط تشغيل الذكاء الاصطناعي (مصدر الرموز)" : "AI Execution Mode (Token Source)"}
                </span>
                <Badge
                  variant={activeMode === "quota" ? "default" : "outline"}
                  className={
                    activeMode === "quota"
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30 text-xs font-semibold"
                      : "bg-blue-500/15 text-blue-500 border border-blue-500/30 text-xs font-semibold"
                  }
                >
                  {activeMode === "quota"
                    ? (lang === "ar" ? "حصة المنصة (Quota)" : "Admin Quota")
                    : (lang === "ar" ? "رموز API الخاصة (API Tokens)" : "Own API Tokens")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "ar"
                  ? "حدد مصدر الرموز: حصة المنصة الشهرية المخصصة مجاناً من الإدارة، أو مفتاح API الخاص بشركتك دون أي قيود."
                  : "Choose between using platform-provided token quota or your company's own private API key."}
              </p>
            </div>
          </div>

          {/* Switch Component */}
          <div className="flex items-center gap-3 shrink-0 self-start sm:self-center bg-muted/40 border border-[#DCE7FF] rounded-xl px-3.5 py-2">
            <span
              role="button"
              tabIndex={0}
              className={`text-xs select-none cursor-pointer transition-colors ${
                activeMode === "quota" ? "text-amber-500 font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleToggleMode("quota")}
            >
              {lang === "ar" ? "حصة الرموز (Quota)" : "Quota"}
            </span>

            <Switch
              id="ai-execution-mode-switch"
              checked={activeMode === "tokens"}
              disabled={toggleExecutionModeMutation.isPending}
              onCheckedChange={(checked) => handleToggleMode(checked ? "tokens" : "quota")}
            />

            <span
              role="button"
              tabIndex={0}
              className={`text-xs select-none cursor-pointer transition-colors ${
                activeMode === "tokens" ? "text-blue-500 font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => handleToggleMode("tokens")}
            >
              {lang === "ar" ? "رموز الـ API (Tokens)" : "API Tokens"}
            </span>
          </div>
        </div>

        {/* Dual Mode Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Quota Option Card */}
          <div
            onClick={() => handleToggleMode("quota")}
            className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
              activeMode === "quota"
                ? "bg-amber-500/10 border-amber-500/40 text-foreground ring-1 ring-amber-500/30"
                : "bg-muted/20 border-[#DCE7FF] text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Coins className="w-4 h-4 text-amber-500" />
                <span>{lang === "ar" ? "حصة الرموز المخصصة (Platform Quota)" : "Admin Token Quota"}</span>
              </div>
              {activeMode === "quota" && (
                <span className="text-[10px] font-bold text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30">
                  {lang === "ar" ? "الوضع النشط حالياً" : "Active Now"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {company?.monthlyTokenQuota && company.monthlyTokenQuota > 0
                ? (lang === "ar"
                    ? `تم تعيين حصة شهرية قدرها ${Number(company.monthlyTokenQuota).toLocaleString()} رمز مجاناً لشركتك.`
                    : `Assigned ${Number(company.monthlyTokenQuota).toLocaleString()} tokens/mo at no direct provider cost to you.`)
                : (lang === "ar"
                    ? "لم يتم تعيين حصة شهرية لشركتك من قِبل المسؤول حتى الآن."
                    : "No token quota has been allocated by the administrator yet.")}
            </p>
            <div className="mt-2.5 pt-2 border-t border-border/40 font-mono text-[11px] flex items-center justify-between">
              <span className="text-muted-foreground">{lang === "ar" ? "النموذج المعتمد:" : "Assigned Model:"}</span>
              <span className="font-semibold text-foreground">{quotaProvider.toUpperCase()} · {quotaModel}</span>
            </div>
          </div>

          {/* API Tokens Option Card */}
          <div
            onClick={() => handleToggleMode("tokens")}
            className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
              activeMode === "tokens"
                ? "bg-blue-500/10 border-blue-500/40 text-foreground ring-1 ring-blue-500/30"
                : "bg-muted/20 border-[#DCE7FF] text-muted-foreground hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <KeyRound className="w-4 h-4 text-blue-500" />
                <span>{lang === "ar" ? "رموز ومفتاح API الخاص (BYOK)" : "Own API Key & Tokens"}</span>
              </div>
              {activeMode === "tokens" && (
                <span className="text-[10px] font-bold text-blue-500 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/30">
                  {lang === "ar" ? "الوضع النشط حالياً" : "Active Now"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hasOwnKey
                ? (lang === "ar"
                    ? `مفتاح API الخاص بك مسجل (${selectedProvider.toUpperCase()}). تتم المحادثات بحرية دون قيود الحصة.`
                    : `Your private API key is registered (${selectedProvider.toUpperCase()}). Operates without monthly quota limits.`)
                : (lang === "ar"
                    ? "يتطلب إضافة مفتاح API الخاص بك في قسم الإعدادات أدناه."
                    : "Requires configuring your API key in the configuration section below.")}
            </p>
            <div className="mt-2.5 pt-2 border-t border-border/40 font-mono text-[11px] flex items-center justify-between">
              <span className="text-muted-foreground">{lang === "ar" ? "الموديل الخاص:" : "Configured Model:"}</span>
              <span className="font-semibold text-foreground">
                {selectedProvider.toUpperCase()} · {selectedModel || (lang === "ar" ? "الافتراضي" : "Default")}
              </span>
            </div>
          </div>
        </div>

        {/* Quota limit warning */}
        {showQuotaBanner && quotaData && (
          <div
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              quotaData.warning === "exceeded"
                ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
            }`}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-semibold">
                {quotaData.warning === "exceeded"
                  ? (lang === "ar" ? "تم استهلاك كامل حصة الرموز الشهرية" : "Monthly token quota exceeded")
                  : (lang === "ar" ? "اقتربت من استهلاك حصة الرموز الشهرية" : "Approaching monthly token quota")}
              </p>
              <p className="opacity-80 text-xs">
                {lang === "ar"
                  ? `استهلكت ${(quotaData.usedTokens ?? 0).toLocaleString()} من أصل ${(quotaData.quota ?? 0).toLocaleString()} رمز (${quotaData.percentUsed ?? 0}%). يمكنك التبديل إلى نمط رموز API الخاصة لمتابعة الردود.`
                  : `You used ${(quotaData.usedTokens ?? 0).toLocaleString()} of ${(quotaData.quota ?? 0).toLocaleString()} tokens (${quotaData.percentUsed ?? 0}%). Switch to Own API Tokens to continue.`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. AI Provider & Model Configuration Card ── */}
      <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            {lang === "ar" ? "إعدادات مزود ونموذج الذكاء الاصطناعي" : "AI Provider & Model Configuration"}
          </CardTitle>
          <CardDescription>
            {lang === "ar"
              ? "اختر مزود الذكاء الاصطناعي المناسب، حدد النموذج، وأدخل مفتاح API لتشغيل الردود التلقائية."
              : "Choose an AI provider, select the model, and provide your API key for automated responses."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode Context Notice */}
          {activeMode === "quota" ? (
            <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-700 dark:text-amber-400">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {lang === "ar"
                    ? "أنت في نمط حصة المنصة المجانية (Platform Quota Mode)"
                    : "You are currently running on Platform Quota"}
                </p>
                <p className="opacity-90 leading-relaxed">
                  {lang === "ar"
                    ? `يعمل البوت حالياً بالنموذج المخصص مجاناً (${quotaProvider.toUpperCase()} · ${quotaModel}). الإعدادات أدناه تتيح لك تجهيز مفتاح API ونموذج خاص بشركتك (BYOK) في حال أردت التبديل إلى نمط الرموز الخاصة.`
                    : `Your bot is currently powered by the assigned model (${quotaProvider.toUpperCase()} · ${quotaModel}) for free. The settings below allow you to configure your company's own API key & model if you wish to switch to private API tokens mode.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-blue-500/10 border border-blue-500/30 p-3.5 text-xs text-blue-700 dark:text-blue-400">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {lang === "ar"
                    ? "أنت في نمط رموز ومفتاح API الخاص (Own API Key & Tokens)"
                    : "You are currently running on Own API Key & Tokens"}
                </p>
                <p className="opacity-90 leading-relaxed">
                  {lang === "ar"
                    ? "يتطلب هذا النمط اختيار المزود، تحديد النموذج، وإدخال مفتاح الـ API الخاص بشركتك ليتمكن المساعد من إنشاء الردود دون قيود الحصة."
                    : "This mode requires choosing your provider, selecting your preferred model, and providing your private API key."}
                </p>
              </div>
            </div>
          )}

          {/* Step 1: Choose Provider */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === "ar" ? "1. اختر مزود الذكاء الاصطناعي" : "1. Choose AI Provider"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {(Object.entries(AI_PROVIDERS) as [AiProvider, typeof AI_PROVIDERS[AiProvider]][]).map(([key, p]) => {
                const isSelected = selectedProvider === key;
                const models = mergeDynamicModels(
                  p.models as unknown as Array<{ value: string; label: string; free: boolean }>,
                  syncedAiModels?.providers?.[key]
                );
                const freeCount = models.filter((m) => m.free).length;
                const paidCount = models.filter((m) => !m.free).length;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectProvider(key)}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3.5 text-xs font-medium transition-all text-center ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary/30"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <span className="text-2xl">{p.icon}</span>
                    <span className="font-semibold text-sm">{p.label}</span>
                    {freeCount > 0 && paidCount === 0 ? (
                      <span className="text-[10px] text-green-500 font-medium bg-green-500/10 px-1.5 py-0.5 rounded">
                        {lang === "ar" ? "خطة مجانية ✓" : "Free tier ✓"}
                      </span>
                    ) : freeCount > 0 ? (
                      <span className="text-[10px] text-green-500 font-medium bg-green-500/10 px-1.5 py-0.5 rounded">
                        {freeCount} {lang === "ar" ? "نماذج مجانية" : "free models"}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded">
                        {lang === "ar" ? "مدفوع (Pay-as-you-go)" : "Paid"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Provider Notice & Link to obtain key */}
          <div className="flex items-start gap-3 rounded-xl bg-muted/40 border border-[#DCE7FF] p-3.5 text-xs">
            <span className="text-base shrink-0">ℹ️</span>
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                {AI_PROVIDERS[selectedProvider]?.freeTier}
              </p>
              <p className="text-muted-foreground">
                {lang === "ar" ? "احصل على مفتاح الـ API الخاص بك من بوابة المزود: " : "Get your official API key at: "}
                <a
                  href={AI_PROVIDERS[selectedProvider]?.keyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline font-medium inline-flex items-center gap-1"
                >
                  {AI_PROVIDERS[selectedProvider]?.keyLink?.replace("https://", "")}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>

          {/* Step 2: Choose Model */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {lang === "ar" ? "2. اختر النموذج الذكي" : "2. Choose Model"}
              </p>
              <span className="text-[10px] text-muted-foreground font-mono">
                {lang === "ar" ? "تحديث تلقائي" : "Synced"}
                {syncedAiModels?.syncedAt ? ` · ${new Date(syncedAiModels.syncedAt).toLocaleTimeString()}` : ""}
              </span>
            </div>

            {hasBothTiers ? (
              <div className="space-y-3">
                {/* Free models dropdown */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    🆓 {lang === "ar" ? "النماذج المجانية (بدون تكلفة)" : "Free Tier Models"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={currentIsFree && selectedModel ? selectedModel : undefined}
                      onValueChange={(val) => {
                        setSelectedModel(val);
                        setTestResult(null);
                      }}
                    >
                      <SelectTrigger className="bg-background border-green-500/30 focus:ring-green-500/30 flex-1">
                        <SelectValue placeholder={lang === "ar" ? "اختر نموذجاً مجانياً..." : "Select a free model..."} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {freeModels.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            <span className="flex items-center gap-2">
                              {m.label}
                              <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/30 rounded px-1 py-0.5 leading-none">
                                FREE
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentIsFree && (
                      <button
                        type="button"
                        onClick={() => setSelectedModel("")}
                        className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={lang === "ar" ? "إلغاء التحديد" : "Clear selection"}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Paid models dropdown */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                    💳 {lang === "ar" ? "النماذج المدفوعة والمتقدمة" : "Advanced & Paid Models"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={currentIsPaid && selectedModel ? selectedModel : undefined}
                      onValueChange={(val) => {
                        setSelectedModel(val);
                        setTestResult(null);
                      }}
                    >
                      <SelectTrigger className="bg-background flex-1">
                        <SelectValue placeholder={lang === "ar" ? "اختر نموذجاً مدفوعاً..." : "Select a paid model..."} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {paidModels.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentIsPaid && (
                      <button
                        type="button"
                        onClick={() => setSelectedModel("")}
                        className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={lang === "ar" ? "إلغاء التحديد" : "Clear selection"}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <Select
                value={selectedModel || undefined}
                onValueChange={(val) => {
                  setSelectedModel(val);
                  setTestResult(null);
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={lang === "ar" ? "اختر نموذجاً..." : "Select a model..."} />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {allModels.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Step 3: API Key */}
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === "ar" ? "3. مفتاح الـ API الخاص بك" : "3. API Key"}
            </p>

            <div className="rounded-xl border border-border/70 bg-background overflow-hidden">
              <div className="p-4 space-y-1.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    {lang === "ar" ? "السرية والأمان المشفر" : "Encrypted Secrets & Security"}
                  </p>
                  {apiKey && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {lang === "ar" ? "المفتاح مسجل" : "Key Configured"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {lang === "ar"
                    ? `يُحفظ مفتاح ${AI_PROVIDERS[selectedProvider]?.label} بشكل مشفر عبر الخادم ويُستخدم لإنشاء الردود الذكية للمستخدمين دون كشفه إطلاقاً.`
                    : `Your ${AI_PROVIDERS[selectedProvider]?.label} key is stored securely server-side. It is never exposed in browser clients or to end users.`}
                </p>
              </div>

              <div className="border-t border-[#DCE7FF] p-3.5">
                <div className="flex items-center rounded-lg border border-border bg-background overflow-hidden">
                  <div className="px-3 py-2.5 bg-muted/50 border-r border-border shrink-0">
                    <span className="font-mono text-xs text-muted-foreground">
                      {AI_PROVIDERS[selectedProvider]?.keyLabel}
                    </span>
                  </div>
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={AI_PROVIDERS[selectedProvider]?.keyPlaceholder}
                    className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm h-9 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="text-muted-foreground hover:text-foreground p-2 shrink-0 transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <div className="mx-2 w-7 h-7 rounded-md bg-muted/50 border border-border flex items-center justify-center shrink-0">
                    <UserRound className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Test Result */}
          {testResult && (
            <div
              className={`rounded-xl border p-3.5 text-xs transition-all ${
                testResult.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span>{testResult.message}</span>
                {testResult.latencyMs && (
                  <span className="font-mono text-[10px] bg-background/50 px-1.5 py-0.5 rounded border border-current/20">
                    {testResult.latencyMs}ms
                  </span>
                )}
              </div>
              {testResult.model && (
                <div className="mt-1 font-mono text-[11px] opacity-80">
                  {testResult.provider?.toUpperCase()} · {testResult.model} ({testResult.mode || activeMode})
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#DCE7FF]">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing}
              className="w-full sm:w-auto gap-2"
            >
              {testing ? (
                <>
                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full" />
                  {lang === "ar" ? "جاري الاختبار…" : "Testing connection…"}
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-500" />
                  {lang === "ar" ? "اختبار اتصال المزود والنموذج" : "Test AI Connection"}
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={handleSaveSettings}
              disabled={updateCompany.isPending}
              className="w-full sm:w-auto gap-2 px-6"
            >
              {updateCompany.isPending ? (
                <>
                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full" />
                  {lang === "ar" ? "جاري الحفظ…" : "Saving…"}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
