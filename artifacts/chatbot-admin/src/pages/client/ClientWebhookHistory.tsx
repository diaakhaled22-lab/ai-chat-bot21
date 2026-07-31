import { useState } from "react";
import { Copy, Check, Zap } from "lucide-react";
import { useGetClientCompany, customFetch } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function ClientWebhookHistory() {
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
    toast({ title: "Webhook URL copied" });
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Webhook History</h1>
        <p className="text-muted-foreground mt-2">
          Integrate your own AI with the webhook endpoint to fetch context and log conversation turns.
        </p>
      </div>

      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Webhook &amp; Conversation History
          </CardTitle>
          <CardDescription>
            POST to this endpoint from your chatbot. It returns your System Prompt and the full conversation history so your AI always has the right context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Endpoint */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Endpoint</p>
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
                {copiedWebhook ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* How it works */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works — two-phase flow</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-background border border-border rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-semibold text-primary">① Fetch context (before AI call)</p>
                <p className="text-xs text-muted-foreground">
                  POST the customer's message with a <code className="bg-muted px-1 rounded">sessionId</code> but <em>no</em>{" "}
                  <code className="bg-muted px-1 rounded">botResponse</code>. The response returns your{" "}
                  <code className="bg-muted px-1 rounded">systemPrompt</code> and prior{" "}
                  <code className="bg-muted px-1 rounded">conversationHistory</code>. Use these to call your AI.
                </p>
              </div>
              <div className="bg-background border border-border rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-semibold text-emerald-500">② Log the reply (after AI call)</p>
                <p className="text-xs text-muted-foreground">
                  POST again with the same <code className="bg-muted px-1 rounded">sessionId</code> and include{" "}
                  <code className="bg-muted px-1 rounded">botResponse</code>. This stores the full turn so the next message will include it in history.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              For simple bots, skip the two-phase flow — POST both <code className="bg-muted px-1 rounded">customerMessage</code> and{" "}
              <code className="bg-muted px-1 rounded">botResponse</code> together to log the turn directly.
            </p>
          </div>

          {/* Channel keys */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Which API key to use</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                { channel: "telegram",  label: "Telegram",  key: "Telegram Bot Token" },
                { channel: "whatsapp",  label: "WhatsApp",  key: "WhatsApp API Key" },
                { channel: "messenger", label: "Messenger", key: "Messenger Page Access Token" },
                { channel: "website",   label: "Website",   key: "Website Widget Key" },
              ].map(({ channel, label, key }) => (
                <div key={channel} className="bg-background border border-border rounded-lg p-3">
                  <p className="text-xs font-semibold text-primary mb-1">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    Use your <span className="text-foreground font-medium">{key}</span> as the{" "}
                    <code className="text-xs bg-muted px-1 rounded">apiKey</code>
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
