import { useEffect, useRef, useState, useCallback } from "react";
import { Bot, Send, RotateCcw, AlertTriangle } from "lucide-react";
import { useGetClientCompany } from "@workspace/api-client-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ChatMessage = { role: "user" | "bot"; text: string };

function WidgetPreview({ widgetKey, companyName, isActive, hasAi }: {
  widgetKey: string;
  companyName: string;
  isActive: boolean;
  hasAi: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: `👋 Hi! I'm ${companyName}'s assistant. How can I help you today?` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => "preview_" + Math.random().toString(36).slice(2));
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const reset = useCallback(() => {
    setMessages([{ role: "bot", text: `👋 Hi! I'm ${companyName}'s assistant. How can I help you today?` }]);
    setInput("");
    setLoading(false);
  }, [companyName]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/widget/${encodeURIComponent(widgetKey)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, {
        role: "bot",
        text: data.response ?? (data.error ? `⚠️ ${data.error}` : "⚠️ No response received."),
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: "⚠️ Connection error. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, widgetKey, sessionId]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm font-medium">Company is inactive</p>
        <p className="text-xs">Ask your admin to activate your subscription.</p>
      </div>
    );
  }

  if (!hasAi) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
        <Bot className="w-8 h-8" />
        <p className="text-sm font-medium">AI not configured</p>
        <p className="text-xs">Set up your AI Provider and API Key in the Company page, then save.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[440px] rounded-xl border border-border overflow-hidden bg-background shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white text-lg">🤖</div>
          <div>
            <p className="text-white font-semibold text-sm">{companyName}</p>
            <p className="text-white/80 text-xs flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400"></span>
              Online · AI-powered
            </p>
          </div>
        </div>
        <button
          onClick={reset}
          title="Reset conversation"
          className="text-white/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "bot" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs shrink-0 mr-2 mt-0.5">🤖</div>
            )}
            <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-br-sm"
                : "bg-white dark:bg-card border border-border text-foreground rounded-bl-sm shadow-sm"
            }`}>
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs shrink-0">🤖</div>
            <div className="bg-white dark:bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2.5 flex items-end gap-2 bg-background shrink-0">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
          }}
          onKeyDown={handleKey}
          disabled={loading}
          placeholder="Type a message…"
          className="flex-1 resize-none bg-muted/40 rounded-xl border border-border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 disabled:opacity-50 transition-all max-h-24"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function ClientWidgetPreview() {
  const { data: company, isLoading } = useGetClientCompany();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card className="bg-card">
          <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
          <CardContent>
            <Skeleton className="h-[440px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Live Widget Preview</h1>
        <p className="text-muted-foreground mt-2">
          Test your chatbot exactly as your customers will experience it. Uses your real AI configuration — responses are saved to chat history.
        </p>
      </div>

      {company && company.websiteChatbotKey ? (
        <Card className="bg-card border-border/50 border-violet-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-violet-500" />
              Live Widget Preview
            </CardTitle>
            <CardDescription>
              Test your chatbot exactly as your customers will experience it. Uses your real AI configuration — responses are saved to chat history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WidgetPreview
              widgetKey={company.websiteChatbotKey}
              companyName={company.name}
              isActive={company.isActive}
              hasAi={!!(company.aiAgentApiKey && company.aiProvider)}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Bot className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No Website Widget Key set</p>
            <p className="text-xs text-muted-foreground">
              Go to the <span className="text-foreground font-medium">Company</span> page and set a Website Widget Key in the Channels section to enable the live preview.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
