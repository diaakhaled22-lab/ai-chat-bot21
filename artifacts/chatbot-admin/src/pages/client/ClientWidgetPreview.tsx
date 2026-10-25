import { useEffect, useRef, useState, useCallback } from "react";
import { Bot, Send, RotateCcw, AlertTriangle } from "lucide-react";
import { useGetClientCompany } from "@workspace/api-client-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";

function cleanDisplayMessage(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/提供/g, "تقديم")
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, "")
    .replace(/^(\s*)[\*]\s+/gm, "$1• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*{1,3}/g, "")
    .replace(/[ \t]+([؟!\?.,،:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

type ChatMessage = { role: "user" | "bot"; text: string };

function WidgetPreview({ widgetKey, companyName, isActive, hasAi }: {
  widgetKey: string;
  companyName: string;
  isActive: boolean;
  hasAi: boolean;
}) {
  const { t, lang } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: lang === "ar" ? `👋 مرحباً بك! أنا المساعد الذكي لـ ${companyName}. كيف يمكنني مساعدتك اليوم؟` : `👋 Hi! I'm ${companyName}'s assistant. How can I help you today?` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => "preview_" + Math.random().toString(36).slice(2));
  
    useEffect(() => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const ws = new WebSocket(`${protocol}//${host}/api/widget/ws?sessionId=${sessionId}`);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_message") {
            setMessages((prev) => [...prev, { role: data.role as "bot", text: data.text }]);
          }
        } catch(e) {}
      };
      
      return () => ws.close();
    }, [sessionId]);

    const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const reset = useCallback(() => {
    setMessages([{ role: "bot", text: lang === "ar" ? `👋 مرحباً بك! أنا المساعد الذكي لـ ${companyName}. كيف يمكنني مساعدتك اليوم؟` : `👋 Hi! I'm ${companyName}'s assistant. How can I help you today?` }]);
    setInput("");
    setLoading(false);
  }, [companyName, lang]);

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
        text: data.response ?? (data.error ? `⚠️ ${data.error}` : (lang === "ar" ? "⚠️ لم يتم استلام أي رد." : "⚠️ No response received.")),
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: lang === "ar" ? "⚠️ حدث خطأ في الاتصال. يرجى المحاولة ثانية." : "⚠️ Connection error. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, widgetKey, sessionId, lang]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm font-medium">{t("widget_preview_inactive")}</p>
      </div>
    );
  }

  if (!hasAi) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
        <Bot className="w-8 h-8" />
        <p className="text-sm font-medium">{t("widget_preview_no_ai")}</p>
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
              {lang === "ar" ? "متصل · مدعوم بالذكاء الاصطناعي" : "Online · AI-powered"}
            </p>
          </div>
        </div>
        <button
          onClick={reset}
          title={t("widget_preview_reset")}
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
              {cleanDisplayMessage(m.text)}
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
          placeholder={lang === "ar" ? "اكتب رسالتك هنا..." : "Type a message…"}
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
  const { t, lang } = useLanguage();
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
      {/* ── Bot Manager Hero Operations Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-robot text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Chatbot Simulator
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {t("widget_preview_title")}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {t("widget_preview_desc")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {company && company.websiteChatbotKey ? (
        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-violet-500" />
              {t("widget_preview_title")}
            </CardTitle>
            <CardDescription>
              {t("widget_preview_desc")}
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
        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Bot className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">{lang === "ar" ? "لم يتم تعيين مفتاح ويدجت الموقع" : "No Website Widget Key set"}</p>
            <p className="text-xs text-muted-foreground">
              {lang === "ar" ? "انتقل إلى صفحة قنوات التواصل وأدخل مفتاح الويدجت لتفعيل المعاينة الحية." : "Go to the Channels page and set a Website Widget Key to enable the live preview."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
