/**
 * QuotaAICard — self-contained card for configuring the Company Quota AI Agent.
 * Configures the platform model & API key used when companies consume their assigned monthly token quota.
 * Completely separate from the Customer Problems (Tickets) Support AI Agent.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Bot, Eye, EyeOff, CheckCircle2, ChevronDown,
  Sparkles, Zap, RotateCcw, Lock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { mergeDynamicModels, type AiModelCatalogResponse } from "@/lib/ai-models";

// ── Model catalog ─────────────────────────────────────────────────────────────
type Tier = "free" | "paid";
interface AIModel    { id: string; label: string; tier: Tier; description: string; contextWindow?: string }
interface AIProvider { id: "openai" | "anthropic" | "google" | "openrouter"; label: string; color: string; bgColor: string; models: AIModel[] }

const PROVIDERS: AIProvider[] = [
  {
    id: "openai", label: "OpenAI", color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/30",
    models: [
      { id: "gpt-4o-mini",    label: "GPT-4o mini",   tier: "free", description: "Fast & affordable, great for most tasks",   contextWindow: "128K" },
      { id: "gpt-3.5-turbo",  label: "GPT-3.5 Turbo", tier: "free", description: "Lightweight, low-latency responses",        contextWindow: "16K"  },
      { id: "o3-mini",        label: "o3-mini",        tier: "free", description: "Fast reasoning model, free tier available", contextWindow: "128K" },
      { id: "gpt-4o",         label: "GPT-4o",         tier: "paid", description: "Most capable multimodal model",             contextWindow: "128K" },
      { id: "gpt-4-turbo",    label: "GPT-4 Turbo",    tier: "paid", description: "Powerful with vision, 128K context",       contextWindow: "128K" },
      { id: "gpt-4",          label: "GPT-4",          tier: "paid", description: "High intelligence, deep reasoning",        contextWindow: "8K"   },
      { id: "o1",             label: "o1",             tier: "paid", description: "Advanced reasoning for complex problems",   contextWindow: "200K" },
      { id: "o1-mini",        label: "o1-mini",        tier: "paid", description: "Faster reasoning, lower cost than o1",     contextWindow: "128K" },
      { id: "o3",             label: "o3",             tier: "paid", description: "Latest frontier reasoning model",          contextWindow: "200K" },
    ],
  },
  {
    id: "anthropic", label: "Anthropic", color: "text-violet-400", bgColor: "bg-violet-500/10 border-violet-500/30",
    models: [
      { id: "claude-3-haiku-20240307",    label: "Claude 3 Haiku",     tier: "free", description: "Fastest Claude, great value",                    contextWindow: "200K" },
      { id: "claude-3-5-haiku-20241022",  label: "Claude 3.5 Haiku",   tier: "free", description: "Improved Haiku, strong performance at low cost",  contextWindow: "200K" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet",  tier: "paid", description: "Best balance of speed and intelligence",          contextWindow: "200K" },
      { id: "claude-3-opus-20240229",     label: "Claude 3 Opus",      tier: "paid", description: "Most powerful Claude, top-tier tasks",            contextWindow: "200K" },
      { id: "claude-3-sonnet-20240229",   label: "Claude 3 Sonnet",    tier: "paid", description: "Balanced performance and speed",                  contextWindow: "200K" },
      { id: "claude-opus-4-5",           label: "Claude Opus 4.5",     tier: "paid", description: "Latest Opus, exceptional reasoning",              contextWindow: "200K" },
      { id: "claude-sonnet-4-5",         label: "Claude Sonnet 4.5",   tier: "paid", description: "Latest Sonnet, strong & fast",                    contextWindow: "200K" },
    ],
  },
  {
    id: "google", label: "Google Gemini", color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30",
    models: [
      { id: "gemini-2.0-flash-lite",    label: "Gemini 2.0 Flash Lite",    tier: "free", description: "Lightest model, free API tier available",    contextWindow: "1M" },
      { id: "gemini-1.5-flash",         label: "Gemini 1.5 Flash",         tier: "free", description: "Fast multimodal model, free tier available", contextWindow: "1M" },
      { id: "gemini-2.0-flash",         label: "Gemini 2.0 Flash",         tier: "free", description: "Next-gen Flash with free tier access",       contextWindow: "1M" },
      { id: "gemini-1.5-pro",           label: "Gemini 1.5 Pro",           tier: "paid", description: "Complex reasoning, 1M token context",        contextWindow: "1M" },
      { id: "gemini-2.5-flash-preview", label: "Gemini 2.5 Flash Preview", tier: "paid", description: "Latest Flash, thinking + tool use",          contextWindow: "1M" },
      { id: "gemini-2.5-pro-preview",   label: "Gemini 2.5 Pro Preview",   tier: "paid", description: "Best Gemini, frontier reasoning",            contextWindow: "1M" },
    ],
  },
  {
    id: "openrouter", label: "OpenRouter", color: "text-pink-400", bgColor: "bg-pink-500/10 border-pink-500/30",
    models: [
      { id: "google/gemini-2.0-flash-exp:free",      label: "Gemini 2.0 Flash (Free)",    tier: "free", description: "Free Gemini 2.0 via OpenRouter — ultra-fast",     contextWindow: "1M"   },
      { id: "meta-llama/llama-3.2-3b-instruct:free",  label: "Llama 3.2 3B (Free)",        tier: "free", description: "Free lightweight Meta model, low latency",        contextWindow: "128K" },
      { id: "deepseek/deepseek-r1:free",             label: "DeepSeek R1 (Free)",         tier: "free", description: "Free frontier reasoning model via OpenRouter",    contextWindow: "64K"  },
      { id: "anthropic/claude-3.5-sonnet",            label: "Claude 3.5 Sonnet",          tier: "paid", description: "Via OpenRouter — balanced speed & intelligence", contextWindow: "200K" },
      { id: "openai/gpt-4o",                          label: "GPT-4o",                     tier: "paid", description: "Via OpenRouter — OpenAI's flagship model",      contextWindow: "128K" },
      { id: "openai/gpt-4o-mini",                     label: "GPT-4o mini",                tier: "paid", description: "Via OpenRouter — affordable GPT-4 class",      contextWindow: "128K" },
      { id: "google/gemini-pro-1.5",                  label: "Gemini Pro 1.5",             tier: "paid", description: "Via OpenRouter — long context, multimodal",     contextWindow: "1M"   },
      { id: "mistralai/mistral-large",                label: "Mistral Large",              tier: "paid", description: "Mistral's flagship, strong reasoning",          contextWindow: "128K" },
      { id: "meta-llama/llama-3.3-70b-instruct",      label: "Llama 3.3 70B Instruct",    tier: "paid", description: "Meta's largest instruction-tuned model",        contextWindow: "128K" },
    ],
  },
];

const PROVIDER_TIER_INFO: Record<string, { freeTier: string; freeTierAr: string; keyLink: string }> = {
  openai: {
    freeTier: "Free trial credits available on sign-up",
    freeTierAr: "رصيد تجريبي مجاني متاح عند التسجيل",
    keyLink: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    freeTier: "Free tier: $5 credit on sign-up",
    freeTierAr: "الخطة المجانية: رصيد بقيمة 5$ عند التسجيل",
    keyLink: "https://console.anthropic.com/settings/keys",
  },
  google: {
    freeTier: "Free tier: Generous free quota (no credit card needed)",
    freeTierAr: "الخطة المجانية: حصة مجانية سخية (بدون الحاجة لبطاقة بنكية)",
    keyLink: "https://aistudio.google.com/app/apikey",
  },
  openrouter: {
    freeTier: "Free models available — no credit card required for free tier",
    freeTierAr: "نماذج مجانية متاحة — لا تتطلب بطاقة بنكية للخطة المجانية",
    keyLink: "https://openrouter.ai/keys",
  },
};

const PROVIDER_KEY_LABELS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  openrouter: "OpenRouter",
};

// ── ModelPicker ───────────────────────────────────────────────────────────────
function ModelPicker({
  selectedProvider, selectedModel, onSelect,
}: { selectedProvider: string; selectedModel: string; onSelect: (provider: string, model: string) => void }) {
  const { lang } = useLanguage();
  const [activeProvider, setActiveProvider] = useState<string>(selectedProvider || "openai");
  const { data: syncedCatalog } = useQuery<AiModelCatalogResponse>({
    queryKey: ["admin-ai-model-catalog"],
    queryFn: () => customFetch("/api/admin/ai-models") as Promise<AiModelCatalogResponse>,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
  const provider   = PROVIDERS.find((p) => p.id === activeProvider) ?? PROVIDERS[0];
  const dynamicModels = syncedCatalog?.providers?.[activeProvider] ?? [];
  const allModels = mergeDynamicModels(
    provider.models.map((model) => ({ value: model.id, label: model.label, free: model.tier === "free" })),
    dynamicModels,
  );
  const freeModels = allModels.filter((m) => m.free);
  const paidModels = allModels.filter((m) => !m.free);
  const isFreeSelected = selectedProvider === activeProvider && freeModels.some((m) => m.value === selectedModel);
  const isPaidSelected = selectedProvider === activeProvider && paidModels.some((m) => m.value === selectedModel);
  const freeValue = isFreeSelected ? selectedModel : "";
  const paidValue = isPaidSelected ? selectedModel : "";
  const selectClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground " +
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 cursor-pointer appearance-none";

  return (
    <div className="space-y-4">
      {/* Provider tabs */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border/50 overflow-x-auto scrollbar-hide">
        {PROVIDERS.map((p) => (
          <button key={p.id} onClick={() => setActiveProvider(p.id)}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
              activeProvider === p.id
                ? "bg-card text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Free tier notice banner */}
      {PROVIDER_TIER_INFO[activeProvider] && (
        <div className="flex items-start gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2.5 animate-in fade-in duration-200">
          <span className="text-green-500 text-sm shrink-0">✓</span>
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-green-600 dark:text-green-400">
              {lang === "ar"
                ? PROVIDER_TIER_INFO[activeProvider].freeTierAr
                : PROVIDER_TIER_INFO[activeProvider].freeTier}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "ar" ? "احصل على مفتاح الـ API المجاني من: " : "Get your free API key at "}
              <a
                href={PROVIDER_TIER_INFO[activeProvider].keyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline font-medium"
              >
                {PROVIDER_TIER_INFO[activeProvider].keyLink.replace("https://", "")}
              </a>
            </p>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Models are synced automatically every hour from the provider API.
        {syncedCatalog?.syncedAt && ` Last synced ${new Date(syncedCatalog.syncedAt).toLocaleString()}.`}
      </p>

      {/* Free Tier */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Free Tier</span>
          {isFreeSelected && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" /> Selected
            </span>
          )}
        </div>
        <div className="relative">
          <select value={freeValue} onChange={(e) => { if (e.target.value) onSelect(activeProvider, e.target.value); }}
            className={`${selectClass} ${isFreeSelected ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
            <option value="">— Select free model —</option>
            {freeModels.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        {isFreeSelected && (
          <p className="text-xs text-muted-foreground px-1">Automatically synced from the provider API.</p>
        )}
      </div>

      {/* Paid Tier */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Paid Tier</span>
          {isPaidSelected && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" /> Selected
            </span>
          )}
        </div>
        <div className="relative">
          <select value={paidValue} onChange={(e) => { if (e.target.value) onSelect(activeProvider, e.target.value); }}
            className={`${selectClass} ${isPaidSelected ? "border-primary/50 bg-primary/5" : ""}`}>
            <option value="">— Select paid model —</option>
            {paidModels.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        {isPaidSelected && (
          <p className="text-xs text-muted-foreground px-1">Automatically synced from the provider API.</p>
        )}
      </div>
    </div>
  );
}

// ── QuotaAICard (exported) ──────────────────────────────────────────────────
type QuotaAiStatus = {
  status: "ok" | "no_key" | "invalid_key" | "quota_exceeded" | "error";
  provider?: string;
  model?: string;
  detail?: string;
};

export default function QuotaAICard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lang } = useLanguage();
  const [showApiKey,       setShowApiKey]       = useState(false);
  const [aiApiKey,         setAiApiKey]         = useState("");
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [selectedModel,    setSelectedModel]    = useState("gpt-4o-mini");
  const [collapsed,        setCollapsed]        = useState(false);

  const { data: aiStatus, isLoading: aiStatusLoading, refetch: refetchAiStatus } =
    useQuery<QuotaAiStatus>({
      queryKey: ["admin-quota-ai-status"],
      queryFn: async () => {
        try {
          return (await customFetch("/api/admin/quota-ai-status")) as QuotaAiStatus;
        } catch (err: any) {
          if (err?.status === 404) {
            return (await customFetch("/api/admin/support-ai-status")) as QuotaAiStatus;
          }
          throw err;
        }
      },
      staleTime: 60 * 1000,
      retry: 1,
    });

  const { data: quotaSettings, isLoading: quotaLoading } = useQuery({
    queryKey: ["admin-quota-ai-settings"],
    queryFn: async () => {
      try {
        return await customFetch("/api/admin/quota-ai-settings");
      } catch (err: any) {
        if (err?.status === 404) {
          return await customFetch("/api/admin/support-settings");
        }
        throw err;
      }
    },
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (quotaSettings) {
      setSelectedProvider((quotaSettings as any).aiProvider ?? "openai");
      setSelectedModel((quotaSettings as any).aiModel ?? "gpt-4o-mini");
    }
  }, [quotaSettings]);

  const saveQuotaAi = useMutation({
    mutationFn: async (payload: { aiApiKey?: string; aiProvider: string; aiModel: string }) => {
      try {
        return await customFetch("/api/admin/quota-ai-settings", {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        if (err?.status === 404) {
          return await customFetch("/api/admin/support-settings", {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-quota-ai-settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-support-settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-usage-cost"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({
        title: lang === "ar" ? "تم حفظ إعدادات الذكاء الاصطناعي بنجاح" : "Support AI settings saved successfully",
      });
      setAiApiKey("");
      refetchAiStatus();
    },
    onError: (err: any) => {
      const errMsg = err?.data?.error || err?.message || (lang === "ar" ? "فشل حفظ الإعدادات" : "Failed to save settings");
      toast({
        title: lang === "ar" ? "فشل حفظ الإعدادات" : "Failed to save settings",
        description: typeof errMsg === "string" ? errMsg : undefined,
        variant: "destructive",
      });
    },
  });

  const isKeyConfigured = !!(quotaSettings as any)?.hasKey || !!aiApiKey.trim();

  const currentModelLabel =
    PROVIDERS.flatMap((p) => p.models).find((m) => m.id === selectedModel)?.label ?? selectedModel;

  const statusPill = aiStatusLoading ? null : aiStatus?.status === "ok" ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_1px_rgba(16,185,129,0.5)]" />
      Active · {currentModelLabel}
    </span>
  ) : aiStatus?.status === "no_key" ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      No API key — configure below
    </span>
  ) : aiStatus?.status === "invalid_key" ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Invalid API key
    </span>
  ) : aiStatus?.status === "quota_exceeded" ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      API quota exceeded
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Error connecting
    </span>
  );

  return (
    <Card className="bg-card border-violet-500/20">
      {/* ── Header ── */}
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-400 shrink-0" />
            <CardTitle className="text-base">Support AI Agent</CardTitle>
            {statusPill && <span className="hidden sm:inline">{statusPill}</span>}
          </div>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
          </button>
        </div>
        {!collapsed && (
          <CardDescription className="mt-1">
            Choose the AI model and API key used when companies with an assigned token quota consume requests.
            {(quotaSettings as any)?.aiModel && (
              <span className="ml-1 text-violet-400 font-medium">· Current model: {currentModelLabel}</span>
            )}
          </CardDescription>
        )}
      </CardHeader>

      {/* ── Expandable body ── */}
      {!collapsed && (
        <CardContent className="space-y-5 pt-0">
          {quotaLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium block">
                  {lang === "ar" ? "مفتاح الـ API" : "API Key"}
                </label>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
                  <div className="border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-between">
                    <p className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> {lang === "ar" ? "السرية والأمان" : "Secrets"}
                    </p>
                    <span className="text-xs text-emerald-500 font-medium">
                      {isKeyConfigured
                        ? (lang === "ar" ? "✓ تم الضبط" : "✓ Configured")
                        : (lang === "ar" ? "— غير مضبوط" : "— Not configured")}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-center rounded-lg border border-emerald-500/20 bg-background overflow-hidden">
                      <div className="px-3 py-2 bg-muted/50 border-r border-border shrink-0">
                        <span className="font-mono text-xs text-muted-foreground uppercase">
                          {PROVIDER_KEY_LABELS[selectedProvider] ?? "API_KEY"}
                        </span>
                      </div>
                      <div className="flex-1 flex items-center pr-2">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder={isKeyConfigured ? "•••••••••••••••••••••••••••••••••••••••••••••••••" : "sk-… / API key"}
                          value={aiApiKey}
                          onChange={(e) => setAiApiKey(e.target.value)}
                          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm h-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {isKeyConfigured ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        {lang === "ar" ? "✓ الردود التلقائية الذكية نشطة باستخدام " : "✓ AI auto-responses are active using "}
                        {PROVIDER_NAMES[selectedProvider] ?? selectedProvider} — {selectedModel || (lang === "ar" ? "النموذج الافتراضي" : "default model")}.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {selectedProvider === "openai"      && "OpenAI key starts with sk-"}
                        {selectedProvider === "anthropic"   && "Anthropic key starts with sk-ant-"}
                        {selectedProvider === "google"      && "Google AI Studio key from aistudio.google.com"}
                        {selectedProvider === "openrouter"  && "OpenRouter key starts with sk-or-v1- · free models available without billing"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Model picker */}
              <div>
                <label className="text-sm font-medium mb-2 block">{lang === "ar" ? "اختر النموذج" : "Select Model"}</label>
                <ModelPicker
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onSelect={(provider, model) => { setSelectedProvider(provider); setSelectedModel(model); }}
                />
              </div>

              {/* Agent Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium block">{lang === "ar" ? "حالة الوكيل" : "Agent Status"}</label>
                <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
                  aiStatusLoading                        ? "border-border bg-muted/30"           :
                  aiStatus?.status === "ok"              ? "border-emerald-500/40 bg-emerald-500/8" :
                  aiStatus?.status === "no_key"          ? "border-amber-500/40 bg-amber-500/8"     :
                  aiStatus?.status === "quota_exceeded"  ? "border-orange-500/40 bg-orange-500/8"   :
                  aiStatus?.status === "invalid_key"     ? "border-red-500/40 bg-red-500/8"         :
                  aiStatus?.status === "error"           ? "border-red-500/40 bg-red-500/8"         :
                  "border-border bg-muted/30"
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {aiStatusLoading ? (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-muted-foreground/30 animate-pulse" />
                    ) : aiStatus?.status === "ok" ? (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.4)]" />
                    ) : aiStatus?.status === "quota_exceeded" ? (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-orange-500" />
                    ) : aiStatus?.status === "invalid_key" ? (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-red-500" />
                    ) : aiStatus?.status === "no_key" ? (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-amber-500" />
                    ) : (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium block">
                        {aiStatusLoading                            ? (lang === "ar" ? "جاري فحص اتصال الذكاء الاصطناعي…" : "Checking AI connection…") :
                         aiStatus?.status === "ok"                 ? (lang === "ar" ? "الذكاء الاصطناعي متصل ويعمل بنجاح" : "AI is connected and working") :
                         aiStatus?.status === "quota_exceeded"     ? (lang === "ar" ? "تم تجاوز الحصة المجانية لمفتاح الـ API" : "Quota exceeded — API rate limit reached") :
                         aiStatus?.status === "invalid_key"        ? (lang === "ar" ? "مفتاح API غير صالح أو منتهي الصلاحية" : "Invalid API key — authentication failed") :
                         aiStatus?.status === "no_key"             ? (lang === "ar" ? "لم يتم إدخال مفتاح API للذكاء الاصطناعي" : "No AI API key configured") :
                         aiStatus?.status === "error"              ? (lang === "ar" ? "خطأ في اتصال الذكاء الاصطناعي" : "AI connection error") :
                         (lang === "ar" ? "حالة الذكاء الاصطناعي غير معروفة" : "Status unknown")}
                      </span>
                      {!aiStatusLoading && (aiStatus?.model || selectedModel) && (
                        <span className="block mt-1 text-[11px] text-muted-foreground font-mono break-all leading-relaxed">
                          {aiStatus?.provider || selectedProvider} / {aiStatus?.model || selectedModel}
                        </span>
                      )}
                      {aiStatus?.status === "quota_exceeded" && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                          {lang === "ar" ? "وصل المفتاح إلى الحد الأقصى للحصة المجانية. يرجى تفعيل الدفع أو استخدام مفتاح جديد أعلاه." : "Your API key has hit its free tier limit. Enable billing or use a new key above."}
                        </p>
                      )}
                      {aiStatus?.status === "invalid_key" && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          {lang === "ar" ? "تم رفض المفتاح من قِبل المزود. يرجى تحديثه أعلاه." : "The saved key was rejected by the provider. Update it above."}
                        </p>
                      )}
                      {aiStatus?.status === "no_key" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          {lang === "ar" ? "أدخل مفتاح API أعلاه لتفعيل نموذج الذكاء الاصطناعي." : "Enter an API key above to activate the AI Agent."}
                        </p>
                      )}
                      {aiStatus?.status === "error" && aiStatus?.detail && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate max-w-xs" title={aiStatus.detail}>
                          {aiStatus.detail}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => refetchAiStatus()}
                    disabled={aiStatusLoading}
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${aiStatusLoading ? "animate-spin" : ""}`} />
                    {lang === "ar" ? "إعادة الفحص" : "Recheck"}
                  </Button>
                </div>

                {/* Color legend */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_1px_rgba(16,185,129,0.5)]" />
                    {lang === "ar" ? "متصل ويعمل" : "Connected & working"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                    {lang === "ar" ? "لا يوجد API Key" : "No API Key"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
                    {lang === "ar" ? "تجاوز الحصة المجانية" : "Quota exceeded"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                    {lang === "ar" ? "مفتاح خاطئ أو منتهي" : "Invalid/expired key"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40" />
                    {lang === "ar" ? "حالة غير معروفة" : "Unknown status"}
                  </span>
                </div>
              </div>

              <Button
                onClick={() =>
                  saveQuotaAi.mutate({
                    ...(aiApiKey.trim() ? { aiApiKey: aiApiKey.trim() } : {}),
                    aiProvider: selectedProvider,
                    aiModel: selectedModel,
                  })
                }
                disabled={saveQuotaAi.isPending}
                className="w-full"
              >
                {saveQuotaAi.isPending ? "Saving…" : "Save Support AI Settings"}
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
