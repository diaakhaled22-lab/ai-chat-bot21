import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Copy, MessageCircle, Webhook, CheckCircle2, XCircle, Send, ShieldCheck, ShieldAlert, Key, Eye, EyeOff, Lock } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

interface MetaAppSecretInfo {
  configured: boolean;
  source: "database" | "environment" | "none";
  maskedSecret: string | null;
  updatedAt: string | null;
}

function useMetaAppSecretConfig() {
  return useQuery<MetaAppSecretInfo>({
    queryKey: ["admin-meta-app-secret"],
    queryFn: () => customFetch("/api/admin/meta-app-secret"),
    staleTime: 30_000,
  });
}

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
        <pre className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto">
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
    <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="shrink-0">{isMessenger ? "📨" : "💬"}</span>
            <span className="truncate">{company.name}</span>
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
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
        <pre className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto select-all">
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

function WebhookCryptographicSecuritySection() {
  const { data: metaSecretInfo } = useMetaAppSecretConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [inputVal, setInputVal] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (secret: string) =>
      customFetch("/api/admin/meta-app-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSecret: secret }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-meta-app-secret"] });
      setInputVal("");
      toast({
        title: "تم حفظ Meta App Secret بنجاح",
        description: "تم تفعيل التحقق التشفيري HMAC-SHA256 بنسبة 100% لرسائل WhatsApp و Messenger.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "خطأ أثناء الحفظ",
        description: err.message || "فشل حفظ Meta App Secret",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/meta-app-secret", {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-meta-app-secret"] });
      toast({
        title: "تم حذف Meta App Secret",
        description: "تم تعطيل التحقق التشفيري الصارم مؤقتاً.",
      });
    },
  });

  const isConfigured = metaSecretInfo?.configured ?? false;

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-card to-card overflow-hidden border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                Webhook Cryptographic Signature Verification 🛡️
              </CardTitle>
              <CardDescription className="text-xs">
                التحقق التشفيري الرياضي (HMAC-SHA256 &amp; Secret Token) لضمان مصدر الرسائل بنسبة 100%
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              isConfigured
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1 w-fit"
                : "bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1 w-fit"
            }
          >
            {isConfigured ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" /> Meta HMAC-SHA256 Active
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" /> Meta App Secret Missing
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Meta (WhatsApp & Messenger) */}
          <div className="space-y-3 bg-muted/20 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <ChannelIcon channel="whatsapp" size={16} />
                  <ChannelIcon channel="messenger" size={16} />
                  <span>Meta (WhatsApp / Messenger)</span>
                </div>
                {isConfigured && (
                  <Badge variant="secondary" className="text-[10px]">
                    {metaSecretInfo?.source === "environment" ? "ENV" : "DB"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                يتم فحص التوقيع الرقمي <code className="bg-muted px-1 py-0.5 rounded text-[11px]">X-Hub-Signature-256</code> ومقارنته في وقت ثابت (<code className="bg-muted px-1 py-0.5 rounded text-[11px]">timingSafeEqual</code>) باستخدام Meta App Secret لمنع أي طلبات منتحلة تماماً.
              </p>

              {isConfigured && (
                <div className="flex items-center justify-between text-xs bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="font-mono text-muted-foreground">
                      {metaSecretInfo?.maskedSecret}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive hover:text-destructive"
                    onClick={() => removeMutation.mutate()}
                    disabled={removeMutation.isPending}
                  >
                    حذف
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {isConfigured ? "تحديث Meta App Secret" : "إدخال Meta App Secret"}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showSecret ? "text" : "password"}
                    placeholder="e.g. 7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    className="pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!inputVal.trim() || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(inputVal)}
                >
                  {saveMutation.isPending ? "جاري..." : "حفظ"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                احصل عليه من: Meta Developer Portal &rarr; تطبيقك &rarr; App settings &rarr; Basic &rarr; App Secret
              </p>
            </div>
          </div>

          {/* Telegram */}
          <div className="space-y-3 bg-muted/20 border border-border/50 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <ChannelIcon channel="telegram" size={16} />
                  <span>Telegram Cryptographic Secret Token</span>
                </div>
                <Badge variant="outline" className="bg-sky-500/10 text-sky-500 border-sky-500/30 text-[10px] gap-1">
                  <ShieldCheck className="w-3 h-3" /> مفعّل تلقائياً
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                يتم توليد رمز سري تشفيري فريد (<code className="bg-muted px-1 py-0.5 rounded text-[11px]">SHA-256 Secret Token</code>) لكل بوت تيليجرام وتمريره في مسار الـ Webhook وترويسة <code className="bg-muted px-1 py-0.5 rounded text-[11px]">X-Telegram-Bot-Api-Secret-Token</code> الرسمية.
              </p>
              <div className="p-3 bg-card border border-border/40 rounded-lg space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" />
                  <span>فحص المطابقة في وقت ثابت (Constant-Time Equal)</span>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  مقارنة البايتات تمنع هجمات التوقيت الجانبية (Timing Side-Channel Attacks) وتضمن عدم قبول أي طلب خارج خوادم تيليجرام الرسمية.
                </p>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-muted-foreground border-t border-border/30">
              💡 عند تسجيل البوت أو تحديثه، يتم تفعيل الترويسة التشفيرية السرية تلقائياً مع خوادم Telegram API.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformCredentialsSection() {
  const origin = window.location.origin;
  const { messengerQuery, whatsappQuery } = usePlatformWebhookConfig();
  const { data: metaSecretInfo } = useMetaAppSecretConfig();
  const messengerToken = messengerQuery.data?.verifyToken;
  const whatsappToken  = whatsappQuery.data?.verifyToken;
  const isMetaSecured  = metaSecretInfo?.configured ?? false;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Messenger */}
      <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-card border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <span>📨</span> Messenger Webhook
            </CardTitle>
            <Badge variant="outline" className={isMetaSecured ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5 text-[10px]" : "text-amber-500 border-amber-500/30 text-[10px]"}>
              {isMetaSecured ? "HMAC-SHA256" : "Unsigned"}
            </Badge>
          </div>
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
      <Card className="border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-card border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ChannelIcon channel="telegram" size={18} /> Telegram Webhook
            </CardTitle>
            <Badge variant="outline" className="text-sky-500 border-sky-500/30 bg-sky-500/5 text-[10px]">
              Secret Token
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <StaticField label="Webhook URL" value={`${origin}/api/telegram/webhook`} />
          <p className="text-[11px] text-muted-foreground">
            أضف <code className="bg-muted/60 px-1 rounded">/:botToken</code> عند تسجيل كل بوت.
          </p>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-card border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ChannelIcon channel="whatsapp" size={18} /> WhatsApp Webhook
            </CardTitle>
            <Badge variant="outline" className={isMetaSecured ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5 text-[10px]" : "text-amber-500 border-amber-500/30 text-[10px]"}>
              {isMetaSecured ? "HMAC-SHA256" : "Unsigned"}
            </Badge>
          </div>
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
  const { lang } = useLanguage();
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
        customFetch<{ logs: ChatLog[] }>("/api/admin/chat-logs?channel=messenger&limit=10"),
        customFetch<{ logs: ChatLog[] }>("/api/admin/chat-logs?channel=whatsapp&limit=10"),
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

      {/* Cryptographic Webhook Security */}
      <WebhookCryptographicSecuritySection />

      {/* Platform webhook credentials */}
      <PlatformCredentialsSection />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-card border-blue-500/20 border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-xl shrink-0">📨</div>
            <div>
              <p className="text-2xl font-bold">{isLoading ? "—" : messengerCompanies.length}</p>
              <p className="text-xs text-muted-foreground">Messenger webhooks configured</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-green-500/20 border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
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
          <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
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
          <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
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
        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
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
