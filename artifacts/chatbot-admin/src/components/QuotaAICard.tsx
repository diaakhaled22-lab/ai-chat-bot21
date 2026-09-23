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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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

      {/* Model cards */}
      <div className="space-y-3">
        {freeModels.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Free Tier Available
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {freeModels.map((m) => {
                const isCurrent = selectedProvider === activeProvider && selectedModel === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => onSelect(activeProvider, m.value)}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all relative ${
                      isCurrent
                        ? "border-violet-500 bg-violet-500/10 shadow-sm shadow-violet-500/10"
                        : "border-border/50 bg-card hover:border-border hover:bg-muted/30"
                    }`}
                  >
                    {isCurrent && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 absolute top-2 right-2" />
                    )}
                    <div className="font-semibold text-foreground pr-4 truncate">{m.label}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">{m.value}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {paidModels.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Paid / Pro Models
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {paidModels.map((m) => {
                const isCurrent = selectedProvider === activeProvider && selectedModel === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => onSelect(activeProvider, m.value)}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all relative ${
                      isCurrent
                        ? "border-violet-500 bg-violet-500/10 shadow-sm shadow-violet-500/10"
                        : "border-border/50 bg-card hover:border-border hover:bg-muted/30"
                    }`}
                  >
                    {isCurrent && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 absolute top-2 right-2" />
                    )}
                    <div className="font-semibold text-foreground pr-4 truncate">{m.label}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">{m.value}</div>
                  </button>
                );
              })}
            </div>
          </div>
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
                <label className="text-sm font-medium mb-2 block">Select Model</label>
                <ModelPicker
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onSelect={(provider, model) => { setSelectedProvider(provider); setSelectedModel(model); }}
                />
              </div>

              {/* Agent Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium block">Agent Status</label>
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20 text-xs">
                  <div className="flex items-center gap-2">
                    {statusPill}
                    {aiStatus?.detail && (
                      <span className="text-muted-foreground text-[11px] truncate max-w-xs">{aiStatus.detail}</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground gap-1.5"
                    onClick={() => refetchAiStatus()}
                    disabled={aiStatusLoading}
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${aiStatusLoading ? "animate-spin" : ""}`} />
                    Test Key
                  </Button>
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
