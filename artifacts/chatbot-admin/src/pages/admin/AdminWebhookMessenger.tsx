import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Copy, MessageCircle, Webhook, CheckCircle2, XCircle, Send } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

function usePlatformWebhookConfig() {
  const messengerQuery = useQuery<{ webhookUrl: string; verifyToken: string | null }>({
    queryKey: ["admin-messenger-webhook-config"],
    queryFn: () => customFetch("/api/admin/messenger-webhook"),
    staleTime: 60_000,
  });
  const whatsappQuery = useQuery<{ webhookUrl: string; verifyToken: string | null }>({
    queryKey: ["admin-whatsapp-webhook-config"],
    queryFn: () => customFetch("/api/admin/whatsapp-webhook"),
    staleTime: 60_000,
  });
  return { messengerQuery, whatsappQuery };
}

interface Company {
  id: number;
  name: string;
  isActive: boolean;
  messengerApiKey: string | null;
  messengerPageId: string | null;
  whatsappApiToken: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappNumber: string | null;
}

interface ChatLog {
  id: number;
  companyId: number;
  channel: string;
  sessionId: string | null;
  customerMessage: string;
  botResponse: string | null;
  createdAt: string;
  companyName?: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { toast } = useToast();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 shrink-0"
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied!", description: `${label} copied to clipboard.` });
      }}
    >
      <Copy className="w-3 h-3 mr-1" /> Copy
    </Button>
  );
}

function WebhookRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2">
        <pre className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto">
          {url}
        </pre>
        <CopyButton text={url} label={label} />
      </div>
    </div>
  );
}

function CompanyCard({
  company,
  channel,
  webhookUrl,
  verifyToken,
}: {
  company: Company;
  channel: "messenger" | "whatsapp";
  webhookUrl: string;
  verifyToken: string | null;
}) {
  const isMessenger = channel === "messenger";

  return (
    <Card className={`bg-card border-border/50 ${isMessenger ? "border-blue-500/20" : "border-green-500/20"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span>{isMessenger ? "📨" : "💬"}</span>
            {company.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            {company.isActive ? (
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5 gap-1">
                <CheckCircle2 className="w-3 h-3" /> Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground gap-1">
                <XCircle className="w-3 h-3" /> Inactive
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <WebhookRow label="Webhook URL" url={webhookUrl} />
        <WebhookRow label="Verify Token" url={verifyToken ?? "—  (generate one in Admin → Security)"} />
      </CardContent>
    </Card>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StaticField({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2">
        <pre className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto select-all">
          {value}
        </pre>
        <Button
          type="button" variant="ghost" size="sm" className="h-9 px-2 shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast({ title: "تم النسخ!", description: `${label} copied to clipboard.` });
          }}
        >
          <Copy className="w-3.5 h-3.5 mr-1" /> Copy
        </Button>
      </div>
    </div>
  );
}

function PlatformCredentialsSection() {
  const origin = window.location.origin;
  const { messengerQuery, whatsappQuery } = usePlatformWebhookConfig();
  const messengerToken = messengerQuery.data?.verifyToken;
  const whatsappToken  = whatsappQuery.data?.verifyToken;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Messenger */}
      <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span>📨</span> Messenger Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StaticField label="Webhook URL" value={`${origin}/api/messenger/webhook`} />
          <Separator className="opacity-40" />
          <StaticField
            label="Verify Token"
            value={messengerQuery.isLoading ? "Loading…" : (messengerToken ?? "Not generated — go to Admin → Security")}
          />
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card className="border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChannelIcon channel="telegram" size={18} /> Telegram Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StaticField label="Webhook URL" value={`${origin}/api/telegram/webhook`} />
          <p className="text-[11px] text-muted-foreground">
            أضف <code className="bg-muted/60 px-1 rounded">/:botToken</code> عند تسجيل كل بوت.
          </p>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ChannelIcon channel="whatsapp" size={18} /> WhatsApp Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StaticField label="Webhook URL" value={`${origin}/api/whatsapp/webhook`} />
          <Separator className="opacity-40" />
          <StaticField
            label="Verify Token"
            value={whatsappQuery.isLoading ? "Loading…" : (whatsappToken ?? "Not generated — go to Admin → Security")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminWebhookMessenger() {
  const { messengerQuery, whatsappQuery } = usePlatformWebhookConfig();
  const messengerWebhookUrl = messengerQuery.data?.webhookUrl ?? `${window.location.origin}/api/messenger/webhook`;
  const whatsappWebhookUrl  = whatsappQuery.data?.webhookUrl  ?? `${window.location.origin}/api/whatsapp/webhook`;
  const messengerToken      = messengerQuery.data?.verifyToken ?? null;
  const whatsappToken       = whatsappQuery.data?.verifyToken  ?? null;

  const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["admin-companies-webhooks"],
    queryFn: () => customFetch("/api/admin/companies"),
    refetchInterval: 30_000,
  });

  const { data: recentLogs = [], isLoading: logsLoading } = useQuery<ChatLog[]>({
    queryKey: ["admin-messenger-logs"],
    queryFn: async () => {
      const [messenger, whatsapp] = await Promise.all([
        customFetch("/api/admin/chat-logs?channel=messenger&limit=10"),
        customFetch("/api/admin/chat-logs?channel=whatsapp&limit=10"),
      ]);
      return [...(messenger.logs ?? []), ...(whatsapp.logs ?? [])].sort(
        (a: ChatLog, b: ChatLog) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ).slice(0, 20);
    },
    refetchInterval: 15_000,
  });

  const messengerCompanies = companies.filter((c) => c.messengerApiKey && c.messengerPageId);
  const whatsappCompanies = companies.filter((c) => c.whatsappApiToken && c.whatsappPhoneNumberId);

  const isLoading = companiesLoading;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Webhook className="w-7 h-7 text-primary" />
          Webhook Channels
        </h1>
        <p className="text-muted-foreground mt-2">
          Messenger and WhatsApp webhook configurations across all companies.
        </p>
      </div>

      {/* Platform webhook credentials */}
      <PlatformCredentialsSection />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card border-blue-500/20">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-xl shrink-0">📨</div>
            <div>
              <p className="text-2xl font-bold">{isLoading ? "—" : messengerCompanies.length}</p>
              <p className="text-xs text-muted-foreground">Messenger webhooks configured</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-green-500/20">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-xl shrink-0">💬</div>
            <div>
              <p className="text-2xl font-bold">{isLoading ? "—" : whatsappCompanies.length}</p>
              <p className="text-xs text-muted-foreground">WhatsApp webhooks configured</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Messenger section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ChannelIcon channel="messenger" size={22} />
          <h2 className="text-lg font-semibold">Messenger</h2>
          <Badge variant="secondary">{messengerCompanies.length}</Badge>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : messengerCompanies.length === 0 ? (
          <Card className="bg-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <MessageCircle className="w-8 h-8 opacity-20" />
              <p className="text-sm">No companies have Messenger configured yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {messengerCompanies.map((c) => (
              <CompanyCard key={c.id} company={c} channel="messenger" webhookUrl={messengerWebhookUrl} verifyToken={messengerToken} />
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h2 className="text-lg font-semibold">WhatsApp</h2>
          <Badge variant="secondary">{whatsappCompanies.length}</Badge>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : whatsappCompanies.length === 0 ? (
          <Card className="bg-card border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <MessageCircle className="w-8 h-8 opacity-20" />
              <p className="text-sm">No companies have WhatsApp configured yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {whatsappCompanies.map((c) => (
              <CompanyCard key={c.id} company={c} channel="whatsapp" webhookUrl={whatsappWebhookUrl} verifyToken={whatsappToken} />
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Recent Activity</h2>
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Latest Messenger &amp; WhatsApp messages
            </CardTitle>
            <CardDescription>Auto-refreshes every 15 seconds</CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                <CheckCircle2 className="w-6 h-6 opacity-20" />
                <p className="text-sm">No messages received yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {recentLogs.map((log) => (
                  <div key={log.id} className="py-3 flex items-start gap-3">
                    <span className="shrink-0 mt-0.5">
                      <ChannelIcon channel={log.channel === "messenger" ? "messenger" : "whatsapp"} size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                          {log.channel}
                        </Badge>
                        {log.sessionId && (
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                            {log.sessionId}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                          {timeAgo(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground truncate">{log.customerMessage}</p>
                      {log.botResponse && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">↳ {log.botResponse}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
