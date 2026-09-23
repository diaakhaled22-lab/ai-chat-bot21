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
  Sparkles, Zap, RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
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

// ── ModelPicker ───────────────────────────────────────────────────────────────
function ModelPicker({
  selectedProvider, selectedModel, onSelect,
}: { selectedProvider: string; selectedModel: string; onSelect: (provider: string, model: string) => void }) {
  const [activeProvider, setActiveProvider] = useState<string>(selectedProvider || "openai");

  useEffect(() => {
    if (selectedProvider) {
      setActiveProvider(selectedProvider);
    }
  }, [selectedProvider]);

  const { data: syncedCatalog } = useQuery<AiModelCatalogResponse>({
    queryKey: ["admin-ai-model-catalog"],
    queryFn: () => customFetch("/api/admin/ai-models") as Promise<AiModelCatalogResponse>,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  const provider = PROVIDERS.find((p) => p.id === activeProvider) ?? PROVIDERS[0];
  const dynamicModels = syncedCatalog?.providers?.[activeProvider] ?? [];
  const allModels = mergeDynamicModels(
    provider.models.map((model) => ({ value: model.id, label: model.label, free: model.tier === "free" })),
    dynamicModels,
  );
  const freeModels = allModels.filter((m) => m.free);
  const paidModels = allModels.filter((m) => !m.free);

  const selectedModelInfo =
    selectedProvider === activeProvider
      ? allModels.find((m) => m.value === selectedModel) ?? { value: selectedModel, label: selectedModel, free: false }
      : null;

  return (
    <div className="space-y-3">
      {/* Provider tabs */}
      <div className="flex gap-1.5 p-1 rounded-lg bg-muted/40 border border-border/50 flex-wrap">
        {PROVIDERS.map((p) => {
          const isActive = p.id === activeProvider;
          const isSelected = p.id === selectedProvider;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProvider(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? "bg-background text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-violet-400" : "bg-muted-foreground/40"}`} />
              {p.label}
              {isSelected && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-violet-500/20 text-violet-300 font-normal">active</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Model dropdown menu separating Free and Paid */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {activeProvider.toUpperCase()} Models ({allModels.length})
          </span>
          {selectedModelInfo && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                selectedModelInfo.free
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-violet-500/15 text-violet-400 border border-violet-500/30"
              }`}
            >
              {selectedModelInfo.free ? <Zap className="w-3 h-3 text-emerald-400" /> : <Sparkles className="w-3 h-3 text-violet-400" />}
              {selectedModelInfo.free ? "Free Tier / مجاني" : "Paid Tier / مدفوع"}
            </span>
          )}
        </div>

        <Select
          value={selectedProvider === activeProvider ? selectedModel : ""}
          onValueChange={(modelValue) => onSelect(activeProvider, modelValue)}
        >
          <SelectTrigger className="w-full bg-background border-border h-10 px-3 text-xs sm:text-sm">
            <SelectValue placeholder="— Select Model / اختيار النموذج —">
              {selectedModelInfo ? (
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase shrink-0 ${
                      selectedModelInfo.free
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                    }`}
                  >
                    {selectedModelInfo.free ? "Free" : "Paid"}
                  </span>
                  <span className="font-medium text-foreground truncate">{selectedModelInfo.label}</span>
                  <span className="text-[11px] text-muted-foreground font-mono truncate hidden sm:inline">
                    ({selectedModelInfo.value})
                  </span>
                </span>
              ) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[320px]">
            {freeModels.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 px-2 py-1.5 bg-emerald-500/10 rounded-sm mb-1">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Free Models (النماذج المجانية)
                </SelectLabel>
                {freeModels.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="cursor-pointer py-2">
                    <div className="flex items-center justify-between w-full gap-3">
                      <span className="font-medium text-foreground">{m.label}</span>
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {m.value}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {freeModels.length > 0 && paidModels.length > 0 && (
              <SelectSeparator className="my-1.5 bg-border/60" />
            )}

            {paidModels.length > 0 && (
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5 text-xs font-bold text-violet-400 px-2 py-1.5 bg-violet-500/10 rounded-sm mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  Paid / Pro Models (النماذج المدفوعة)
                </SelectLabel>
                {paidModels.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="cursor-pointer py-2">
                    <div className="flex items-center justify-between w-full gap-3">
                      <span className="font-medium text-foreground">{m.label}</span>
                      <span className="text-[10px] text-violet-300 font-mono bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">
                        {m.value}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        <p className="text-[11px] text-muted-foreground flex items-center justify-between pt-0.5">
          <span>Models are synced automatically from the provider API.</span>
          {syncedCatalog?.syncedAt && (
            <span>
              Last synced{" "}
              {new Date(syncedCatalog.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </p>
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
      queryFn:  () => customFetch("/api/admin/quota-ai-status") as Promise<QuotaAiStatus>,
      staleTime: 0,
    });

  const { data: quotaSettings, isLoading: quotaLoading } = useQuery({
    queryKey: ["admin-quota-ai-settings"],
    queryFn:  () => customFetch("/api/admin/quota-ai-settings"),
  });

  useEffect(() => {
    if (quotaSettings) {
      setSelectedProvider((quotaSettings as any).aiProvider ?? "openai");
      setSelectedModel((quotaSettings as any).aiModel ?? "gpt-4o-mini");
    }
  }, [quotaSettings]);

  // Auto-collapse once confirmed working
  useEffect(() => {
    if (aiStatus?.status === "ok") setCollapsed(true);
  }, [aiStatus?.status]);

  const saveQuotaAi = useMutation({
    mutationFn: (payload: { aiApiKey?: string; aiProvider: string; aiModel: string }) =>
      customFetch("/api/admin/quota-ai-settings", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-quota-ai-settings"] });
      toast({ title: "Company Quota AI settings saved" });
      setAiApiKey("");
      refetchAiStatus();
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

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
              <div>
                <label className="text-sm font-medium mb-1.5 block">Platform API Key</label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    placeholder={(quotaSettings as any)?.hasKey ? "Enter new key to replace…" : "sk-… / API key"}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    className="bg-background pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedProvider === "openai"      && "OpenAI key starts with sk-"}
                  {selectedProvider === "anthropic"   && "Anthropic key starts with sk-ant-"}
                  {selectedProvider === "google"      && "Google AI Studio key from aistudio.google.com"}
                  {selectedProvider === "openrouter"  && "OpenRouter key starts with sk-or-v1- · free models available without billing"}
                </p>
              </div>

              {/* Model picker */}
              <div>
                <label className="text-sm font-medium mb-2 block">Select Measurement Model (اختيار نموذج القياس)</label>
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
                    <div className="min-w-0">
                      <span className="font-medium">
                        {aiStatusLoading                            ? (lang === "ar" ? "جاري فحص اتصال الذكاء الاصطناعي…" : "Checking AI connection…") :
                         aiStatus?.status === "ok"                 ? (lang === "ar" ? "الذكاء الاصطناعي متصل ويعمل بنجاح" : "AI is connected and working") :
                         aiStatus?.status === "quota_exceeded"     ? (lang === "ar" ? "تم تجاوز الحصة المجانية لمفتاح الـ API" : "Quota exceeded — API rate limit reached") :
                         aiStatus?.status === "invalid_key"        ? (lang === "ar" ? "مفتاح API غير صالح أو منتهي الصلاحية" : "Invalid API key — authentication failed") :
                         aiStatus?.status === "no_key"             ? (lang === "ar" ? "لم يتم إدخال مفتاح API للذكاء الاصطناعي" : "No AI API key configured") :
                         aiStatus?.status === "error"              ? (lang === "ar" ? "خطأ في اتصال الذكاء الاصطناعي" : "AI connection error") :
                         (lang === "ar" ? "حالة الذكاء الاصطناعي غير معروفة" : "Status unknown")}
                      </span>
                      {!aiStatusLoading && (aiStatus?.model || selectedModel) && (
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
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
                          {lang === "ar" ? "تم رفض المفتاح من قِبل المزود. يرجى تحديثه أعلاه." : "The API key saved is rejected by the AI provider. Update it above."}
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

              {/* Save button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() =>
                    saveQuotaAi.mutate({
                      ...(aiApiKey.trim() ? { aiApiKey: aiApiKey.trim() } : {}),
                      aiProvider: selectedProvider,
                      aiModel:    selectedModel,
                    })
                  }
                  disabled={saveQuotaAi.isPending}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs px-4"
                >
                  {saveQuotaAi.isPending ? "Saving…" : "Save Quota AI Settings"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
