import { useState, useRef } from "react";
import {
  CheckCircle2, XCircle, Loader2, Zap, Leaf, Eye, EyeOff,
  Play, RotateCcw, ChevronDown, ChevronUp, Clock, Key, Bot, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation } from "@tanstack/react-query";

// ── Model catalog ──────────────────────────────────────────────────────────
type Tier = "free" | "paid";
interface AIModel { id: string; label: string; tier: Tier; description: string; contextWindow?: string; }
interface AIProvider { id: string; label: string; color: string; tabActive: string; keyHint: string; models: AIModel[]; }

const PROVIDERS: AIProvider[] = [
  {
    id: "openai", label: "OpenAI",
    color: "text-emerald-400", tabActive: "border-emerald-400 text-emerald-400",
    keyHint: "sk-…",
    models: [
      { id: "gpt-4o-mini",   label: "GPT-4o mini",   tier: "free", description: "Fast & affordable",         contextWindow: "128K" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo",  tier: "free", description: "Lightweight, low-latency", contextWindow: "16K"  },
      { id: "gpt-4o",        label: "GPT-4o",          tier: "paid", description: "Most capable multimodal",  contextWindow: "128K" },
      { id: "gpt-4-turbo",   label: "GPT-4 Turbo",     tier: "paid", description: "Powerful + vision",        contextWindow: "128K" },
      { id: "o3-mini",       label: "o3-mini",          tier: "paid", description: "Fast reasoning model",     contextWindow: "128K" },
      { id: "o1-mini",       label: "o1-mini",          tier: "paid", description: "Reasoning, lower cost",    contextWindow: "128K" },
      { id: "o1",            label: "o1",               tier: "paid", description: "Advanced reasoning",       contextWindow: "200K" },
    ],
  },
  {
    id: "anthropic", label: "Anthropic",
    color: "text-orange-400", tabActive: "border-orange-400 text-orange-400",
    keyHint: "sk-ant-…",
    models: [
      { id: "claude-3-haiku-20240307",    label: "Claude 3 Haiku",    tier: "free", description: "Fastest Claude",            contextWindow: "200K" },
      { id: "claude-3-5-haiku-20241022",  label: "Claude 3.5 Haiku",  tier: "free", description: "Improved Haiku",            contextWindow: "200K" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", tier: "paid", description: "Speed + intelligence",      contextWindow: "200K" },
      { id: "claude-3-opus-20240229",     label: "Claude 3 Opus",     tier: "paid", description: "Most powerful Claude",      contextWindow: "200K" },
      { id: "claude-sonnet-4-5",          label: "Claude Sonnet 4.5", tier: "paid", description: "Latest Sonnet, strong",     contextWindow: "200K" },
      { id: "claude-opus-4-5",            label: "Claude Opus 4.5",   tier: "paid", description: "Latest Opus, exceptional",  contextWindow: "200K" },
    ],
  },
  {
    id: "google", label: "Google Gemini",
    color: "text-blue-400", tabActive: "border-blue-400 text-blue-400",
    keyHint: "AIza… (aistudio.google.com)",
    models: [
      { id: "gemini-2.0-flash-lite",    label: "Gemini 2.0 Flash Lite",    tier: "free", description: "Lightest, free tier",    contextWindow: "1M" },
      { id: "gemini-1.5-flash",         label: "Gemini 1.5 Flash",         tier: "free", description: "Fast multimodal",        contextWindow: "1M" },
      { id: "gemini-2.0-flash",         label: "Gemini 2.0 Flash",         tier: "free", description: "Next-gen Flash",         contextWindow: "1M" },
      { id: "gemini-1.5-pro",           label: "Gemini 1.5 Pro",           tier: "paid", description: "Complex reasoning",      contextWindow: "1M" },
      { id: "gemini-2.5-flash-preview", label: "Gemini 2.5 Flash Preview", tier: "paid", description: "Thinking + tool use",   contextWindow: "1M" },
      { id: "gemini-2.5-pro-preview",   label: "Gemini 2.5 Pro Preview",   tier: "paid", description: "Best Gemini, frontier", contextWindow: "1M" },
      { id: "gemini-2.5-pro",           label: "Gemini 2.5 Pro",           tier: "paid", description: "Advanced reasoning model", contextWindow: "1M" },
    ],
  },
  {
    id: "openrouter", label: "OpenRouter",
    color: "text-purple-400", tabActive: "border-purple-400 text-purple-400",
    keyHint: "sk-or-v1-…",
    models: [
      { id: "google/gemma-4-31b-it:free",             label: "Google Gemma 4 31B ⭐",     tier: "free", description: "Recommended free model",   contextWindow: "256K" },
      { id: "openai/gpt-oss-20b:free",                label: "OpenAI OSS 20B",             tier: "free", description: "OpenAI open-weight",       contextWindow: "128K" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "NVIDIA Nemotron Super 120B", tier: "free", description: "Large NVIDIA model",       contextWindow: "1M"   },
      { id: "nvidia/nemotron-nano-9b-v2:free",        label: "NVIDIA Nemotron Nano 9B",    tier: "free", description: "Lightweight & fast",       contextWindow: "128K" },
      { id: "deepseek/deepseek-v4-flash",             label: "DeepSeek V4 Flash ⭐",       tier: "paid", description: "Fast, great quality/cost", contextWindow: "128K" },
      { id: "deepseek/deepseek-r1",                   label: "DeepSeek R1",                tier: "paid", description: "Full reasoning model",     contextWindow: "128K" },
      { id: "deepseek/deepseek-v3",                   label: "DeepSeek V3",                tier: "paid", description: "Top-tier open-weight",     contextWindow: "128K" },
      { id: "anthropic/claude-3.5-sonnet",            label: "Claude 3.5 Sonnet",          tier: "paid", description: "Via OpenRouter",           contextWindow: "200K" },
      { id: "openai/gpt-4o",                          label: "GPT-4o",                     tier: "paid", description: "Via OpenRouter",           contextWindow: "128K" },
      { id: "mistralai/mistral-large",                label: "Mistral Large",              tier: "paid", description: "Mistral's flagship",       contextWindow: "128K" },
      { id: "meta-llama/llama-3.3-70b-instruct",      label: "Llama 3.3 70B Instruct",     tier: "paid", description: "Meta's largest model",     contextWindow: "128K" },
    ],
  },
];

type TestStatus = "idle" | "loading" | "ok" | "error";
interface TestResult { status: TestStatus; response?: string; latencyMs?: number; error?: string; }

// ── Model card ──────────────────────────────────────────────────────────────
function ModelCard({ model, result, onTest, disabled }: {
  model: AIModel; result?: TestResult; onTest: () => void; disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = result?.status === "loading";
  const isOk     = result?.status === "ok";
  const isErr    = result?.status === "error";

  return (
    <div className={`rounded-lg border p-3 transition-colors ${
      isOk  ? "border-emerald-500/30 bg-emerald-500/5" :
      isErr ? "border-red-500/30 bg-red-500/5" :
              "border-border bg-card/60"
    }`}>
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div className="shrink-0 w-5 flex justify-center">
          {isLoading ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" /> :
           isOk      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
           isErr     ? <XCircle className="w-4 h-4 text-red-400" /> :
                       <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{model.label}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${
              model.tier === "free"
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                : "border-amber-500/40 text-amber-400 bg-amber-500/5"
            }`}>
              {model.tier === "free" ? "FREE" : "PAID"}
            </Badge>
            {model.contextWindow && (
              <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                {model.contextWindow}
              </span>
            )}
            {isOk && result?.latencyMs !== undefined && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" /> {result.latencyMs}ms
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{model.id}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{model.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {(isOk || isErr) && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              title={expanded ? "Collapse" : "Expand response"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            disabled={disabled || isLoading}
            className="h-7 text-xs px-3"
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
          </Button>
        </div>
      </div>

      {/* Response / error */}
      {expanded && (isOk || isErr) && (
        <div className={`mt-3 text-xs rounded-md p-3 whitespace-pre-wrap leading-relaxed border ${
          isOk
            ? "bg-emerald-500/5 text-foreground border-emerald-500/20"
            : "bg-red-500/5 text-red-300 border-red-500/20"
        }`}>
          {isOk ? result?.response : `Error: ${result?.error}`}
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function AdminAITester() {
  const { toast } = useToast();
  const [activeProvider, setActiveProvider] = useState("openai");
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey]             = useState<Record<string, boolean>>({});
  const [testMessage, setTestMessage]     = useState("Hello! Please introduce yourself in one sentence.");
  const [results, setResults]             = useState<Record<string, TestResult>>({});
  const [testingAll, setTestingAll]       = useState(false);
  const abortRef = useRef(false);

  // Load saved keys
  const { data: savedKeys, refetch: refetchKeys } =
    useQuery<Record<string, { hasKey: boolean; maskedKey: string }>>({
      queryKey: ["admin-ai-keys"],
      queryFn: () => customFetch("/api/admin/ai-keys") as Promise<Record<string, { hasKey: boolean; maskedKey: string }>>,
    });

  const saveKeyMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      customFetch("/api/admin/ai-keys", { method: "PUT", body: JSON.stringify({ provider, apiKey }) }),
    onSuccess: (_, { provider }) => {
      refetchKeys();
      setApiKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      toast({ title: "API key saved" });
    },
    onError: () => toast({ title: "Failed to save key", variant: "destructive" }),
  });

  const provider = PROVIDERS.find((p) => p.id === activeProvider)!;
  const freeModels = provider.models.filter((m) => m.tier === "free");
  const paidModels = provider.models.filter((m) => m.tier === "paid");

  async function testModel(modelId: string, providerId: string) {
    setResults((prev) => ({ ...prev, [modelId]: { status: "loading" } }));
    try {
      const data = await customFetch("/api/admin/ai-test", {
        method: "POST",
        body: JSON.stringify({
          provider: providerId,
          model: modelId,
          apiKey: apiKeyInputs[providerId]?.trim() || undefined,
          message: testMessage,
        }),
      }) as any;
      setResults((prev) => ({
        ...prev,
        [modelId]: { status: "ok", response: data.response, latencyMs: data.latencyMs },
      }));
    } catch (err: any) {
      setResults((prev) => ({
        ...prev,
        [modelId]: { status: "error", error: err?.message ?? "Request failed" },
      }));
    }
  }

  async function testAll() {
    setTestingAll(true);
    abortRef.current = false;
    for (const model of provider.models) {
      if (abortRef.current) break;
      await testModel(model.id, activeProvider);
    }
    setTestingAll(false);
    toast({ title: `Done — tested ${provider.models.length} models for ${provider.label}` });
  }

  function stopAll() {
    abortRef.current = true;
    setTestingAll(false);
  }

  const testedCount  = provider.models.filter((m) => results[m.id]?.status === "ok" || results[m.id]?.status === "error").length;
  const passedCount  = provider.models.filter((m) => results[m.id]?.status === "ok").length;
  const failedCount  = provider.models.filter((m) => results[m.id]?.status === "error").length;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bot className="w-7 h-7 text-primary" />
          AI Model Tester
        </h1>
        <p className="text-muted-foreground mt-1">
          Test every provider and model — live responses and latency.
        </p>
      </div>

      {/* Provider tabs */}
      <div className="flex gap-0 border-b border-border">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setActiveProvider(p.id); setResults({}); }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeProvider === p.id
                ? p.tabActive
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* API Key */}
      <Card className="bg-card">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-muted-foreground" />
            <span className={provider.color}>{provider.label}</span>
            &nbsp;API Key
            {savedKeys?.[activeProvider]?.hasKey && (
              <span className="text-xs font-normal text-emerald-400">
                · Saved: <span className="font-mono">{savedKeys[activeProvider].maskedKey}</span>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey[activeProvider] ? "text" : "password"}
                placeholder={savedKeys?.[activeProvider]?.hasKey ? "Enter new key to replace…" : provider.keyHint}
                value={apiKeyInputs[activeProvider] ?? ""}
                onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [activeProvider]: e.target.value }))}
                className="bg-background font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => ({ ...prev, [activeProvider]: !prev[activeProvider] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey[activeProvider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              onClick={() =>
                saveKeyMutation.mutate({ provider: activeProvider, apiKey: apiKeyInputs[activeProvider] ?? "" })
              }
              disabled={!apiKeyInputs[activeProvider]?.trim() || saveKeyMutation.isPending}
              size="sm"
            >
              {saveKeyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Key is saved per-provider. You can test without saving by entering it above.
          </p>
        </CardContent>
      </Card>

      {/* Test message + controls */}
      <Card className="bg-card">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3 items-start">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Test message</label>
              <Textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={2}
                className="bg-background text-sm resize-none"
                placeholder="Message to send to each model…"
              />
            </div>
            <div className="flex flex-col gap-2 pt-6 shrink-0">
              {testingAll ? (
                <Button onClick={stopAll} variant="destructive" size="sm" className="gap-1.5">
                  <Square className="w-3.5 h-3.5" /> Stop
                </Button>
              ) : (
                <Button onClick={testAll} size="sm" className="gap-1.5">
                  <Play className="w-3.5 h-3.5" /> Test All
                </Button>
              )}
              <Button
                onClick={() => setResults({})}
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </Button>
            </div>
          </div>

          {/* Summary bar */}
          {testedCount > 0 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
              <span>Tested {testedCount} / {provider.models.length}</span>
              {passedCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> {passedCount} passed
                </span>
              )}
              {failedCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <XCircle className="w-3 h-3" /> {failedCount} failed
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Free models */}
      {freeModels.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
            <Leaf className="w-3.5 h-3.5" /> Free Models
          </h3>
          {freeModels.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              result={results[m.id]}
              onTest={() => testModel(m.id, activeProvider)}
              disabled={testingAll}
            />
          ))}
        </section>
      )}

      {/* Paid models */}
      {paidModels.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Paid Models
          </h3>
          {paidModels.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              result={results[m.id]}
              onTest={() => testModel(m.id, activeProvider)}
              disabled={testingAll}
            />
          ))}
        </section>
      )}
    </div>
  );
}
