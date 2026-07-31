import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Send, User, Loader2, Trash2, ChevronDown, Leaf, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Model catalog (must mirror AdminAITester + backend) ────────────────────
type Tier = "free" | "paid";
interface AIModel { id: string; label: string; tier: Tier; }
interface AIProvider { id: string; label: string; color: string; bgColor: string; models: AIModel[]; }

const PROVIDERS: AIProvider[] = [
  {
    id: "openai", label: "OpenAI",
    color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/30",
    models: [
      { id: "gpt-4o-mini",   label: "GPT-4o mini",   tier: "free" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo",  tier: "free" },
      { id: "gpt-4o",        label: "GPT-4o",          tier: "paid" },
      { id: "gpt-4-turbo",   label: "GPT-4 Turbo",     tier: "paid" },
      { id: "o3-mini",       label: "o3-mini",          tier: "paid" },
      { id: "o1-mini",       label: "o1-mini",          tier: "paid" },
    ],
  },
  {
    id: "anthropic", label: "Anthropic",
    color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/30",
    models: [
      { id: "claude-3-haiku-20240307",    label: "Claude 3 Haiku",    tier: "free" },
      { id: "claude-3-5-haiku-20241022",  label: "Claude 3.5 Haiku",  tier: "free" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", tier: "paid" },
      { id: "claude-3-opus-20240229",     label: "Claude 3 Opus",     tier: "paid" },
      { id: "claude-sonnet-4-5",          label: "Claude Sonnet 4.5", tier: "paid" },
      { id: "claude-opus-4-5",            label: "Claude Opus 4.5",   tier: "paid" },
    ],
  },
  {
    id: "google", label: "Google Gemini",
    color: "text-blue-400", bgColor: "bg-blue-500/10 border-blue-500/30",
    models: [
      { id: "gemini-2.0-flash-lite",    label: "Gemini 2.0 Flash Lite",    tier: "free" },
      { id: "gemini-1.5-flash",         label: "Gemini 1.5 Flash",         tier: "free" },
      { id: "gemini-2.0-flash",         label: "Gemini 2.0 Flash",         tier: "free" },
      { id: "gemini-1.5-pro",           label: "Gemini 1.5 Pro",           tier: "paid" },
      { id: "gemini-2.5-flash-preview", label: "Gemini 2.5 Flash Preview", tier: "paid" },
      { id: "gemini-2.5-pro-preview",   label: "Gemini 2.5 Pro Preview",   tier: "paid" },
    ],
  },
  {
    id: "openrouter", label: "OpenRouter",
    color: "text-purple-400", bgColor: "bg-purple-500/10 border-purple-500/30",
    models: [
      { id: "google/gemma-4-31b-it:free",             label: "Gemma 4 31B ⭐",        tier: "free" },
      { id: "openai/gpt-oss-20b:free",                label: "OpenAI OSS 20B",         tier: "free" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron Super 120B",    tier: "free" },
      { id: "nvidia/nemotron-nano-9b-v2:free",        label: "Nemotron Nano 9B",       tier: "free" },
      { id: "deepseek/deepseek-v4-flash",             label: "DeepSeek V4 Flash ⭐",   tier: "paid" },
      { id: "deepseek/deepseek-r1",                   label: "DeepSeek R1",            tier: "paid" },
      { id: "deepseek/deepseek-v3",                   label: "DeepSeek V3",            tier: "paid" },
      { id: "anthropic/claude-3.5-sonnet",            label: "Claude 3.5 Sonnet",      tier: "paid" },
      { id: "openai/gpt-4o",                          label: "GPT-4o",                 tier: "paid" },
      { id: "mistralai/mistral-large",                label: "Mistral Large",          tier: "paid" },
      { id: "meta-llama/llama-3.3-70b-instruct",      label: "Llama 3.3 70B",          tier: "paid" },
    ],
  },
];

type Message = { role: "user" | "assistant"; content: string };

// ── Sub-components ──────────────────────────────────────────────────────────
function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3 max-w-full", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted border border-border",
      )}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-primary" />}
      </div>
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted border border-border rounded-tl-sm",
      )}>
        {content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted border border-border">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: {
  provider: AIProvider;
  model: AIModel;
  onProviderChange: (p: AIProvider) => void;
  onModelChange: (m: AIModel) => void;
}) {
  const [openProvider, setOpenProvider] = useState(false);
  const [openModel,    setOpenModel]    = useState(false);
  const freeModels = provider.models.filter((m) => m.tier === "free");
  const paidModels = provider.models.filter((m) => m.tier === "paid");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Provider picker */}
      <div className="relative">
        <button
          onClick={() => { setOpenProvider((v) => !v); setOpenModel(false); }}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${provider.bgColor} ${provider.color} hover:opacity-80 transition-opacity`}
        >
          {provider.label}
          <ChevronDown className="w-3 h-3" />
        </button>
        {openProvider && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-40">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onProviderChange(p);
                  onModelChange(p.models[0]);
                  setOpenProvider(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                  p.id === provider.id ? `font-semibold ${p.color}` : "text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Model picker */}
      <div className="relative">
        <button
          onClick={() => { setOpenModel((v) => !v); setOpenProvider(false); }}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors text-foreground"
        >
          <span className={cn(
            "text-[9px] font-bold px-1 py-0.5 rounded uppercase",
            model.tier === "free" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
          )}>
            {model.tier}
          </span>
          {model.label}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        {openModel && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-56 max-h-72 overflow-y-auto">
            {freeModels.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                  <Leaf className="w-2.5 h-2.5" /> Free
                </div>
                {freeModels.map((m) => (
                  <button key={m.id} onClick={() => { onModelChange(m); setOpenModel(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${m.id === model.id ? "font-semibold text-foreground bg-muted" : "text-foreground"}`}
                  >{m.label}</button>
                ))}
              </>
            )}
            {paidModels.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1 mt-1 border-t border-border pt-2">
                  <Zap className="w-2.5 h-2.5" /> Paid
                </div>
                {paidModels.map((m) => (
                  <button key={m.id} onClick={() => { onModelChange(m); setOpenModel(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${m.id === model.id ? "font-semibold text-foreground bg-muted" : "text-foreground"}`}
                  >{m.label}</button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function ClientUniversalChat() {
  const { toast } = useToast();

  const [activeProvider, setActiveProvider] = useState<AIProvider>(PROVIDERS[3]); // OpenRouter default
  const [activeModel,    setActiveModel]    = useState<AIModel>(PROVIDERS[3].models[0]);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState("");
  const [streaming,      setStreaming]       = useState(false);
  const [streamContent,  setStreamContent]  = useState("");

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamContent, scrollToBottom]);

  function handleProviderChange(p: AIProvider) {
    setActiveProvider(p);
    setMessages([]);
    setStreamContent("");
  }

  function handleModelChange(m: AIModel) {
    setActiveModel(m);
    setMessages([]);
    setStreamContent("");
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setStreamContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/client/multi-ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          provider: activeProvider.id,
          model: activeModel.id,
          messages: newMessages,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast({ title: "Chat error", description: err.error, variant: "destructive" });
        setStreaming(false);
        return;
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let full   = "";
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Accumulate in buffer so partial SSE frames across chunks are handled correctly
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by blank lines (\n\n); process only complete events
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? ""; // last item may be an incomplete event — keep for next read

        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) { full += parsed.content; setStreamContent(full); }
              if (parsed.error) {
                toast({ title: "AI error", description: parsed.error, variant: "destructive" });
                break outer;
              }
              if (parsed.done) break outer;
            } catch { /* ignore malformed JSON */ }
          }
        }
      }

      if (full) {
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "Connection error", description: "Could not reach the AI", variant: "destructive" });
      }
    } finally {
      setStreaming(false);
      setStreamContent("");
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setStreamContent("");
  }

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/50">
        <ModelSelector
          provider={activeProvider}
          model={activeModel}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
        />
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3 text-muted-foreground">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${activeProvider.bgColor}`}>
                <Bot className={`w-7 h-7 ${activeProvider.color}`} />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {activeProvider.label} · {activeModel.label}
                </p>
                <p className="text-sm mt-1">Start a conversation below</p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} role={msg.role} content={msg.content} />
          ))}

          {streaming && (
            streamContent
              ? <MessageBubble role="assistant" content={streamContent} />
              : <TypingIndicator />
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t border-border p-4 bg-background">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeModel.label}…`}
            rows={1}
            disabled={streaming}
            className="resize-none bg-muted/50 border-border text-sm min-h-[42px] max-h-32"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="shrink-0 h-[42px] w-[42px]"
          >
            {streaming
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Enter ↵ to send · Shift+Enter for new line · Uses admin-configured API key
        </p>
      </div>
    </div>
  );
}
