import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Copy, Check, Info, Bot, MessageCircle, Zap, Database, KeyRound, Lock, Eye, EyeOff, UserRound, ChevronDown, AlertTriangle, Gauge, Send, RotateCcw, Upload, Trash2, FileText, FileJson, Link2, Loader2, ExternalLink, Globe, Plug, Sparkles, FolderDown, Mail, Cpu } from "lucide-react";

/** Compute the same SHA-256 based webhook secret as the backend (first 32 hex chars). */
async function telegramWebhookSecret(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
import {
  useGetClientCompany, useCreateClientCompany, useUpdateClientCompany,
  useListClientKnowledgeFiles, useCreateClientKnowledgeFile, useDeleteClientKnowledgeFile,
  getGetClientCompanyQueryKey, getListClientKnowledgeFilesQueryKey, customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { AI_PROVIDERS, type AiProvider, mergeDynamicModels, type AiModelCatalogResponse } from "@/lib/ai-models";

import { ChannelIcon, CHANNEL_SVG_SNIPPETS } from "@/components/ChannelIcon";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";

const formSchema = z.object({
  name: z.string().min(2, "Company name is required"),
  generalInfo: z.string().optional(),
  systemPrompt: z.string().optional(),
    
  aiAgentApiKey: z.string().optional().or(z.literal("")),
  aiProvider: z.enum(["openai", "anthropic", "google", "openrouter"]).optional(),
  aiModel: z.string().optional().or(z.literal("")),
  aiExecutionMode: z.enum(["quota", "tokens"]).default("quota"),
  websiteDataUrl: z.string().optional().or(z.literal("")),
  websiteAutoSync: z.boolean().default(false),
});

type QuotaData = { quota: number | null; usedTokens: number; percentUsed: number | null; warning: "ok" | "near" | "exceeded" | "none" };



function usePlatformWebhooks() {
  return useQuery<{
    messenger: { webhookUrl: string; verifyToken: string | null };
    whatsapp: { webhookUrl: string; verifyToken: string | null };
  }>({
    queryKey: ["client-platform-webhooks"],
    queryFn: () => customFetch("/api/client/platform-webhooks"),
    staleTime: Infinity,
  });
}

function MessengerSetupCard({ company }: { company: { isActive: boolean; messengerApiKey?: string | null; messengerPageId?: string | null } }) {
  const { toast } = useToast();
  const { lang } = useLanguage();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { data: platformConfig, isLoading: platformLoading } = usePlatformWebhooks();

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  const webhookUrl = platformConfig?.messenger?.webhookUrl ?? `${window.location.origin}/api/messenger/webhook`;
  const verifyToken = platformConfig?.messenger?.verifyToken ?? null;

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await customFetch<{
        ok: boolean;
        name?: string;
        error?: string;
        code?: number;
        requiresPageAccess?: boolean;
      }>("/api/client/test-messenger", { method: "POST" });
      if (data.ok) {
        setTestResult({ ok: true, message: `✅ Connected${data.name ? ` — Page: ${data.name}` : ""}` });
      } else if (data.requiresPageAccess) {
        setTestResult({
          ok: false,
          message: lang === "ar"
            ? "❌ رفضت Meta بيانات الاعتماد. استخدم Page Access Token وليس App/User Token، وتأكد من تفعيل pages_messaging و pages_read_engagement أو Page Public Metadata Access من لوحة Meta. يمكنك إدخال Page ID يدويًا أدناه."
            : "❌ Meta rejected this credential. Use a Page Access Token, not an App/User Token, and enable pages_messaging plus pages_read_engagement or Page Public Metadata Access in Meta. You can enter the Page ID manually below.",
        });
      } else {
        setTestResult({ ok: false, message: `❌ ${data.error ?? "Connection failed"}` });
      }
    } catch {
      setTestResult({ ok: false, message: "❌ Could not reach the server." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="bg-card border-[#DCE7FF] border-blue-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ChannelIcon channel="messenger" size={20} /> Messenger Setup
        </CardTitle>
        <CardDescription>
          Use a Page Access Token from Meta (not an App or User token). Add this URL as your webhook and use the Verify Token below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!company.isActive && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Activate your account first — inactive bots will not reply.
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook URL</p>
          <div className="relative group">
            <pre className="bg-muted/40 border border-border rounded-lg px-4 py-2.5 font-mono text-xs overflow-x-auto">
              {webhookUrl}
            </pre>
            <Button type="button" variant="ghost" size="sm"
              className="absolute top-1.5 right-1.5 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => copy(webhookUrl, "Webhook URL")}>
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Verify Token</p>
          {platformLoading ? (
            <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
          ) : verifyToken ? (
            <div className="relative group">
              <pre className="bg-muted/40 border border-border rounded-lg px-4 py-2.5 font-mono text-xs overflow-x-auto">
                {verifyToken}
              </pre>
              <Button type="button" variant="ghost" size="sm"
                className="absolute top-1.5 right-1.5 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => copy(verifyToken, "Verify Token")}>
                <Copy className="w-3 h-3 mr-1" /> Copy
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-400">
              No verify token set. Ask your admin to generate one in Admin → Security.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={testing}
            className="w-full gap-2">
            {testing
              ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full" /> Testing…</>
              : <><Zap className="w-3.5 h-3.5" /> Test Connection</>}
          </Button>
          {testResult && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
              {testResult.message}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#DCE7FF] bg-muted/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            {lang === "ar" ? "متطلبات Meta:" : "Meta requirements:"}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "ar"
              ? "استخدم Page Access Token للصفحة الصحيحة، وفعّل pages_messaging وpages_read_engagement أو Page Public Metadata Access. إذا كان التطبيق في وضع التطوير، يجب أن يكون حسابك Admin/Developer/Tester في تطبيق Meta."
              : "Use a Page Access Token for the correct Page, and enable pages_messaging plus pages_read_engagement or Page Public Metadata Access. In development mode, your account must be an Admin, Developer, or Tester of the Meta app."}
          </p>
        </div>

        <div className="rounded-lg border border-[#DCE7FF] bg-muted/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">How it works after setup:</p>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>① User sends a message to your Facebook Page</span>
            <span>② Meta forwards it to your server automatically</span>
            <span>③ AI reads your System Prompt + Website Data and replies</span>
            <span>④ Response is sent back to the user in Messenger</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WhatsAppSetupCard({ company }: { company: { isActive: boolean; whatsappApiToken?: string | null; whatsappPhoneNumberId?: string | null } }) {
  const { toast } = useToast();
  const { data: platformConfig, isLoading } = usePlatformWebhooks();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  const webhookUrl = platformConfig?.whatsapp?.webhookUrl ?? "";
  const verifyToken = platformConfig?.whatsapp?.verifyToken ?? "";

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await customFetch<{ ok: boolean; name?: string; phone?: string; error?: string }>("/api/client/test-whatsapp", { method: "POST" });
      if (data.ok) {
        const detail = [data.name, data.phone].filter(Boolean).join(" · ");
        setTestResult({ ok: true, message: `✅ Connected${detail ? ` — ${detail}` : ""}` });
      } else {
        setTestResult({ ok: false, message: `❌ ${data.error ?? "Connection failed"}` });
      }
    } catch {
      setTestResult({ ok: false, message: "❌ Could not reach the server." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="bg-card border-[#DCE7FF] border-green-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ChannelIcon channel="whatsapp" size={20} /> WhatsApp Setup
        </CardTitle>
        <CardDescription>
          Your credentials are saved. Use the webhook URL and verify token below in your Meta App Dashboard → WhatsApp → Configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!company.isActive && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Activate your account first — inactive bots will not reply.
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook URL</p>
          {isLoading ? (
            <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
          ) : (
            <div className="relative group">
              <pre className="bg-muted/40 border border-border rounded-lg px-4 py-2.5 font-mono text-xs overflow-x-auto">
                {webhookUrl || "—"}
              </pre>
              {webhookUrl && (
                <Button type="button" variant="ghost" size="sm"
                  className="absolute top-1.5 right-1.5 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copy(webhookUrl, "Webhook URL")}>
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Verify Token</p>
          {isLoading ? (
            <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
          ) : (
            <div className="relative group">
              <pre className="bg-muted/40 border border-border rounded-lg px-4 py-2.5 font-mono text-xs overflow-x-auto">
                {verifyToken || "—"}
              </pre>
              {verifyToken && (
                <Button type="button" variant="ghost" size="sm"
                  className="absolute top-1.5 right-1.5 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => copy(verifyToken, "Verify Token")}>
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={testing}
            className="w-full gap-2">
            {testing
              ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full" /> Testing…</>
              : <><Zap className="w-3.5 h-3.5" /> Test Connection</>}
          </Button>
          {testResult && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
              {testResult.message}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#DCE7FF] bg-muted/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">How it works after setup:</p>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>① User sends a message to your WhatsApp number</span>
            <span>② Meta forwards it to your server automatically</span>
            <span>③ AI reads your System Prompt + Website Data and replies</span>
            <span>④ Response is sent back to the user in WhatsApp</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientCompany() {
  const { t, lang } = useLanguage();
  const { data: company, isLoading } = useGetClientCompany();
  const { data: knowledgeFiles } = useListClientKnowledgeFiles();
  type AiStatus = {
    status: "ok" | "no_quota" | "no_platform_key" | "no_key" | "invalid_key" | "quota_exceeded" | "error" | "no_company";
    mode?: "quota" | "tokens";
    provider?: string;
    model?: string;
    isSupportAgent?: boolean;
    detail?: string;
  };

  // AI execution mode from company settings
  const currentExecutionMode: "quota" | "tokens" = ((company as any)?.aiExecutionMode as "quota" | "tokens") || "quota";

  const { data: aiStatus, isLoading: aiStatusLoading, refetch: refetchAiStatus } = useQuery<AiStatus>({
    queryKey: ["client-ai-status", currentExecutionMode],
    queryFn: () => customFetch(`/api/client/company/ai-status?mode=${currentExecutionMode}`) as Promise<AiStatus>,
    enabled: !!company,
    staleTime: 30_000,
    retry: false,
  });

  const { data: quotaData } = useQuery<QuotaData>({
    queryKey: ["client-company-quota"],
    queryFn: () => customFetch<QuotaData>("/api/client/company/quota"),
    enabled: true,
    refetchInterval: 60_000,
  });

  const { data: syncedAiModels } = useQuery<AiModelCatalogResponse>({
    queryKey: ["client-ai-model-catalog"],
    queryFn: () => customFetch("/api/client/ai-models") as Promise<AiModelCatalogResponse>,
    enabled: !!company,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });

  const allowWebsite = (company as any)?.allowSourceWebsite === false ? false : true;
  const allowFiles = (company as any)?.allowSourceFiles === false ? false : true;
  const allowWordpress = (company as any)?.allowSourceWordpress === false ? false : true;
  const allowRestApi = (company as any)?.allowSourceRestApi === false ? false : true;
  const allowShopify = (company as any)?.allowSourceShopify === false ? false : true;

  const { data: wpIntegration } = useQuery<{ status: "pending" | "connected" | "error"; totalItems: number } | null>({
    queryKey: ["client-wordpress-status"],
    queryFn: () => customFetch<{ status: "pending" | "connected" | "error"; totalItems: number }>("/api/client/wordpress").catch(() => null),
    enabled: !!company && allowWordpress,
    staleTime: 60_000,
  });

  const { data: restApiIntegration } = useQuery<{ status: "pending" | "connected" | "error"; totalItems: number } | null>({
    queryKey: ["client-rest-api-status"],
    queryFn: () => customFetch<{ status: "pending" | "connected" | "error"; totalItems: number }>("/api/client/rest-api").catch(() => null),
    enabled: !!company && allowRestApi,
    staleTime: 60_000,
  });

  const { data: shopifyIntegration } = useQuery<{ status: "pending" | "connected" | "error"; totalItems: number } | null>({
    queryKey: ["client-shopify-status"],
    queryFn: () => customFetch<{ status: "pending" | "connected" | "error"; totalItems: number }>("/api/client/shopify").catch(() => null),
    enabled: !!company && allowShopify,
    staleTime: 60_000,
  });
  const createCompany = useCreateClientCompany();
  const updateCompany = useUpdateClientCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [fabPreviewOpen, setFabPreviewOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [tgRegistering, setTgRegistering] = useState(false);
  const [tgStatus, setTgStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [tgWebhookHash, setTgWebhookHash] = useState<string>("");
  const initialized = useRef(false);
  const fabOverlayRef = useRef<HTMLDivElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      generalInfo: "",
      systemPrompt: "",
        
      aiAgentApiKey: "",
      aiProvider: undefined,
      aiModel: "",
      aiExecutionMode: "quota",
      websiteDataUrl: "",
      websiteAutoSync: false,
    },
  });

  useEffect(() => {
    if (company && !initialized.current) {
      form.reset({
        name: company.name || "",
        generalInfo: company.generalInfo || "",
        systemPrompt: company.systemPrompt || "",
          
        aiAgentApiKey: company.aiAgentApiKey || "",
        aiProvider: (company.aiProvider as AiProvider) || undefined,
        aiModel: (company.aiModel === "nvidia/nemotron-nano-9b-v2:free" || company.aiModel?.includes("nemotron-nano"))
          ? "nvidia/nemotron-3.5-lightning:free"
          : (company.aiModel || ""),
        aiExecutionMode: ((company as any)?.aiExecutionMode as "quota" | "tokens") || "quota",
        websiteDataUrl: company.websiteDataUrl || "",
        websiteAutoSync: company.websiteAutoSync ?? false,
      });
      initialized.current = true;
    }
  }, [company, form]);

  // Compute the hashed webhook secret for display (never show the raw token)
  useEffect(() => {
    if (company?.telegramBotApiKey) {
      telegramWebhookSecret(company.telegramBotApiKey).then(setTgWebhookHash);
    }
  }, [company?.telegramBotApiKey]);

  useEffect(() => {
    if (!company?.fabEnabled) return;
    const fab = fabOverlayRef.current;
    if (!fab) return;

    const positionFab = () => {
      const x = Math.min(96, Math.max(4, company.fabPositionX ?? 96));
      const y = Math.min(94, Math.max(6, company.fabPositionY ?? 92));
      const edgeX = Math.min(44, window.innerWidth / 2);
      const edgeY = Math.min(44, window.innerHeight / 2);
      const isLargeScreen = window.innerWidth >= 768;
      fab.style.left = isLargeScreen
        ? x < 50 ? "20px" : "auto"
        : `${edgeX + Math.max(0, window.innerWidth - edgeX * 2) * (x / 100)}px`;
      fab.style.right = isLargeScreen && x >= 50 ? "20px" : "auto";
      fab.style.top = `${edgeY + Math.max(0, window.innerHeight - edgeY * 2) * (y / 100)}px`;
    };

    positionFab();
    window.addEventListener("resize", positionFab);
    return () => window.removeEventListener("resize", positionFab);
  }, [company?.fabEnabled, company?.fabPositionX, company?.fabPositionY]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Transform empty strings to nulls for API
    const data = {
      ...values,
      aiExecutionMode: values.aiExecutionMode || currentExecutionMode,
      aiAgentApiKey: values.aiAgentApiKey || company?.aiAgentApiKey || null,
      aiProvider: values.aiProvider || company?.aiProvider || null,
      aiModel: values.aiModel || company?.aiModel || null,
      websiteDataUrl: values.websiteDataUrl || null,
      websiteAutoSync: values.websiteAutoSync,
    };

    if (company) {
      updateCompany.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
          toast({ title: t("settings_saved_success") });
        },
        onError: (error: any) => {
          toast({ title: lang === "ar" ? "فشل الحفظ" : "Failed to save", description: error.message, variant: "destructive" });
        }
      });
    } else {
      createCompany.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
          toast({ title: t("settings_saved_success") });
        },
        onError: (error: any) => {
          toast({ title: lang === "ar" ? "فشل الإنشاء" : "Failed to create", description: error.message, variant: "destructive" });
        }
      });
    }
  };

  const copyToClipboard = () => {
    if (!company) return;
    const code = `<script src="https://chatbot.example.com/widget.js" data-company="${company.id}"></script>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: t("btn_copied") });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 w-full">
        <Skeleton className="h-10 w-64" />
        <Card className="bg-card">
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSaving = createCompany.isPending || updateCompany.isPending;

  const telegramConnected = Boolean(company?.telegramBotApiKey) && (company?.telegramEnabled ?? true);
  const whatsappConnected = Boolean(company?.whatsappApiToken) && (company?.whatsappEnabled ?? true);
  const messengerConnected = Boolean(company?.messengerApiKey) && (company?.messengerEnabled ?? true);
  const widgetConnected = Boolean(company?.websiteChatbotKey) && (company?.widgetEnabled ?? true);
  const hasConnectedChannel = telegramConnected || whatsappConnected || messengerConnected || widgetConnected;

  const shareTelegramLink = telegramConnected && company?.telegramBotUsername
    ? `https://t.me/${company.telegramBotUsername}`
    : null;
  const shareWhatsappLink = whatsappConnected && company?.whatsappNumber
    ? `https://wa.me/${company.whatsappNumber.replace(/\D/g, "")}`
    : null;
  const shareMessengerLink = messengerConnected && company?.messengerPageId
    ? `https://m.me/${company.messengerPageId}`
    : null;
  const shareWebsite = widgetConnected && Boolean(company?.websiteChatbotKey);
  const hasShareableChannel = Boolean(shareTelegramLink || shareWhatsappLink || shareMessengerLink || shareWebsite);

  const registerTelegramWebhook = async () => {
    if (!company?.telegramBotApiKey) return;
    setTgRegistering(true);
    setTgStatus(null);
    try {
      const res = await fetch(`/api/telegram/register-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setTgStatus({ ok: true, message: lang === "ar" ? "✅ تم تسجيل الويبهوك بنجاح! سيستقبل الروبوت الرسائل الآن." : "✅ Webhook registered! Telegram will now send messages to your chatbot." });
      } else {
        setTgStatus({ ok: false, message: `❌ ${data.error}` });
      }
    } catch {
      setTgStatus({ ok: false, message: lang === "ar" ? "❌ خطأ في الاتصال. تأكد من رمز البوت." : "❌ Connection error. Check your bot token and try again." });
    } finally {
      setTgRegistering(false);
    }
  };

  const showQuotaBanner = currentExecutionMode === "quota" && quotaData && quotaData.warning !== "none" && quotaData.warning !== "ok";

  return (
    <>
    <div className="space-y-8 w-full pb-12">
      {/* ── Bot Manager Hero Operations Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: (company as any)?.businessType === "clinic"
            ? "linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)"
            : "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-building text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                {lang === "ar" ? "ملف وهوية الشركة" : "Company Profile & Identity"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {t("company_title")}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {t("company_desc")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {company && !company.isActive && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-4 text-sm">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-red-600 dark:text-red-400">{lang === "ar" ? "البوت غير نشط — يرجى التواصل مع المسؤول لتفعيل الحساب" : "Chatbot is inactive — contact your admin"}</p>
            <p className="text-red-600/80 dark:text-red-400/80">
              {lang === "ar"
                ? "لم يتم تفعيل اشتراكك بعد. جميع القنوات (تليجرام، واتساب، ماسنجر، ويدجت الموقع) لن ترد على الرسائل حتى يتم تفعيل الحساب."
                : "Your subscription has not been activated yet. All channels (Telegram, WhatsApp, Messenger, Website Widget) will not respond to messages until an admin activates your account."}
            </p>
          </div>
        </div>
      )}



      {showQuotaBanner && quotaData && (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
          quotaData.warning === "exceeded"
            ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
            : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
        }`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            {quotaData.warning === "exceeded" ? (
              <>
                <p className="font-semibold">{lang === "ar" ? "تم استهلاك كامل حصة الرموز الشهرية" : "Monthly token quota exceeded"}</p>
                <p className="opacity-80">
                  {lang === "ar"
                    ? `استهلكت ${quotaData.usedTokens.toLocaleString()} من أصل ${quotaData.quota!.toLocaleString()} رمز هذا الشهر (${quotaData.percentUsed}%). قد تتوقف الردود حتى دورة الفوترة القادمة.`
                    : `You have used ${quotaData.usedTokens.toLocaleString()} of your ${quotaData.quota!.toLocaleString()} token quota this month (${quotaData.percentUsed}%). New chatbot messages may be blocked until the next billing cycle.`}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">{lang === "ar" ? "اقتربت من استهلاك حصة الرموز الشهرية" : "Approaching monthly token quota"}</p>
                <p className="opacity-80">
                  {lang === "ar"
                    ? `استهلكت ${quotaData.usedTokens.toLocaleString()} من أصل ${quotaData.quota!.toLocaleString()} رمز هذا الشهر (${quotaData.percentUsed}%).`
                    : `You have used ${quotaData.usedTokens.toLocaleString()} of your ${quotaData.quota!.toLocaleString()} token quota this month (${quotaData.percentUsed}%). Consider upgrading or reducing usage.`}
                </p>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1 shrink-0 text-xs font-medium">
            <Gauge className="w-3.5 h-3.5" />
            {quotaData.percentUsed}%
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                {t("company_info_card")}
              </CardTitle>
              <CardDescription>{lang === "ar" ? "الهوية الأساسية ومعلومات الشركة لتغذية البوت." : "Core identity of your chatbot."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("company_name_label")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="generalInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("company_general_info_label")}</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        className="bg-background min-h-[120px]" 
                        placeholder={t("company_general_info_placeholder")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
            </CardContent>
          </Card>

          {/* Dedicated AI Model & Provider Card */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/15 text-primary shrink-0 mt-0.5 sm:mt-0">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-foreground">
                    {lang === "ar" ? "نموذج ومزود الذكاء الاصطناعي" : "AI Model & Provider"}
                  </h3>
                  <Badge variant="outline" className="text-[11px] font-medium border-primary/30 text-primary">
                    {lang === "ar" ? "صفحة مخصصة في القائمة" : "Dedicated Page"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ar"
                    ? "تم نقل إعدادات مزود ونموذج الذكاء الاصطناعي، مفاتيح API، ونمط التشغيل (حصة المنصة أو المفتاح الخاص) إلى صفحتها المخصصة."
                    : "AI provider selection, smart model, API key credentials, and execution mode are now managed on the dedicated page."}
                </p>
              </div>
            </div>
            <Link href="/client/ai-model">
              <Button size="sm" className="gap-2 shrink-0">
                <Bot className="w-4 h-4" />
                {lang === "ar" ? "فتح صفحة الموديل والمزود ←" : "Configure AI Model →"}
              </Button>
            </Link>
          </div>

          <div className="flex justify-end pt-4 sticky bottom-6 z-10">
            <div className="bg-background/80 backdrop-blur-md p-2 rounded-full border border-border shadow-lg inline-block">
              <Button type="submit" size="lg" className="px-8 rounded-full shadow-[0_0_15px_rgba(var(--primary),0.3)]" disabled={isSaving}>
                {isSaving ? t("btn_saving") : t("btn_save_changes")}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      {company && company.telegramBotApiKey && (
        <Card className="bg-card border-[#DCE7FF] border-sky-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ChannelIcon channel="telegram" size={20} /> Telegram Bot Setup
            </CardTitle>
            <CardDescription>
              Your bot token is saved. You need to register the webhook once so Telegram knows where to send messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!company.isActive && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Activate your account first before registering — inactive bots will not reply.
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Telegram Webhook URL</p>
              <div className="relative group">
                <pre className="bg-muted/40 border border-border rounded-lg px-4 py-2.5 font-mono text-xs overflow-x-auto">
                  {`${window.location.origin}/api/telegram/webhook/${tgWebhookHash || "…"}`}
                </pre>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="absolute top-1.5 right-1.5 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/telegram/webhook/${tgWebhookHash}`);
                    toast({ title: "Copied!", description: "Webhook URL copied to clipboard." });
                  }}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                type="button"
                onClick={registerTelegramWebhook}
                disabled={tgRegistering || !company.isActive}
                className="bg-sky-500 hover:bg-sky-600 text-white gap-2 w-full sm:w-auto h-auto py-2 whitespace-normal"
                size="sm"
              >
                {tgRegistering ? (
                  <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> Registering…</>
                ) : (
                  <><Zap className="w-3.5 h-3.5" /> Register Webhook with Telegram</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Click once — this tells Telegram to forward all bot messages to your chatbot.
              </p>
            </div>

            {tgStatus && (
              <div className={`rounded-lg border px-3 py-2.5 text-sm ${tgStatus.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                {tgStatus.message}
              </div>
            )}

            <div className="rounded-lg border border-[#DCE7FF] bg-muted/20 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">How it works after registration:</p>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>① User sends a message to your Telegram bot</span>
                <span>② Telegram forwards it to your server automatically</span>
                <span>③ AI reads your System Prompt + Website Data and replies</span>
                <span>④ Response is sent back to the user in Telegram</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {company && company.messengerApiKey && (
        <MessengerSetupCard company={company} />
      )}

      {company && company.whatsappApiToken && company.whatsappPhoneNumberId && (
        <WhatsAppSetupCard company={company} />
      )}

      {company && hasConnectedChannel && (
        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              How It All Works
            </CardTitle>
            <CardDescription>
              Everything you configure here powers your chatbot across all channels.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Architecture flow */}
            <div className="rounded-xl border border-[#DCE7FF] bg-muted/20 p-4 space-y-3">
              {/* Row 1: Inputs */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {lang === "ar" ? "مصادر المعرفة والبيانات" : "Knowledge & Data Sources"}
              </p>
              <div className="grid grid-cols-2 min-[500px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-center text-xs">
                {/* 1. System Prompt */}
                <div className={`rounded-lg border p-2.5 space-y-1 transition-all ${company.systemPrompt ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background"}`}>
                  <div className="text-base">📝</div>
                  <div className="font-medium truncate">{lang === "ar" ? "التعليمات" : "System Prompt"}</div>
                  <div className={`text-[10px] ${company.systemPrompt ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    {company.systemPrompt ? (lang === "ar" ? "✓ مفعّل" : "✓ Configured") : (lang === "ar" ? "غير محدد" : "Not set")}
                  </div>
                </div>

                {/* 2. Website Data URL */}
                <Link href={allowWebsite ? "/client/knowledge?source=website" : "#"} className={`block h-full group ${!allowWebsite ? "pointer-events-none" : ""}`}>
                  <div className={`rounded-lg border p-2.5 space-y-1 transition-all h-full ${
                    !allowWebsite
                      ? "border-amber-500/30 bg-amber-500/5 opacity-80"
                      : "group-hover:border-primary/60 cursor-pointer " + (company.websiteDataUrl ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background")
                  }`}>
                    <div className="text-base relative inline-block">
                      🌐
                      {!allowWebsite && <Lock className="w-3 h-3 text-amber-500 absolute -bottom-1 -right-1" />}
                    </div>
                    <div className="font-medium truncate">{lang === "ar" ? "رابط الموقع" : "Website URL"}</div>
                    <div className={`text-[10px] ${
                      !allowWebsite
                        ? "text-amber-500 font-medium"
                        : company.websiteDataUrl
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    }`}>
                      {!allowWebsite
                        ? (lang === "ar" ? "🔒 مقفل" : "🔒 Locked")
                        : company.websiteDataUrl
                        ? (lang === "ar" ? "✓ مفعّل" : "✓ Configured")
                        : (lang === "ar" ? "غير محدد" : "Not set")}
                    </div>
                  </div>
                </Link>

                {/* 3. Uploaded Files */}
                <Link href={allowFiles ? "/client/knowledge?source=files" : "#"} className={`block h-full group ${!allowFiles ? "pointer-events-none" : ""}`}>
                  <div className={`rounded-lg border p-2.5 space-y-1 transition-all h-full ${
                    !allowFiles
                      ? "border-amber-500/30 bg-amber-500/5 opacity-80"
                      : "group-hover:border-primary/60 cursor-pointer " + ((knowledgeFiles?.length ?? 0) > 0 ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background")
                  }`}>
                    <div className="text-base relative inline-block">
                      📁
                      {!allowFiles && <Lock className="w-3 h-3 text-amber-500 absolute -bottom-1 -right-1" />}
                    </div>
                    <div className="font-medium truncate">{lang === "ar" ? "الملفات" : "Files"}</div>
                    <div className={`text-[10px] ${
                      !allowFiles
                        ? "text-amber-500 font-medium"
                        : (knowledgeFiles?.length ?? 0) > 0
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    }`}>
                      {!allowFiles
                        ? (lang === "ar" ? "🔒 مقفل" : "🔒 Locked")
                        : (knowledgeFiles?.length ?? 0) > 0
                        ? (lang === "ar" ? `✓ ${knowledgeFiles?.length} ملفات` : `✓ ${knowledgeFiles?.length} files`)
                        : (lang === "ar" ? "لا يوجد" : "None")}
                    </div>
                  </div>
                </Link>

                {/* 4. WordPress */}
                <Link href={allowWordpress ? "/client/knowledge?source=wordpress" : "#"} className={`block h-full group ${!allowWordpress ? "pointer-events-none" : ""}`}>
                  <div className={`rounded-lg border p-2.5 space-y-1 transition-all h-full ${
                    !allowWordpress
                      ? "border-amber-500/30 bg-amber-500/5 opacity-80"
                      : "group-hover:border-primary/60 cursor-pointer " + (
                          wpIntegration?.status === "connected" ? "border-primary/40 bg-primary/5"
                          : wpIntegration?.status === "error" ? "border-red-500/40 bg-red-500/5"
                          : "border-border/40 bg-background"
                        )
                  }`}>
                    <div className="text-base relative inline-block">
                      🔌
                      {!allowWordpress && <Lock className="w-3 h-3 text-amber-500 absolute -bottom-1 -right-1" />}
                    </div>
                    <div className="font-medium truncate">WordPress</div>
                    <div className={`text-[10px] ${
                      !allowWordpress
                        ? "text-amber-500 font-medium"
                        : wpIntegration?.status === "connected"
                        ? "text-primary font-medium"
                        : wpIntegration?.status === "error"
                        ? "text-red-500 font-medium"
                        : "text-muted-foreground"
                    }`}>
                      {!allowWordpress
                        ? (lang === "ar" ? "🔒 مقفل" : "🔒 Locked")
                        : wpIntegration?.status === "connected"
                        ? (lang === "ar" ? `✓ ${wpIntegration.totalItems} عنصر` : `✓ ${wpIntegration.totalItems} items`)
                        : wpIntegration?.status === "error"
                        ? (lang === "ar" ? "⚠ خطأ" : "⚠ Error")
                        : wpIntegration?.status === "pending"
                        ? (lang === "ar" ? "قيد الانتظار…" : "Pending…")
                        : (lang === "ar" ? "غير متصل" : "Not connected")}
                    </div>
                  </div>
                </Link>

                {/* 5. REST API */}
                <Link href={allowRestApi ? "/client/knowledge?source=restapi" : "#"} className={`block h-full group ${!allowRestApi ? "pointer-events-none" : ""}`}>
                  <div className={`rounded-lg border p-2.5 space-y-1 transition-all h-full ${
                    !allowRestApi
                      ? "border-amber-500/30 bg-amber-500/5 opacity-80"
                      : "group-hover:border-primary/60 cursor-pointer " + (
                          restApiIntegration?.status === "connected" ? "border-primary/40 bg-primary/5"
                          : restApiIntegration?.status === "error" ? "border-red-500/40 bg-red-500/5"
                          : "border-border/40 bg-background"
                        )
                  }`}>
                    <div className="text-base relative inline-block">
                      💻
                      {!allowRestApi && <Lock className="w-3 h-3 text-amber-500 absolute -bottom-1 -right-1" />}
                    </div>
                    <div className="font-medium truncate">REST API</div>
                    <div className={`text-[10px] ${
                      !allowRestApi
                        ? "text-amber-500 font-medium"
                        : restApiIntegration?.status === "connected"
                        ? "text-primary font-medium"
                        : restApiIntegration?.status === "error"
                        ? "text-red-500 font-medium"
                        : "text-muted-foreground"
                    }`}>
                      {!allowRestApi
                        ? (lang === "ar" ? "🔒 مقفل" : "🔒 Locked")
                        : restApiIntegration?.status === "connected"
                        ? (lang === "ar" ? "✓ متصل" : "✓ Connected")
                        : restApiIntegration?.status === "error"
                        ? (lang === "ar" ? "⚠ خطأ" : "⚠ Error")
                        : restApiIntegration?.status === "pending"
                        ? (lang === "ar" ? "قيد الانتظار…" : "Pending…")
                        : (lang === "ar" ? "غير مهيأ" : "Not set")}
                    </div>
                  </div>
                </Link>

                {/* 6. Shopify Store */}
                <Link href={allowShopify ? "/client/knowledge?source=shopify" : "#"} className={`block h-full group ${!allowShopify ? "pointer-events-none" : ""}`}>
                  <div className={`rounded-lg border p-2.5 space-y-1 transition-all h-full ${
                    !allowShopify
                      ? "border-amber-500/30 bg-amber-500/5 opacity-80"
                      : "group-hover:border-primary/60 cursor-pointer " + (
                          shopifyIntegration?.status === "connected" ? "border-primary/40 bg-primary/5"
                          : shopifyIntegration?.status === "error" ? "border-red-500/40 bg-red-500/5"
                          : "border-border/40 bg-background"
                        )
                  }`}>
                    <div className="text-base relative inline-block">
                      🛍️
                      {!allowShopify && <Lock className="w-3 h-3 text-amber-500 absolute -bottom-1 -right-1" />}
                    </div>
                    <div className="font-medium truncate">Shopify</div>
                    <div className={`text-[10px] ${
                      !allowShopify
                        ? "text-amber-500 font-medium"
                        : shopifyIntegration?.status === "connected"
                        ? "text-primary font-medium"
                        : shopifyIntegration?.status === "error"
                        ? "text-red-500 font-medium"
                        : "text-muted-foreground"
                    }`}>
                      {!allowShopify
                        ? (lang === "ar" ? "🔒 مقفل" : "🔒 Locked")
                        : shopifyIntegration?.status === "connected"
                        ? (shopifyIntegration.totalItems > 0
                            ? (lang === "ar" ? `✓ ${shopifyIntegration.totalItems} منتج` : `✓ ${shopifyIntegration.totalItems} items`)
                            : (lang === "ar" ? "✓ متصل" : "✓ Connected"))
                        : shopifyIntegration?.status === "error"
                        ? (lang === "ar" ? "⚠ خطأ" : "⚠ Error")
                        : shopifyIntegration?.status === "pending"
                        ? (lang === "ar" ? "قيد الانتظار…" : "Pending…")
                        : (lang === "ar" ? "غير متصل" : "Not connected")}
                    </div>
                  </div>
                </Link>
              </div>

              {/* Arrow */}
              <div className="flex justify-center text-muted-foreground text-lg">↓</div>

              {/* AI Engine */}
              {(() => {
                const isQuotaMode = currentExecutionMode === "quota";
                const quotaProvider = (company as any)?.quotaAiProvider || (aiStatus?.mode === "quota" ? aiStatus?.provider : null) || (quotaData as any)?.provider || "openrouter";
                let rawQuotaModel = (company as any)?.quotaAiModel || (aiStatus?.mode === "quota" ? aiStatus?.model : null) || (quotaData as any)?.model || "nvidia/nemotron-3.5-lightning:free";
                if (rawQuotaModel?.includes("nemotron-nano")) {
                  rawQuotaModel = "nvidia/nemotron-3.5-lightning:free";
                }
                const quotaModel = rawQuotaModel;

                const ownProvider = company?.aiProvider || "openai";
                let rawOwnModel = company?.aiModel || "";
                if (rawOwnModel?.includes("nemotron-nano")) {
                  rawOwnModel = "nvidia/nemotron-3.5-lightning:free";
                }
                const ownModel = rawOwnModel;
                const hasOwnKey = Boolean(company?.aiAgentApiKey);

                const activeProvider = isQuotaMode ? quotaProvider : (hasOwnKey ? ownProvider : null);
                const activeModel = isQuotaMode ? quotaModel : (hasOwnKey ? (ownModel || (lang === "ar" ? "النموذج الافتراضي" : "Default Model")) : null);
                const isEngineReady = isQuotaMode
                  ? (aiStatus?.status === "ok" || (Boolean(quotaData?.quota) && Number(quotaData?.quota) > 0))
                  : (hasOwnKey && Boolean(ownProvider));

                return (
                  <Link href="/client/ai-model" className="block group">
                    <div className={`rounded-xl border p-3.5 transition-all group-hover:border-primary/60 cursor-pointer ${
                      isEngineReady
                        ? (isQuotaMode ? "border-amber-500/40 bg-amber-500/5" : "border-blue-500/40 bg-blue-500/5")
                        : "border-destructive/40 bg-destructive/5"
                    }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl shrink-0">🤖</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">
                            {lang === "ar" ? "محرك الذكاء الاصطناعي" : "AI Engine"}
                          </p>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                            isQuotaMode
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                              : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                          }`}>
                            {isQuotaMode
                              ? (lang === "ar" ? "حصة المنصة" : "Platform Quota")
                              : (lang === "ar" ? "مفتاح خاص" : "Company API Key")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                          {activeProvider && activeModel
                            ? `${activeProvider.toUpperCase()} · ${activeModel}`
                            : !hasOwnKey && !isQuotaMode
                            ? (lang === "ar" ? "⚠️ لم يتم إدخال مفتاح API — يرجى التهيئة أعلاه" : "⚠️ No API key — configure AI Provider above")
                            : (lang === "ar" ? "جاري تعيين النموذج..." : "Configuring model...")}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                        isEngineReady
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}>
                        {isEngineReady
                          ? (lang === "ar" ? "نشط" : "Active")
                          : (lang === "ar" ? "بحاجة لإعداد" : "Needs setup")}
                      </span>
                    </div>

                    {/* Breakdown of both models: Platform Quota vs Company API Key */}
                    <div className="mt-3 pt-3 border-t border-[#DCE7FF] grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {/* Platform Quota Box */}
                      <div className={`p-2.5 rounded-lg border transition-all ${
                        isQuotaMode
                          ? "bg-amber-500/10 border-amber-500/40 shadow-sm"
                          : "bg-muted/20 border-border/40 opacity-75"
                      }`}>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-semibold flex items-center gap-1.5 text-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            {lang === "ar" ? "حصة المنصة" : "Platform Quota"}
                          </span>
                          {isQuotaMode ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-700 dark:text-amber-300">
                              {lang === "ar" ? "الوضع الحالي" : "Active Now"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {lang === "ar" ? "وضع بديل" : "Standby"}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] truncate font-medium text-foreground/90">
                          {quotaProvider.toUpperCase()} · {quotaModel}
                        </div>
                      </div>

                      {/* Company's Own Key Box */}
                      <div className={`p-2.5 rounded-lg border transition-all ${
                        !isQuotaMode
                          ? "bg-blue-500/10 border-blue-500/40 shadow-sm"
                          : "bg-muted/20 border-border/40 opacity-75"
                      }`}>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-semibold flex items-center gap-1.5 text-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            {lang === "ar" ? "مفتاح الشركة" : "Company API Key"}
                          </span>
                          {!isQuotaMode ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-700 dark:text-blue-300">
                              {lang === "ar" ? "الوضع الحالي" : "Active Now"}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              {lang === "ar" ? "وضع بديل" : "Standby"}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] truncate font-medium text-foreground/90">
                          {hasOwnKey
                            ? `${ownProvider.toUpperCase()} · ${ownModel || (lang === "ar" ? "النموذج الافتراضي" : "Default Model")}`
                            : (lang === "ar" ? "لم يُدخل مفتاح خاص" : "No key configured")}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
              })()}

              {/* Arrow */}
              <div className="flex justify-center text-muted-foreground text-lg">↓</div>

              {/* Channels */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Channels</p>
              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className={`rounded-lg border p-2.5 space-y-1 ${telegramConnected ? "border-sky-500/40 bg-sky-500/5" : "border-border/40 bg-background"}`}>
                  <div className="text-base">✈️</div>
                  <div className="font-medium">Telegram</div>
                  <div className={`text-[10px] ${telegramConnected ? "text-sky-500" : "text-muted-foreground"}`}>
                    {telegramConnected ? "✓ Active" : "Not set"}
                  </div>
                </div>
                <div className={`rounded-lg border p-2.5 space-y-1 ${whatsappConnected ? "border-green-500/40 bg-green-500/5" : "border-border/40 bg-background"}`}>
                  <div className="text-base">💬</div>
                  <div className="font-medium">WhatsApp</div>
                  <div className={`text-[10px] ${whatsappConnected ? "text-green-500" : "text-muted-foreground"}`}>
                    {whatsappConnected ? "✓ Active" : "Not set"}
                  </div>
                </div>
                <div className={`rounded-lg border p-2.5 space-y-1 ${messengerConnected ? "border-blue-500/40 bg-blue-500/5" : "border-border/40 bg-background"}`}>
                  <div className="text-base">📨</div>
                  <div className="font-medium">Messenger</div>
                  <div className={`text-[10px] ${messengerConnected ? "text-blue-500" : "text-muted-foreground"}`}>
                    {messengerConnected ? "✓ Active" : "Not set"}
                  </div>
                </div>
                <div className={`rounded-lg border p-2.5 space-y-1 ${widgetConnected ? "border-violet-500/40 bg-violet-500/5" : "border-border/40 bg-background"}`}>
                  <div className="text-base">🌐</div>
                  <div className="font-medium">Website Widget</div>
                  <div className={`text-[10px] ${widgetConnected ? "text-violet-500" : "text-muted-foreground"}`}>
                    {widgetConnected ? "✓ Ready to embed" : "No key set"}
                  </div>
                </div>
              </div>
            </div>

            {/* Embed code */}
            {company.websiteChatbotKey ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <span className="text-violet-500">🌐</span> Website Widget Embed Code
                </p>
                <p className="text-xs text-muted-foreground">
                  Paste this tag anywhere in your website's HTML — it creates a floating chat button automatically.
                </p>

                <div className="relative group">
                  <pre className="bg-background text-foreground p-3 rounded-lg overflow-x-auto border border-violet-500/30 font-mono text-[11px] leading-relaxed shadow-inner">
{`<script
  src="${window.location.origin}/api/widget.js"
  data-key="${company.websiteChatbotKey}"
></script>`}
                  </pre>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute top-1.5 right-1.5 h-7 px-2.5 text-xs opacity-100 shadow-sm"
                    aria-label="Copy Website Widget embed code"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `<script\n  src="${window.location.origin}/api/widget.js"\n  data-key="${company.websiteChatbotKey}"\n></script>`
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-violet-500"></span>
                  The widget reads your System Prompt, Website Data, and AI settings — fully automatic.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-600 dark:text-amber-400">
                ⚠️ Set a <strong>Website Widget Key</strong> in the Channels section above to generate your embed code.
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {company && hasShareableChannel && (() => {
        const telegramLink = shareTelegramLink;
        const whatsappLink = shareWhatsappLink;
        const messengerLink = shareMessengerLink;
        const hasWebsite = shareWebsite;
        const fabPositionX = Math.min(96, Math.max(4, company.fabPositionX ?? 96));
        const fabPositionY = Math.min(94, Math.max(6, company.fabPositionY ?? 92));
        const fabVerticalClass = fabPositionY < 38 ? "cfab-down" : "";
        const fabHorizontalClass = fabPositionX < 50 ? "cfab-left" : "cfab-right";

        const COLOR_CLASSES: Record<string, string> = {
          sky: "border-sky-500/40 bg-sky-500/5 hover:bg-sky-500/10",
          green: "border-green-500/40 bg-green-500/5 hover:bg-green-500/10",
          blue: "border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10",
          violet: "border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/10",
        };

        const icons = [
          { key: "telegram",  channel: "telegram"  as const, label: "Telegram",     href: telegramLink,  color: "sky",    isWidget: false },
          { key: "whatsapp",  channel: "whatsapp"  as const, label: "WhatsApp",     href: whatsappLink,  color: "green",  isWidget: false },
          { key: "messenger", channel: "messenger" as const, label: "Messenger",    href: messengerLink, color: "blue",   isWidget: false },
          { key: "website",   channel: "widget"    as const, label: "Website Chat", href: null,          color: "violet", isWidget: hasWebsite },
        ];

        // Standard snippet (static icon links)
        const standardLines: string[] = [`<div class="chatbot-links" style="display:flex;gap:12px;">`];
        if (telegramLink) standardLines.push(`  <a href="${telegramLink}" target="_blank" rel="noopener" title="Chat on Telegram" style="display:inline-flex;text-decoration:none;">${CHANNEL_SVG_SNIPPETS.telegram}</a>`);
        if (whatsappLink) standardLines.push(`  <a href="${whatsappLink}" target="_blank" rel="noopener" title="Chat on WhatsApp" style="display:inline-flex;text-decoration:none;">${CHANNEL_SVG_SNIPPETS.whatsapp}</a>`);
        if (messengerLink) standardLines.push(`  <a href="${messengerLink}" target="_blank" rel="noopener" title="Chat on Messenger" style="display:inline-flex;text-decoration:none;">${CHANNEL_SVG_SNIPPETS.messenger}</a>`);
        if (hasWebsite) standardLines.push(`  <a href="#" onclick="window.ChatWidget && window.ChatWidget.open('${company.websiteChatbotKey}'); return false;" title="Chat on our website" style="display:inline-flex;text-decoration:none;">${CHANNEL_SVG_SNIPPETS.widget}</a>`);
        standardLines.push(`</div>`);

        // FAB snippet (floating action button) — self-contained HTML + scoped CSS + vanilla JS
        const fabRows: string[] = [];
        if (telegramLink)  fabRows.push(`    <div class="cfab-row" role="listitem">\n      <button class="cfab-item" type="button" onclick="window.open('${telegramLink}','_blank','noopener noreferrer')" aria-label="Chat on Telegram">${CHANNEL_SVG_SNIPPETS.telegram}</button>\n    </div>`);
        if (whatsappLink)  fabRows.push(`    <div class="cfab-row" role="listitem">\n      <button class="cfab-item" type="button" onclick="window.open('${whatsappLink}','_blank','noopener noreferrer')" aria-label="Chat on WhatsApp">${CHANNEL_SVG_SNIPPETS.whatsapp}</button>\n    </div>`);
        if (messengerLink) fabRows.push(`    <div class="cfab-row" role="listitem">\n      <button class="cfab-item" type="button" onclick="window.open('${messengerLink}','_blank','noopener noreferrer')" aria-label="Chat on Messenger">${CHANNEL_SVG_SNIPPETS.messenger}</button>\n    </div>`);
        if (hasWebsite)    fabRows.push(`    <div class="cfab-row" role="listitem">\n      <button class="cfab-item" type="button" onclick="window.ChatWidget&&window.ChatWidget.open('${company.websiteChatbotKey}')" aria-label="Open website chat">${CHANNEL_SVG_SNIPPETS.widget}</button>\n    </div>`);

        const fabSnippet = `<!-- Chatbot FAB Widget -->
<style>
#cfab{position:fixed;left:0;top:0;transform:translate(-50%,-50%);z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:5px;}
#cfab-btn{position:relative;width:48px;height:48px;border-radius:50%;background:#7c3aed;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(124,58,237,.5);transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;outline:none;flex-shrink:0;}
#cfab-btn:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(124,58,237,.65);}
#cfab-btn:focus-visible{outline:2px solid rgba(124,58,237,.7);outline-offset:2px;}
.cfab-icon{transition:transform .3s cubic-bezier(.34,1.56,.64,1);display:block;}
#cfab-btn[data-open="1"] .cfab-icon{transform:rotate(45deg);}
#cfab-pulse{position:absolute;inset:0;border-radius:50%;background:#7c3aed;animation:cfab-pulse 2.2s ease-out infinite;pointer-events:none;}
@keyframes cfab-pulse{0%{opacity:.38;transform:scale(1)}65%{opacity:0;transform:scale(1.7)}100%{opacity:0;transform:scale(1.7)}}
#cfab-menu{display:flex;flex-direction:column;gap:5px;align-items:flex-end;}
#cfab.cfab-down{flex-direction:column-reverse;}
#cfab.cfab-left,#cfab.cfab-left #cfab-menu{align-items:flex-start;}
#cfab.cfab-center,#cfab.cfab-center #cfab-menu{align-items:center;}
.cfab-row{display:flex;align-items:center;justify-content:flex-end;opacity:0;transform:translateY(10px) scale(.88);pointer-events:none;transition:opacity .18s ease,transform .22s cubic-bezier(.34,1.56,.64,1);}
.cfab-row.cfab-on{opacity:1;transform:none;pointer-events:auto;}
.cfab-item{width:38px;height:38px;border-radius:50%;border:none;background:transparent;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,.22);transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;}
.cfab-item:hover{transform:scale(1.12);box-shadow:0 5px 16px rgba(0,0,0,.32);}
.cfab-item:focus-visible{outline:2px solid rgba(255,255,255,.9);outline-offset:2px;border-radius:50%;}
@media(max-width:500px){.cfab-item{width:34px;height:34px;}#cfab-btn{width:44px;height:44px;}}
</style>
<div id="cfab" class="${fabVerticalClass} ${fabHorizontalClass}" role="complementary" aria-label="Chat support options">
  <div id="cfab-menu" role="list" aria-label="Chat channels">
${fabRows.join('\n')}
  </div>
  <button id="cfab-btn" data-open="0" type="button" aria-label="Open chat menu" aria-haspopup="true" aria-expanded="false" aria-controls="cfab-menu">
    <span id="cfab-pulse" aria-hidden="true"></span>
    <svg class="cfab-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</div>
<script>
(function(){
  var btn=document.getElementById('cfab-btn'),
      menu=document.getElementById('cfab-menu'),
      pulse=document.getElementById('cfab-pulse'),
      root=document.getElementById('cfab'),
      fabX=${fabPositionX},
      fabY=${fabPositionY};
  function positionFab(){
    var vw=window.innerWidth, vh=window.innerHeight,
        edgeX=Math.min(44,vw/2), edgeY=Math.min(44,vh/2);
     if(vw>=768){
       root.style.left=fabX<50?'20px':'auto';
       root.style.right=fabX>=50?'20px':'auto';
     } else {
       root.style.left=(edgeX+Math.max(0,vw-edgeX*2)*(fabX/100))+'px';
       root.style.right='auto';
     }
    root.style.top=(edgeY+Math.max(0,vh-edgeY*2)*(fabY/100))+'px';
  }
  positionFab();
  window.addEventListener('resize',positionFab);
  function getRows(){ return Array.from(menu.querySelectorAll('.cfab-row')); }
  function openMenu(){
    btn.dataset.open='1'; btn.setAttribute('aria-expanded','true');
    if(pulse) pulse.style.display='none';
    getRows().forEach(function(r,i){
      r.style.transitionDelay=(i*65)+'ms';
      setTimeout(function(){ r.classList.add('cfab-on'); },10);
    });
  }
  function closeMenu(){
    btn.dataset.open='0'; btn.setAttribute('aria-expanded','false');
    if(pulse) pulse.style.display='';
    getRows().forEach(function(r){ r.style.transitionDelay='0ms'; r.classList.remove('cfab-on'); });
  }
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    btn.dataset.open==='1' ? closeMenu() : openMenu();
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&btn.dataset.open==='1'){ closeMenu(); btn.focus(); }
  });
  document.addEventListener('click',function(e){
    var f=document.getElementById('cfab');
    if(btn.dataset.open==='1'&&f&&!f.contains(e.target)) closeMenu();
  });
  if(document.dir==='rtl'||document.documentElement.dir==='rtl'){
    getRows().forEach(function(r){ r.style.flexDirection='row-reverse'; });
  }
})();
</script>`;

        const snippet = company.fabEnabled ? fabSnippet : standardLines.join("\n");

        return (
          <Card className="bg-card border-[#DCE7FF] border-emerald-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-500" />
                Share Your Chatbot
              </CardTitle>
              <CardDescription>
                Clickable icons for your own website — each one opens a chat with your bot on that channel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {icons.map((icon) => {
                  const enabled = icon.isWidget ? true : !!icon.href;
                  const content = (
                    <div
                      className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2 min-w-[76px] transition-colors ${
                        enabled
                          ? `${COLOR_CLASSES[icon.color]} cursor-pointer`
                          : "border-border/40 bg-background opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <ChannelIcon channel={icon.channel} size={22} />
                      <span className="text-xs font-medium">{icon.label}</span>
                      {!enabled && <span className="text-[10px] text-muted-foreground">Not set up</span>}
                    </div>
                  );
                  if (icon.key === "website") {
                    return (
                      <div
                        key={icon.key}
                        onClick={() => {
                          if (!hasWebsite) return;
                          toast({ title: "Website icon", description: "On your live site, this icon opens the embedded chat widget directly. Nothing to preview here in the admin panel." });
                        }}
                      >
                        {content}
                      </div>
                    );
                  }
                  return icon.href ? (
                    <a key={icon.key} href={icon.href} target="_blank" rel="noopener noreferrer">
                      {content}
                    </a>
                  ) : (
                    <div key={icon.key}>{content}</div>
                  );
                })}
              </div>

              {(!telegramLink || !whatsappLink || !messengerLink || !hasWebsite) && (
                <p className="text-xs text-muted-foreground">
                  {!telegramLink && "Set a Telegram Bot Token above (username is fetched automatically). "}
                  {!whatsappLink && "Set a WhatsApp Number above. "}
                  {!messengerLink && "Set a Messenger Page Access Token above (page ID is fetched automatically). "}
                  {!hasWebsite && "Set a Website Widget Key above."}
                </p>
              )}


              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Embed Snippet</p>
                 <p className="text-xs text-muted-foreground">
                  {company.fabEnabled
                     ? <>Paste this on your website — the purple FAB button displays the configured channels when clicked. If Website Chat is included, also embed the Website Widget script on the same page so <code className="bg-muted px-1 rounded">window.ChatWidget</code> exists.</>
                    : <>Paste this anywhere on your website to show the icons above. If you include the website icon, also embed the Website Widget script (see above) on the same page so <code className="bg-muted px-1 rounded">window.ChatWidget</code> exists.</>
                  }
                </p>
                <div className="relative group">
                  <pre className="bg-background text-foreground p-3 max-h-[200px] rounded-lg overflow-x-auto border border-emerald-500/30 font-mono text-[11px] leading-relaxed shadow-inner whitespace-pre-wrap">
                    {snippet}
                  </pre>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute top-1.5 right-1.5 h-7 px-2.5 text-xs opacity-100 shadow-sm"
                    aria-label={company.fabEnabled ? "Copy FAB Widget embed code" : "Copy chatbot links embed code"}
                    onClick={() => {
                      navigator.clipboard.writeText(snippet);
                      setCopiedShare(true);
                      setTimeout(() => setCopiedShare(false), 2000);
                    }}
                  >
                    {copiedShare ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copiedShare ? "Copied!" : company.fabEnabled ? "Copy FAB Code" : "Copy Code"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

    </div>

    {/* ── Real fixed FAB overlay — visible on the page when enabled ── */}
    {company?.fabEnabled && hasShareableChannel && (() => {
      const telegramLink  = shareTelegramLink;
      const whatsappLink  = shareWhatsappLink;
      const messengerLink = shareMessengerLink;
      const hasWebsite    = shareWebsite;

      const channels = [
        telegramLink  && { key: "telegram",  channel: "telegram"  as const, label: "Telegram",     href: telegramLink  },
        whatsappLink  && { key: "whatsapp",  channel: "whatsapp"  as const, label: "WhatsApp",     href: whatsappLink  },
        messengerLink && { key: "messenger", channel: "messenger" as const, label: "Messenger",    href: messengerLink },
        hasWebsite    && { key: "website",   channel: "widget"    as const, label: "Website Chat", href: null          },
      ].filter(Boolean) as { key: string; channel: "telegram" | "whatsapp" | "messenger" | "widget"; label: string; href: string | null }[];

      return (
        <>
          {/* backdrop — closes the menu on outside click */}
          {fabOpen && (
            <div
              className="fixed inset-0"
              style={{ zIndex: 2147483645 }}
              onClick={() => setFabOpen(false)}
            />
          )}

          <div
            ref={fabOverlayRef}
            className="fixed flex flex-col items-end gap-1.5"
            style={{
              left: `${Math.min(96, Math.max(4, company.fabPositionX ?? 96))}%`,
              top: `${Math.min(94, Math.max(6, company.fabPositionY ?? 92))}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 2147483646,
            }}
          >
            {/* Channel rows — icons only, opening upward */}
            {channels.map((ch, i) => (
              <div
                key={ch.key}
                className="flex items-center gap-2 justify-end"
                style={{
                  opacity: fabOpen ? 1 : 0,
                  transform: fabOpen ? "translateY(0) scale(1)" : "translateY(10px) scale(0.88)",
                  transition: `opacity .18s ease ${fabOpen ? i * 60 : 0}ms, transform .22s cubic-bezier(.34,1.56,.64,1) ${fabOpen ? i * 60 : 0}ms`,
                  pointerEvents: fabOpen ? "auto" : "none",
                }}
              >
                {/* Channel button */}
                <button
                  aria-label={ch.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (ch.href) window.open(ch.href, "_blank", "noopener noreferrer");
                    else toast({ title: "Website Chat", description: "On your live site this opens the embedded widget." });
                  }}
                  className="transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-white focus-visible:outline-offset-2 rounded-full flex-shrink-0"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 3px 12px rgba(0,0,0,.25)",
                    background: "transparent",
                  }}
                >
                  <ChannelIcon channel={ch.channel} size={30} />
                </button>
              </div>
            ))}

            {/* Main FAB trigger */}
            <div className="relative flex-shrink-0">
              {/* Pulse ring — idle only */}
              {!fabOpen && (
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "#7c3aed",
                    animation: "cfab-admin-pulse 2.2s ease-out infinite",
                    pointerEvents: "none",
                  }}
                />
              )}
              <style>{`@keyframes cfab-admin-pulse{0%{opacity:.38;transform:scale(1)}65%{opacity:0;transform:scale(1.7)}100%{opacity:0;transform:scale(1.7)}}`}</style>
              <button
                onClick={(e) => { e.stopPropagation(); setFabOpen((v) => !v); }}
                aria-label={fabOpen ? "Close chat menu" : "Open chat menu"}
                aria-expanded={fabOpen}
                className="relative flex items-center justify-center rounded-full border-none cursor-pointer transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2"
                style={{
                  width: 48,
                  height: 48,
                  background: "#7c3aed",
                  boxShadow: "0 5px 20px rgba(124,58,237,.5)",
                  transform: fabOpen ? "rotate(45deg) scale(1.06)" : "rotate(0) scale(1)",
                  transition: "transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .2s",
                  outline: "none",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </>
      );
    })()}
    </>
  );
}
