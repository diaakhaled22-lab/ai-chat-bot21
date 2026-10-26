import { useState } from "react";
import { Copy, Check, Zap } from "lucide-react";
import { useGetClientCompany, customFetch } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

export default function ClientWebhookHistory() {
  const { t, lang } = useLanguage();
  const { data: company, isLoading } = useGetClientCompany();
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const { toast } = useToast();

  const webhookUrl = `${window.location.origin}/api/webhook/message`;

  const webhookPhase1Example = (channel: string, key: string) =>
    JSON.stringify(
      { apiKey: key || "<your-channel-key>", channel, sessionId: "user_123", customerMessage: "What are your opening hours?" },
      null,
      2,
    );

  const webhookResponseExample = JSON.stringify(
    {
      id: 42,
      companyId: 1,
      channel: "website",
      sessionId: "user_123",
      createdAt: new Date().toISOString(),
      systemPrompt: "You are a helpful assistant for Acme Corp...",
      conversationHistory: [
        { role: "user", content: "Hi there!" },
        { role: "assistant", content: "Hello! How can I help you today?" },
      ],
    },
    null,
    2,
  );

  const webhookPhase2Example = (channel: string, key: string) =>
    JSON.stringify(
      {
        apiKey: key || "<your-channel-key>",
        channel,
        sessionId: "user_123",
        customerMessage: "What are your opening hours?",
        botResponse: "We are open Monday–Friday, 9 am–6 pm.",
      },
      null,
      2,
    );

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
    toast({ title: t("btn_copied") });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card className="bg-card">
          <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
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
              <i className="fa-solid fa-network-wired text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                API Integration Endpoint
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {t("webhook_title")}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {t("webhook_desc")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            {lang === "ar" ? "تكامل الويب هوك وسجل المحادثة" : "Webhook & Conversation History"}
          </CardTitle>
          <CardDescription>
            {lang === "ar" ? "أرسل طلبات POST إلى هذا المسار لجلب سياق المحادثة والتعليمات وتسجيل ردود المساعد الذكي." : "POST to this endpoint from your chatbot. It returns your System Prompt and the full conversation history so your AI always has the right context."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Endpoint */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("webhook_endpoint_label")}</p>
            <div className="relative group">
              <pre className="bg-background text-foreground p-3 rounded-lg border border-border font-mono text-sm overflow-x-auto">
                <code>POST {webhookUrl}</code>
              </pre>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={copyWebhookUrl}
              >
                {copiedWebhook ? <Check className="w-3 h-3 mr-1.5 text-emerald-500" /> : <Copy className="w-3 h-3 mr-1.5" />}
                {copiedWebhook ? t("btn_copied") : t("btn_copy")}
              </Button>
            </div>
          </div>

          {/* How it works */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{lang === "ar" ? "كيفية العمل — مرحلتان لجلب وحفظ السياق" : "How it works — two-phase flow"}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-background border border-border rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-semibold text-primary">{t("webhook_phase1_title")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("webhook_phase1_desc")}
                </p>
              </div>
              <div className="bg-background border border-border rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-semibold text-emerald-500">{t("webhook_phase2_title")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("webhook_phase2_desc")}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {lang === "ar" ? "للبوتات البسيطة، يمكنك إرسال رسالة العميل ورد البوت معاً في طلب واحد لحفظ المحادثة مباشرة." : "For simple bots, skip the two-phase flow — POST both customerMessage and botResponse together to log the turn directly."}
            </p>
          </div>

          {/* Channel keys */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{lang === "ar" ? "المفتاح المطلوب لكل قناة" : "Which API key to use"}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                { channel: "telegram",  label: lang === "ar" ? "تليجرام" : "Telegram",  key: lang === "ar" ? "رمز بوت تليجرام" : "Telegram Bot Token" },
                { channel: "whatsapp",  label: lang === "ar" ? "واتساب" : "WhatsApp",  key: lang === "ar" ? "رمز واتساب للأعمال" : "WhatsApp API Key" },
                { channel: "messenger", label: lang === "ar" ? "ماسنجر" : "Messenger", key: lang === "ar" ? "رمز صفحة ماسنجر" : "Messenger Page Access Token" },
                { channel: "website",   label: lang === "ar" ? "الموقع" : "Website",   key: lang === "ar" ? "مفتاح ويدجت الموقع" : "Website Widget Key" },
              ].map(({ channel, label, key }) => (
                <div key={channel} className="bg-background border border-border rounded-lg p-3">
                  <p className="text-xs font-semibold text-primary mb-1">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar" ? "استخدم " : "Use your "}
                    <span className="text-foreground font-medium">{key}</span>
                    {lang === "ar" ? " كـ apiKey" : " as the apiKey"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Phase 1 example */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">① Request — fetch context</p>
            <pre className="bg-background text-foreground p-4 rounded-lg border border-border font-mono text-xs overflow-x-auto">
              <code>{webhookPhase1Example("website", company?.websiteChatbotKey || "")}</code>
            </pre>
          </div>

          {/* Response example */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">← Response (use to build AI prompt)</p>
            <pre className="bg-background text-foreground p-4 rounded-lg border border-border font-mono text-xs overflow-x-auto">
              <code>{webhookResponseExample}</code>
            </pre>
          </div>

          {/* Phase 2 example */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">② Request — log the reply</p>
            <pre className="bg-background text-foreground p-4 rounded-lg border border-border font-mono text-xs overflow-x-auto">
              <code>{webhookPhase2Example("website", company?.websiteChatbotKey || "")}</code>
            </pre>
          </div>

          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            <code className="bg-muted px-1 rounded">sessionId</code> can be any stable string — Telegram{" "}
            <code className="bg-muted px-1 rounded">chat_id</code>, WhatsApp phone number, Messenger sender ID, browser fingerprint, etc.
            History is scoped per company and per session. Invalid <code className="bg-muted px-1 rounded">apiKey</code> →{" "}
            <code className="bg-muted px-1 rounded">401</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
