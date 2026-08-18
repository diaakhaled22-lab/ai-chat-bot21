/**
 * SupportAICard — self-contained card for configuring the Support AI agent.
 * Renders the provider / model picker, API key input, live status indicator,
 * and a Save button. Used on the Customer Problems (Tickets) page.
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
      { id: "gemini-2.5-pro",           label: "Gemini 2.5 Pro",           tier: "paid", description: "Advanced reasoning model",                     contextWindow: "1M" },
      { id: "gemini-3.7-flash",         label: "Gemini 3.7 Flash",         tier: "paid", description: "Fast frontier model for production workloads", contextWindow: "1M" },
      { id: "gemini-3.6-flash",         label: "Gemini 3.6 Flash",         tier: "paid", description: "Fast, capable general-purpose model",          contextWindow: "1M" },
      { id: "gemini-3.5-flash",         label: "Gemini 3.5 Flash",         tier: "paid", description: "Fast, capable general-purpose model",          contextWindow: "1M" },
      { id: "gemini-3.1-pro",           label: "Gemini 3.1 Pro",           tier: "paid", description: "Advanced reasoning for complex tasks",         contextWindow: "1M" },
      { id: "gemini-3.1-flash-lite",    label: "Gemini 3.1 Flash-Lite",    tier: "paid", description: "Lightweight Flash model for efficient usage",    contextWindow: "1M" },
      { id: "gemini-3.5-flash-lite",    label: "Gemini 3.5 Flash-Lite",    tier: "paid", description: "Lightweight Flash model for efficient usage",    contextWindow: "1M" },
    ],
  },
  {
    id: "openrouter", label: "OpenRouter", color: "text-purple-400", bgColor: "bg-purple-500/10 border-purple-500/30",
    models: [
      { id: "google/gemma-4-31b-it:free",             label: "Google Gemma 4 31B ⭐",      tier: "free", description: "Recommended free model, strong general tasks",   contextWindow: "256K" },
      { id: "openai/gpt-oss-20b:free",                label: "OpenAI OSS 20B",             tier: "free", description: "OpenAI open-weight model, free via OpenRouter",  contextWindow: "128K" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "NVIDIA Nemotron Super 120B", tier: "free", description: "Large NVIDIA model, strong reasoning",           contextWindow: "1M"   },
      { id: "nvidia/nemotron-nano-9b-v2:free",        label: "NVIDIA Nemotron Nano 9B",    tier: "free", description: "Lightweight NVIDIA model, fast responses",       contextWindow: "128K" },
      { id: "deepseek/deepseek-v4-flash",             label: "DeepSeek V4 Flash ⭐",       tier: "paid", description: "Fast & affordable, great quality-to-cost ratio", contextWindow: "128K" },
      { id: "deepseek/deepseek-r1",                   label: "DeepSeek R1",                tier: "paid", description: "Full reasoning model, higher rate limits",       contextWindow: "128K" },
      { id: "deepseek/deepseek-v3",                   label: "DeepSeek V3",                tier: "paid", description: "Top-tier open-weight model",                    contextWindow: "128K" },
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
  const provider   = PROVIDERS.find((p) => p.id === activeProvider) ?? PROVIDERS[0];
  const freeModels = provider.models.filter((m) => m.tier === "free");
  const paidModels = provider.models.filter((m) => m.tier === "paid");
  const isFreeSelected = selectedProvider === activeProvider && freeModels.some((m) => m.id === selectedModel);
  const isPaidSelected = selectedProvider === activeProvider && paidModels.some((m) => m.id === selectedModel);
  const freeValue = isFreeSelected ? selectedModel : "";
  const paidValue = isPaidSelected ? selectedModel : "";
  const selectClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground " +
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 cursor-pointer appearance-none";

  return (
    <div className="space-y-4">
      {/* Provider tabs */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border/50">
        {PROVIDERS.map((p) => (
          <button key={p.id} onClick={() => setActiveProvider(p.id)}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all ${
              activeProvider === p.id
                ? "bg-card text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            {p.label}
          </button>
        ))}
      </div>

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
              <option key={m.id} value={m.id}>{m.label}{m.contextWindow ? ` · ${m.contextWindow}` : ""}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        {isFreeSelected && (
          <p className="text-xs text-muted-foreground px-1">{freeModels.find((m) => m.id === selectedModel)?.description}</p>
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
              <option key={m.id} value={m.id}>{m.label}{m.contextWindow ? ` · ${m.contextWindow}` : ""}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        {isPaidSelected && (
          <p className="text-xs text-muted-foreground px-1">{paidModels.find((m) => m.id === selectedModel)?.description}</p>
        )}
      </div>
    </div>
  );
}

// ── SupportAICard (exported) ──────────────────────────────────────────────────
type SupportAiStatus = {
  status: "ok" | "no_key" | "invalid_key" | "quota_exceeded" | "error";
  provider?: string;
  model?: string;
  detail?: string;
};

export default function SupportAICard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showApiKey,       setShowApiKey]       = useState(false);
  const [aiApiKey,         setAiApiKey]         = useState("");
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [selectedModel,    setSelectedModel]    = useState("gpt-4o-mini");
  const [collapsed,        setCollapsed]        = useState(false);

  const { data: aiStatus, isLoading: aiStatusLoading, refetch: refetchAiStatus } =
    useQuery<SupportAiStatus>({
      queryKey: ["admin-support-ai-status"],
      queryFn:  () => customFetch("/api/admin/support-ai-status") as Promise<SupportAiStatus>,
      staleTime: 0,
    });

  const { data: supportSettings, isLoading: supportLoading } = useQuery({
    queryKey: ["admin-support-settings"],
    queryFn:  () => customFetch("/api/admin/support-settings"),
  });

  useEffect(() => {
    if (supportSettings) {
      setSelectedProvider((supportSettings as any).aiProvider ?? "openai");
      setSelectedModel((supportSettings as any).aiModel ?? "gpt-4o-mini");
    }
  }, [supportSettings]);

  // Auto-collapse once the agent is confirmed working
  useEffect(() => {
    if (aiStatus?.status === "ok") setCollapsed(true);
  }, [aiStatus?.status]);

  const saveSupport = useMutation({
    mutationFn: (payload: { aiApiKey?: string; aiProvider: string; aiModel: string }) =>
      customFetch("/api/admin/support-settings", { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-support-settings"] });
      toast({ title: "Support AI settings saved" });
      setAiApiKey("");
      refetchAiStatus();
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const currentModelLabel =
    PROVIDERS.flatMap((p) => p.models).find((m) => m.id === selectedModel)?.label ?? selectedModel;

  // ── Status pill summary (shown in collapsed header) ──────────────────────
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
      Invalid key
    </span>
  ) : aiStatus?.status === "quota_exceeded" ? (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
      Quota exceeded
    </span>
  ) : null;

  return (
    <Card className="bg-card border-violet-500/20">
      {/* ── Header (always visible, click to expand/collapse) ── */}
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
            Choose the AI model and API key used when the <strong>AI Agent</strong> button generates a solution for a customer problem.
            {(supportSettings as any)?.aiModel && (
              <span className="ml-1 text-violet-400 font-medium">· Current model: {currentModelLabel}</span>
            )}
          </CardDescription>
        )}
      </CardHeader>

      {/* ── Expandable body ── */}
      {!collapsed && (
        <CardContent className="space-y-5 pt-0">
          {supportLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {/* API Key */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">API Key</label>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    placeholder={(supportSettings as any)?.hasKey ? "Enter new key to replace…" : "sk-… / API key"}
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
                <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
                  aiStatusLoading                        ? "border-border bg-muted/30"           :
                  aiStatus?.status === "ok"              ? "border-emerald-500/40 bg-emerald-500/[.08]" :
                  aiStatus?.status === "no_key"          ? "border-amber-500/40 bg-amber-500/[.08]"     :
                  aiStatus?.status === "quota_exceeded"  ? "border-orange-500/40 bg-orange-500/[.08]"   :
                  aiStatus?.status === "invalid_key"     ? "border-red-500/40 bg-red-500/[.08]"         :
                  aiStatus?.status === "error"           ? "border-red-500/40 bg-red-500/[.08]"         :
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
                    ) : aiStatus?.status === "error" ? (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-red-500" />
                    ) : (
                      <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                    )}
                    <div className="min-w-0">
                      <span className="font-medium">
                        {aiStatusLoading                            ? "Checking AI agent…"                        :
                         aiStatus?.status === "ok"                 ? "Agent is connected and working"            :
                         aiStatus?.status === "quota_exceeded"     ? "Quota exceeded — rate limit reached"       :
                         aiStatus?.status === "invalid_key"        ? "Invalid API key — authentication failed"   :
                         aiStatus?.status === "no_key"             ? "No API key configured"                     :
                         aiStatus?.status === "error"              ? "Connection error"                          :
                         "Status unknown"}
                      </span>
                      {!aiStatusLoading && aiStatus?.model && (
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {aiStatus.provider} / {aiStatus.model}
                        </span>
                      )}
                      {aiStatus?.status === "quota_exceeded" && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                          API rate limit hit. Check billing or switch to a model with higher quota.
                        </p>
                      )}
                      {aiStatus?.status === "invalid_key" && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          The saved key was rejected by the provider. Update it above.
                        </p>
                      )}
                      {aiStatus?.status === "no_key" && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          Enter an API key above to enable the AI Agent button.
                        </p>
                      )}
                      {aiStatus?.status === "error" && aiStatus.detail && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate max-w-xs" title={aiStatus.detail}>
                          {aiStatus.detail}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); refetchAiStatus(); }}
                    disabled={aiStatusLoading}
                    className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3 h-3 ${aiStatusLoading ? "animate-spin" : ""}`} />
                    Recheck
                  </button>
                </div>
              </div>

              <Button
                onClick={() =>
                  saveSupport.mutate({
                    ...(aiApiKey.trim() ? { aiApiKey: aiApiKey.trim() } : {}),
                    aiProvider: selectedProvider,
                    aiModel: selectedModel,
                  })
                }
                disabled={saveSupport.isPending}
                className="w-full"
              >
                {saveSupport.isPending ? "Saving…" : "Save Support AI Settings"}
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
