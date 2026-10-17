import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Copy, Check, Info, Bot, MessageCircle, Zap, Database, FileSpreadsheet, KeyRound, Lock, Eye, EyeOff, UserRound, ChevronDown, AlertTriangle, Gauge, Send, RotateCcw, Upload, Trash2, FileText, FileJson, Link2, Loader2, Sheet as SheetIcon, ExternalLink, Globe, Plug, Sparkles, FolderDown, Mail, Coins, SlidersHorizontal } from "lucide-react";

/** Compute the same SHA-256 based webhook secret as the backend (first 32 hex chars). */
async function telegramWebhookSecret(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
import {
  useGetClientCompany, useCreateClientCompany, useUpdateClientCompany, useTestClientGoogleSheetConnection,
  useListClientKnowledgeFiles, useCreateClientKnowledgeFile, useDeleteClientKnowledgeFile,
  getGetClientCompanyQueryKey, getListClientKnowledgeFilesQueryKey, customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { mergeDynamicModels, type AiModelCatalogResponse } from "@/lib/ai-models";

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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";

const AI_PROVIDERS = {
  openai: {
    label: "OpenAI",
    icon: "🟢",
    keyLabel: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
    keyLink: "https://platform.openai.com/api-keys",
    freeTier: "Free trial credits available on sign-up",
    hasFreeTier: true,
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o mini ⭐ Recommended (fast & affordable)", free: true },
      { value: "gpt-4o", label: "GPT-4o (most capable)", free: false },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (legacy, cheapest)", free: true },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo", free: false },
    ],
  },
  anthropic: {
    label: "Anthropic",
    icon: "🟠",
    keyLabel: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
    keyLink: "https://console.anthropic.com/settings/keys",
    freeTier: "Free tier: $5 credit on sign-up",
    hasFreeTier: true,
    models: [
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku ⭐ Recommended (fast & affordable)", free: true },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (balanced)", free: false },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus (most capable)", free: false },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (cheapest)", free: true },
    ],
  },
  google: {
    label: "Google Gemini",
    icon: "🔵",
    keyLabel: "GOOGLE_AI_API_KEY",
    keyPlaceholder: "AIza...",
    keyLink: "https://aistudio.google.com/app/apikey",
    freeTier: "Free tier: Generous free quota (no credit card needed)",
    hasFreeTier: true,
    models: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash ⭐ Recommended (free tier, fast)", free: true },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (free tier)", free: true },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (higher limits)", free: false },
      { value: "gemini-pro", label: "Gemini Pro (legacy)", free: false },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", free: false },
      { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash", free: false },
      { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", free: false },
      { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash", free: false },
      { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro", free: false },
      { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", free: false },
      { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", free: false },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    icon: "🟣",
    keyLabel: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-v1-...",
    keyLink: "https://openrouter.ai/keys",
    freeTier: "Free models available — no credit card required for free tier",
    hasFreeTier: true,
    models: [
      // ── Free models ─────────────────────────────────────────────────────────
      { value: "google/gemma-4-31b-it:free",           label: "Google Gemma 4 31B ⭐ Recommended",     free: true  },
      { value: "meta-llama/llama-4-scout:free",         label: "Meta Llama 4 Scout",                   free: true  },
      { value: "meta-llama/llama-4-maverick:free",      label: "Meta Llama 4 Maverick",                free: true  },
      { value: "deepseek/deepseek-r1:free",             label: "DeepSeek R1 (reasoning)",              free: true  },
      { value: "deepseek/deepseek-v3-base:free",        label: "DeepSeek V3 Base",                     free: true  },
      { value: "qwen/qwen3-8b:free",                    label: "Qwen3 8B",                             free: true  },
      { value: "mistralai/mistral-7b-instruct:free",    label: "Mistral 7B Instruct",                  free: true  },
      { value: "meta-llama/llama-3.1-8b-instruct:free", label: "Meta Llama 3.1 8B Instruct",           free: true  },
      { value: "nvidia/nemotron-3-super-120b-a12b:free", label: "NVIDIA Nemotron Super 120B",          free: true  },
      { value: "openai/gpt-oss-20b:free",                label: "OpenAI OSS 20B",                     free: true  },
      { value: "nvidia/nemotron-nano-9b-v2:free",        label: "NVIDIA Nemotron Nano 9B",             free: true  },
      // ── Paid models ─────────────────────────────────────────────────────────
      { value: "deepseek/deepseek-v4-flash",            label: "DeepSeek V4 Flash ⭐ Fast & affordable", free: false },
      { value: "deepseek/deepseek-r1",                  label: "DeepSeek R1 (paid, higher limits)",    free: false },
      { value: "deepseek/deepseek-v3",                  label: "DeepSeek V3",                          free: false },
      { value: "anthropic/claude-3.5-sonnet",           label: "Claude 3.5 Sonnet (via OpenRouter)",   free: false },
      { value: "openai/gpt-4o",                         label: "GPT-4o (via OpenRouter)",              free: false },
      { value: "openai/gpt-4o-mini",                    label: "GPT-4o mini (via OpenRouter)",         free: false },
      { value: "google/gemini-pro-1.5",                 label: "Gemini Pro 1.5 (via OpenRouter)",      free: false },
      { value: "mistralai/mistral-large",               label: "Mistral Large",                        free: false },
      { value: "meta-llama/llama-3.3-70b-instruct",     label: "Llama 3.3 70B Instruct",               free: false },
    ],
  },
} as const;

type AiProvider = keyof typeof AI_PROVIDERS;

const formSchema = z.object({
  name: z.string().min(2, "Company name is required"),
  generalInfo: z.string().optional(),
  systemPrompt: z.string().optional(),
    
  googleSheetsEnabled: z.boolean().default(false),
  googleSheetsLink: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  googleSheetsName: z.string().optional().or(z.literal("")),
  googleSheetsPage: z.string().optional().or(z.literal("")),
  serviceAccountKey: z.string().optional().or(z.literal("")),
  aiAgentApiKey: z.string().optional().or(z.literal("")),
  aiProvider: z.enum(["openai", "anthropic", "google", "openrouter"]).optional(),
  aiModel: z.string().optional().or(z.literal("")),
  aiExecutionMode: z.enum(["quota", "tokens"]).default("quota"),
  websiteDataUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
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
    <Card className="bg-card border-border/50 border-blue-500/30">
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

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            {lang === "ar" ? "متطلبات Meta:" : "Meta requirements:"}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "ar"
              ? "استخدم Page Access Token للصفحة الصحيحة، وفعّل pages_messaging وpages_read_engagement أو Page Public Metadata Access. إذا كان التطبيق في وضع التطوير، يجب أن يكون حسابك Admin/Developer/Tester في تطبيق Meta."
              : "Use a Page Access Token for the correct Page, and enable pages_messaging plus pages_read_engagement or Page Public Metadata Access. In development mode, your account must be an Admin, Developer, or Tester of the Meta app."}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
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
    <Card className="bg-card border-border/50 border-green-500/30">
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

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
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

  const [optimisticMode, setOptimisticMode] = useState<"quota" | "tokens" | null>(null);
  const serverExecutionMode = ((company as any)?.aiExecutionMode as "quota" | "tokens") || "quota";
  const currentExecutionMode = optimisticMode ?? serverExecutionMode;

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
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const testGoogleSheet = useTestClientGoogleSheetConnection();
  const testingConnection = testGoogleSheet.isPending;
  const initialized = useRef(false);
  const fabOverlayRef = useRef<HTMLDivElement>(null);

  const toggleExecutionModeMutation = useMutation({
    mutationFn: async (mode: "quota" | "tokens") => {
      try {
        return await customFetch("/api/client/company/execution-mode", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        });
      } catch (err: any) {
        return await customFetch("/api/client/company", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: company?.name || "Company",
            aiExecutionMode: mode,
          }),
        });
      }
    },
    onMutate: (mode) => {
      setOptimisticMode(mode);
      form.setValue("aiExecutionMode", mode);
    },
    onSuccess: (_, mode) => {
      setOptimisticMode(null);
      queryClient.setQueryData(getGetClientCompanyQueryKey(), (old: any) => {
        if (!old) return old;
        return { ...old, aiExecutionMode: mode };
      });
      queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["client-ai-status"] });
      queryClient.invalidateQueries({ queryKey: ["client-company-quota"] });
      queryClient.invalidateQueries({ queryKey: ["/client/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["client-dashboard"] });
      form.setValue("aiExecutionMode", mode);
      toast({
        title: lang === "ar"
          ? (mode === "quota" ? "تم تفعيل نمط: حصة المنصة (Quota)" : "تم تفعيل نمط: رموز API الخاصة (API Tokens)")
          : (mode === "quota" ? "Switched to: Admin Quota Mode" : "Switched to: API Tokens Mode"),
        description: lang === "ar"
          ? (mode === "quota"
              ? "يعتمد المساعد الآن على حصة الرموز المخصصة لشركتك من قِبل الإدارة."
              : (company?.aiAgentApiKey
                  ? "يعتمد المساعد الآن على مفتاح API الخاص بشركتك دون قيود الحصة."
                  : "يرجى إضافة مفتاح API الخاص بك في قسم إعدادات الذكاء الاصطناعي أدناه لتفعيل الردود."))
          : (mode === "quota"
              ? "Your assistant is now using the monthly quota assigned by the platform admin."
              : (company?.aiAgentApiKey
                  ? "Your assistant is now using your company's own API tokens."
                  : "Please add your API key in the AI Configuration section below to activate responses.")),
      });
    },
    onError: (err: any) => {
      setOptimisticMode(null);
      toast({
        title: lang === "ar" ? "فشل تبديل النمط" : "Failed to switch mode",
        description: err?.message || (lang === "ar" ? "حدث خطأ أثناء حفظ النمط، يرجى المحاولة مرة أخرى." : "Error updating execution mode."),
        variant: "destructive",
      });
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      generalInfo: "",
      systemPrompt: "",
        
      googleSheetsEnabled: false,
      googleSheetsLink: "",
      googleSheetsName: "",
      googleSheetsPage: "",
      serviceAccountKey: "",
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
          
        googleSheetsEnabled: company.googleSheetsEnabled || false,
        googleSheetsLink: company.googleSheetsLink || "",
        googleSheetsName: company.googleSheetsName || "",
        googleSheetsPage: company.googleSheetsPage || "",
        serviceAccountKey: company.serviceAccountKey || "",
        aiAgentApiKey: company.aiAgentApiKey || "",
        aiProvider: (company.aiProvider as AiProvider) || undefined,
        aiModel: company.aiModel || "",
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
      googleSheetsLink: values.googleSheetsLink || null,
      googleSheetsName: values.googleSheetsName || null,
      googleSheetsPage: values.googleSheetsPage || null,
      serviceAccountKey: values.serviceAccountKey || null,
      aiAgentApiKey: values.aiAgentApiKey || null,
      aiProvider: values.aiProvider || null,
      aiModel: values.aiModel || null,
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
      <div className="space-y-6">
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

  const handleTestConnection = async () => {
    setTestResult(null);
    const googleSheetsLink = form.getValues("googleSheetsLink");
    const googleSheetsPage = form.getValues("googleSheetsPage");
    if (!googleSheetsLink) return;

    if (!company) {
      setTestResult({
        success: false,
        message: lang === "ar" ? "احفظ الإعدادات أولاً ثم قم باختبار الاتصال." : "Save your configuration first, then test the connection.",
      });
      return;
    }

    try {
      const result = await testGoogleSheet.mutateAsync({
        data: { googleSheetsLink, googleSheetsPage: googleSheetsPage || undefined },
      });
      setTestResult(result);
    } catch (err) {
      const message =
        (err && typeof err === "object" && "data" in err && err.data && typeof err.data === "object" && "error" in (err.data as Record<string, unknown>)
          ? String((err.data as Record<string, unknown>).error)
          : undefined) ||
        (err instanceof Error ? err.message : undefined) ||
        (lang === "ar" ? "خطأ في الاتصال. تأكد من صحة الرابط." : "Connection error. Check the sheet URL and try again.");
      setTestResult({ success: false, message });
    }
  };

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
    <div className="space-y-8 max-w-4xl pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("company_title")}</h1>
        <p className="text-muted-foreground mt-2">{t("company_desc")}</p>
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

      {/* AI Key Status Indicator */}
      {company && (
        <div className="space-y-2">
        <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition-all ${
          aiStatusLoading ? "border-border bg-muted/30" :
          aiStatus?.status === "ok" ? "border-emerald-500/40 bg-emerald-500/8" :
          (aiStatus?.status === "no_quota" || aiStatus?.status === "no_key" || aiStatus?.status === "no_platform_key") ? "border-amber-500/40 bg-amber-500/8" :
          aiStatus?.status === "quota_exceeded" ? "border-orange-500/40 bg-orange-500/8" :
          aiStatus?.status === "invalid_key" ? "border-red-500/40 bg-red-500/8" :
          aiStatus?.status === "error" ? "border-rose-500/40 bg-rose-500/8" :
          "border-border bg-muted/30"
        }`}>
          <div className="flex items-center gap-3">
            {aiStatusLoading ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/30 animate-pulse" />
            ) : aiStatus?.status === "ok" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.4)]" />
            ) : (aiStatus?.status === "no_quota" || aiStatus?.status === "no_key" || aiStatus?.status === "no_platform_key") ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_2px_rgba(245,158,11,0.3)]" />
            ) : aiStatus?.status === "quota_exceeded" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_6px_2px_rgba(249,115,22,0.3)]" />
            ) : aiStatus?.status === "invalid_key" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.3)]" />
            ) : aiStatus?.status === "error" ? (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_2px_rgba(244,63,94,0.3)]" />
            ) : (
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-semibold block text-foreground">
                {aiStatusLoading ? (
                  lang === "ar" ? "جاري فحص اتصال الذكاء الاصطناعي…" : "Checking AI connection…"
                ) : aiStatus?.status === "ok" ? (
                  currentExecutionMode === "quota"
                    ? (lang === "ar" ? "وكيل حصة المنصة متصل وجاهز للعمل" : "Platform Quota AI is connected and ready")
                    : (lang === "ar" ? "مفتاح الـ API الخاص بشركتك متصل ويعمل بنجاح" : "Company API key is connected and working")
                ) : aiStatus?.status === "no_quota" ? (
                  lang === "ar" ? "لم يتم تخصيص حصة رموز لهذه الشركة من قِبل المسؤول حتى الآن" : "No token quota allocated yet by administrator"
                ) : aiStatus?.status === "no_key" ? (
                  lang === "ar" ? "لم يتم إدخال مفتاح API خاص بالشركة" : "No company API key configured"
                ) : aiStatus?.status === "no_platform_key" ? (
                  lang === "ar" ? "لم يقم المسؤول بتهيئة مفتاح وكيل حصص المنصة" : "Platform Quota AI key not configured"
                ) : aiStatus?.status === "quota_exceeded" ? (
                  currentExecutionMode === "quota"
                    ? (lang === "ar" ? "تم استهلاك كامل حصة الرموز الشهرية المخصصة لشركتك" : "Monthly token quota fully consumed")
                    : (lang === "ar" ? "تم تجاوز الحصة لمفتاح الـ API الخاص بشركتك" : "Quota exceeded — API rate limit reached")
                ) : aiStatus?.status === "invalid_key" ? (
                  currentExecutionMode === "quota"
                    ? (lang === "ar" ? "مفتاح وكيل الحصص في المنصة غير صالح" : "Platform Quota AI key is invalid")
                    : (lang === "ar" ? "مفتاح API الخاص بشركتك غير صالح أو منتهي الصلاحية" : "Invalid API key — authentication failed")
                ) : aiStatus?.status === "error" ? (
                  lang === "ar" ? "تعذر الاتصال بمزود الذكاء الاصطناعي" : "AI connection error"
                ) : (
                  lang === "ar" ? "حالة الذكاء الاصطناعي غير معروفة" : "AI status unknown"
                )}
              </span>
              {!aiStatusLoading && aiStatus?.model && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground font-mono break-all leading-relaxed bg-background/50 px-2 py-0.5 rounded border border-border/50">
                    {aiStatus.provider} / {aiStatus.model}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                    (aiStatus.mode || currentExecutionMode) === "quota"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                  }`}>
                    {(aiStatus.mode || currentExecutionMode) === "quota"
                      ? (lang === "ar" ? "حصة المنصة" : "Platform Quota")
                      : (lang === "ar" ? "مفتاحك الخاص" : "Own API Key")}
                  </span>
                </div>
              )}
              {aiStatus?.status === "no_quota" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (lang === "ar"
                    ? "المساعد مضبوط على نمط الحصة ولكن لم يتم تخصيص رصيد رموز بعد. يرجى من المسؤول تحديد حصة في صفحة AI / Quota أو يمكنك التبديل إلى نمط رموز API الخاصة."
                    : "Chatbot is in Quota mode, but no monthly tokens have been assigned yet. The administrator can allocate a quota, or you can switch to API Tokens mode.")}
                </p>
              )}
              {aiStatus?.status === "no_key" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (lang === "ar"
                    ? "نمط العمل محدد على رموز API الخاصة. أضف مفتاح API في قسم إعدادات الذكاء الاصطناعي أدناه لتفعيل البوت."
                    : "Mode is set to API Tokens. Add your API key in the AI Configuration section below to activate your chatbot.")}
                </p>
              )}
              {aiStatus?.status === "no_platform_key" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (lang === "ar"
                    ? "يرجى من مسؤول المنصة إدخال مفتاح API في صفحة AI / Quota في لوحة الإدارة."
                    : "Please ask the administrator to configure the API key in the AI / Quota page.")}
                </p>
              )}
              {aiStatus?.status === "quota_exceeded" && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (currentExecutionMode === "quota"
                    ? (lang === "ar" ? "تواصل مع الإدارة لزيادة الحصة أو قم بالتبديل إلى نمط رموز API الخاصة." : "Contact admin to increase quota or switch to API Tokens mode.")
                    : (lang === "ar" ? "وصل المفتاح إلى الحد الأقصى للحصة. يرجى تفعيل الدفع أو استخدام مفتاح جديد أدناه." : "Your API key hit its usage limit. Update it in AI Configuration below."))}
                </p>
              )}
              {aiStatus?.status === "invalid_key" && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (currentExecutionMode === "quota"
                    ? (lang === "ar" ? "يرجى مراجعة إدارة المنصة لتحديث مفتاح وكيل الحصص." : "Please contact the administrator to update the Quota AI key.")
                    : (lang === "ar" ? "تم رفض المفتاح من قِبل المزود. يرجى التأكد من صلاحية المفتاح وتحديثه أدناه." : "The API key was rejected by the provider. Update it below."))}
                </p>
              )}
              {aiStatus?.status === "error" && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 leading-relaxed">
                  {aiStatus.detail || (lang === "ar"
                    ? "حدث خطأ أثناء فحص اتصال الذكاء الاصطناعي. تأكد من إعدادات المزود والنموذج."
                    : "An error occurred while testing the AI connection.")}
                </p>
              )}
            </div>
          </div>
          <Button
            type="button" variant="ghost" size="sm"
            className="shrink-0 h-7 px-2 text-xs"
            onClick={() => refetchAiStatus()}
            disabled={aiStatusLoading}
          >
            <RotateCcw className={`w-3 h-3 mr-1 ${aiStatusLoading ? "animate-spin" : ""}`} />
            {lang === "ar" ? "إعادة الفحص" : "Recheck"}
          </Button>
        </div>
      
        {/* Color legend */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_1px_rgba(16,185,129,0.5)]" />
            {lang === "ar" ? "متصل ويعمل" : "Connected & working"}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_5px_1px_rgba(245,158,11,0.5)]" />
            {lang === "ar" ? "لا توجد حصة / لا يوجد مفتاح" : "No quota / No API Key"}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_5px_1px_rgba(249,115,22,0.5)]" />
            {lang === "ar" ? "تجاوز الحصة" : "Quota exceeded"}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_1px_rgba(239,68,68,0.5)]" />
            {lang === "ar" ? "مفتاح غير صالح أو خطأ" : "Invalid key / Error"}
          </span>
        </div>
        </div>
      )}

      {/* AI Execution Mode Toggle Switch (Quota vs API Tokens) */}
      {company && (
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground">
                    {lang === "ar" ? "نمط تشغيل الذكاء الاصطناعي (مصدر الرموز)" : "AI Execution Mode (Token Source)"}
                  </span>
                  <Badge
                    variant={currentExecutionMode === "quota" ? "default" : "outline"}
                    className={currentExecutionMode === "quota"
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[11px] font-medium"
                      : "bg-blue-500/15 text-blue-500 border border-blue-500/30 text-[11px] font-medium"}
                  >
                    {currentExecutionMode === "quota"
                      ? (lang === "ar" ? "حصة المنصة (Quota)" : "Admin Quota")
                      : (lang === "ar" ? "رموز API الخاصة (API Tokens)" : "Own API Tokens")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ar"
                    ? "اختر ما إذا كان المساعد الذكي سيعتمد على حصة الرموز المخصصة من المنصة أم على مفتاح ورموز الـ API الخاصة بشركتك."
                    : "Choose whether your AI chatbot operates on the admin-assigned token quota or your company's own API tokens."}
                </p>
              </div>
            </div>

            {/* The Switch Control */}
            <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center bg-muted/40 border border-border/50 rounded-xl px-3 py-1.5">
              <span
                role="button"
                tabIndex={0}
                className={`text-xs select-none cursor-pointer transition-colors ${
                  currentExecutionMode === "quota" ? "text-amber-500 font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  if (currentExecutionMode !== "quota" && !toggleExecutionModeMutation.isPending) {
                    toggleExecutionModeMutation.mutate("quota");
                  }
                }}
              >
                {lang === "ar" ? "حصة الرموز (Quota)" : "Quota"}
              </span>

              <Switch
                id="ai-execution-mode-switch"
                checked={currentExecutionMode === "tokens"}
                disabled={toggleExecutionModeMutation.isPending}
                onCheckedChange={(checked) => {
                  const targetMode = checked ? "tokens" : "quota";
                  if (targetMode !== currentExecutionMode && !toggleExecutionModeMutation.isPending) {
                    toggleExecutionModeMutation.mutate(targetMode);
                  }
                }}
              />

              <span
                role="button"
                tabIndex={0}
                className={`text-xs select-none cursor-pointer transition-colors ${
                  currentExecutionMode === "tokens" ? "text-blue-500 font-bold" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  if (currentExecutionMode !== "tokens" && !toggleExecutionModeMutation.isPending) {
                    toggleExecutionModeMutation.mutate("tokens");
                  }
                }}
              >
                {lang === "ar" ? "رموز الـ API (Tokens)" : "API Tokens"}
              </span>
            </div>
          </div>

          {/* Cards / Status explanation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {/* Quota Option Card */}
            <div
              onClick={() => {
                if (currentExecutionMode !== "quota" && !toggleExecutionModeMutation.isPending) {
                  toggleExecutionModeMutation.mutate("quota");
                }
              }}
              className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                currentExecutionMode === "quota"
                  ? "bg-amber-500/10 border-amber-500/40 text-foreground ring-1 ring-amber-500/30"
                  : "bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span>{lang === "ar" ? "حصة الرموز المخصصة (Quota)" : "Admin Token Quota"}</span>
                </div>
                {currentExecutionMode === "quota" && (
                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                    {lang === "ar" ? "الوضع النشط" : "Active"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {company.monthlyTokenQuota && company.monthlyTokenQuota > 0
                  ? (lang === "ar"
                      ? `تم تعيين حصة شهرية قدرها ${company.monthlyTokenQuota.toLocaleString()} رمز مجاناً لشركتك عبر المنصة.`
                      : `Assigned ${company.monthlyTokenQuota.toLocaleString()} tokens/mo at $0.00 direct cost to you.`)
                  : (lang === "ar"
                      ? "لم يتم تعيين حصة شهرية لشركتك من قِبل المسؤول حتى الآن."
                      : "No token quota has been allocated by the administrator yet.")}
              </p>
            </div>

            {/* API Tokens Option Card */}
            <div
              onClick={() => {
                if (currentExecutionMode !== "tokens" && !toggleExecutionModeMutation.isPending) {
                  toggleExecutionModeMutation.mutate("tokens");
                }
              }}
              className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                currentExecutionMode === "tokens"
                  ? "bg-blue-500/10 border-blue-500/40 text-foreground ring-1 ring-blue-500/30"
                  : "bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <KeyRound className="w-3.5 h-3.5 text-blue-500" />
                  <span>{lang === "ar" ? "رموز ومفتاح API الخاص (BYOK)" : "Own API Key & Tokens"}</span>
                </div>
                {currentExecutionMode === "tokens" && (
                  <span className="text-[10px] font-bold text-blue-500 bg-blue-500/15 px-1.5 py-0.5 rounded border border-blue-500/30">
                    {lang === "ar" ? "الوضع النشط" : "Active"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {company.aiAgentApiKey
                  ? (lang === "ar"
                      ? `مفتاح API الخاص بك مسجل (${company.aiProvider || "OpenAI"}). تتم المحادثات بحرية دون التقيد بحصة المنصة.`
                      : `Your personal key is active (${company.aiProvider || "OpenAI"}). Runs without platform quota limits.`)
                  : (lang === "ar"
                      ? "يتطلب إضافة مفتاح API في قسم إعدادات الذكاء الاصطناعي أدناه."
                      : "Requires adding your API key in the AI Configuration section below.")}
              </p>
            </div>
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
          
          <Card className="bg-card border-border/50">
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

          {/* ── Master "Get Data" Section with 3 Data Sources ── */}

          <Accordion type="multiple" className="w-full space-y-4" defaultValue={["integrations"]}>
            
            <AccordionItem value="integrations" className="bg-card border border-border/50 rounded-lg px-1">
              <AccordionTrigger className="hover:no-underline px-4 py-4">
                <div className="flex items-center gap-2 font-semibold">
                  <Bot className="w-5 h-5 text-primary" />
                  {t("company_ai_card")}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-6 space-y-6">

                {/* AI Provider & Model */}
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 border-b border-border/50 pb-2">
                    <Lock className="w-3.5 h-3.5" /> {lang === "ar" ? "مزود ونموذج الذكاء الاصطناعي" : "AI Provider & Model"}
                  </h4>

                  {/* Step 1: Choose Provider */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "1. اختر مزود الذكاء الاصطناعي" : "1. Choose AI Provider"}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {(Object.entries(AI_PROVIDERS) as [AiProvider, typeof AI_PROVIDERS[AiProvider]][]).map(([key, p]) => {
                        const selected = form.watch("aiProvider") === key;
                        const models = mergeDynamicModels(
                          p.models as unknown as Array<{ value: string; label: string; free: boolean }>,
                          syncedAiModels?.providers?.[key],
                        );
                        const freeModels = models.filter((m) => m.free).length;
                        const paidModels = models.filter((m) => !m.free).length;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              form.setValue("aiProvider", key);
                              form.setValue("aiModel", "");
                            }}
                            className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-all ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            }`}
                          >
                            <span className="text-lg">{p.icon}</span>
                            <span>{p.label}</span>
                            {freeModels > 0 && paidModels === 0 ? (
                              <span className="text-[10px] text-green-500 font-normal">{lang === "ar" ? "خطة مجانية ✓" : "Free tier ✓"}</span>
                            ) : freeModels > 0 ? (
                              <span className="text-[10px] text-green-500 font-normal">{freeModels} {lang === "ar" ? "نماذج مجانية" : "free models"}</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-normal">{lang === "ar" ? "مدفوع" : "Paid"}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Free tier notice */}
                  {form.watch("aiProvider") && (
                    <div className="flex items-start gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2.5 animate-in fade-in duration-200">
                      <span className="text-green-500 text-sm shrink-0">✓</span>
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium text-green-600 dark:text-green-400">
                          {AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.freeTier}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lang === "ar" ? "احصل على مفتاح الـ API المجاني من: " : "Get your free API key at "}
                          <a
                            href={AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.keyLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline hover:no-underline"
                          >
                            {AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.keyLink?.replace("https://", "")}
                          </a>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Choose Model */}
                  {form.watch("aiProvider") && (() => {
                    const provider = form.watch("aiProvider") as AiProvider;
                    const allModels = mergeDynamicModels(
                      (AI_PROVIDERS[provider]?.models ?? []) as unknown as Array<{ value: string; label: string; free: boolean }>,
                      syncedAiModels?.providers?.[provider],
                    );
                    const freeModels = allModels.filter((m) => m.free);
                    const paidModels = allModels.filter((m) => !m.free);
                    const hasBoth = freeModels.length > 0 && paidModels.length > 0;
                    const currentModel = form.watch("aiModel") || "";
                    const currentIsFree = freeModels.some((m) => m.value === currentModel);
                    const currentIsPaid = paidModels.some((m) => m.value === currentModel);

                    if (hasBoth) {
                      return (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                           <div className="flex items-center justify-between gap-2">
                             <p className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "2. اختر النموذج الذكي" : "2. Choose Model"}</p>
                             <span className="text-[10px] text-muted-foreground">
                               {lang === "ar" ? "تحديث كل ساعة" : "Synced hourly"}{syncedAiModels?.syncedAt ? ` · ${new Date(syncedAiModels.syncedAt).toLocaleString()}` : ""}
                             </span>
                           </div>

                          {/* Free models dropdown */}
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1.5">
                              🆓 {lang === "ar" ? "النماذج المجانية" : "Free Models"}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={currentIsFree ? currentModel : ""}
                                onValueChange={(val) => form.setValue("aiModel", val)}
                              >
                                <SelectTrigger className="bg-background border-green-500/30 focus:ring-green-500/30 flex-1">
                                  <SelectValue placeholder={lang === "ar" ? "اختر نموذجاً مجانياً..." : "Select a free model..."} />
                                </SelectTrigger>
                                <SelectContent className="model-select-content max-h-[280px]">
                                  {freeModels.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>
                                      <span className="flex items-center gap-2">
                                        {m.label}
                                        <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/30 rounded px-1 py-0.5 leading-none">FREE</span>
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {currentIsFree && (
                                <button
                                  type="button"
                                  onClick={() => form.setValue("aiModel", "")}
                                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  aria-label="Clear free model selection"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Paid models dropdown */}
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                              💳 {lang === "ar" ? "النماذج المدفوعة" : "Paid Models"}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={currentIsPaid ? currentModel : ""}
                                onValueChange={(val) => form.setValue("aiModel", val)}
                              >
                                <SelectTrigger className="bg-background flex-1">
                                  <SelectValue placeholder={lang === "ar" ? "اختر نموذجاً مدفوعاً..." : "Select a paid model..."} />
                                </SelectTrigger>
                                <SelectContent className="model-select-content max-h-[280px]">
                                  {paidModels.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {currentIsPaid && (
                                <button
                                  type="button"
                                  onClick={() => form.setValue("aiModel", "")}
                                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  aria-label="Clear paid model selection"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              )}
                            </div>
                          </div>

                          {form.formState.errors.aiModel && (
                            <p className="text-sm font-medium text-destructive">{form.formState.errors.aiModel.message}</p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                         <div className="flex items-center justify-between gap-2">
                           <p className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "2. اختر النموذج الذكي" : "2. Choose Model"}</p>
                           <span className="text-[10px] text-muted-foreground">
                             {lang === "ar" ? "تحديث كل ساعة" : "Synced hourly"}{syncedAiModels?.syncedAt ? ` · ${new Date(syncedAiModels.syncedAt).toLocaleString()}` : ""}
                           </span>
                         </div>
                        <FormField
                          control={form.control}
                          name="aiModel"
                          render={({ field }) => (
                            <FormItem>
                              <Select value={field.value || ""} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger className="bg-background">
                                    <SelectValue placeholder={lang === "ar" ? "اختر نموذجاً..." : "Select a model..."} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {allModels.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    );
                  })()}

                  {/* Step 3: API Key */}
                  {form.watch("aiProvider") && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <p className="text-xs font-medium text-muted-foreground">{lang === "ar" ? "3. مفتاح الـ API" : "3. API Key"}</p>
                      {!form.watch("aiAgentApiKey") ? (
                        <div className="rounded-xl border border-border/60 bg-background overflow-hidden">
                          <div className="p-4 space-y-1.5">
                            <p className="text-sm font-medium">{lang === "ar" ? "أدخل مفتاح الـ API الخاص بك" : "Enter your API key"}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {lang === "ar"
                                ? `يُستخدم مفتاح ${AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.label} بأمان عبر الخادم ولا يظهر للمستخدمين.`
                                : `Your ${AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.label} API key is used server-side to generate AI responses. It is stored securely and never exposed to end users.`}
                            </p>
                          </div>
                          <div className="border-t border-border/50 bg-muted/30 px-4 py-3 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                              <Lock className="w-3 h-3" /> {lang === "ar" ? "السرية والأمان" : "Secrets"}
                            </p>
                            <FormField
                              control={form.control}
                              name="aiAgentApiKey"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center rounded-lg border border-border bg-background overflow-hidden">
                                    <div className="px-3 py-2.5 bg-muted/50 border-r border-border shrink-0">
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.keyLabel}
                                      </span>
                                    </div>
                                    <FormControl>
                                      <div className="flex-1 flex items-center pr-2">
                                        <Input
                                          type={showApiKey ? "text" : "password"}
                                          {...field}
                                          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm h-9"
                                          placeholder={AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.keyPlaceholder}
                                        />
                                        <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
                                          {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                        <div className="ml-1 w-7 h-7 rounded-md bg-muted/50 border border-border flex items-center justify-center shrink-0">
                                          <UserRound className="w-3.5 h-3.5 text-muted-foreground" />
                                        </div>
                                      </div>
                                    </FormControl>
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
                          <div className="border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-between">
                            <p className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                              <Lock className="w-3 h-3" /> {lang === "ar" ? "السرية والأمان" : "Secrets"}
                            </p>
                            <span className="text-xs text-emerald-500 font-medium">✓ {lang === "ar" ? "تم الضبط" : "Configured"}</span>
                          </div>
                          <div className="px-4 py-3 space-y-2">
                            <div className="flex items-center rounded-lg border border-emerald-500/20 bg-background overflow-hidden">
                              <div className="px-3 py-2.5 bg-muted/50 border-r border-border shrink-0">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.keyLabel ?? "API_KEY"}
                                </span>
                              </div>
                              <FormField
                                control={form.control}
                                name="aiAgentApiKey"
                                render={({ field }) => (
                                  <FormItem className="flex-1">
                                    <FormControl>
                                      <div className="flex items-center pr-2">
                                        <Input type={showApiKey ? "text" : "password"} {...field} className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 font-mono text-sm h-9" />
                                        <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
                                          {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                      </div>
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              {lang === "ar" ? "✓ الردود التلقائية الذكية نشطة باستخدام " : "✓ AI auto-responses are active using "}
                              {AI_PROVIDERS[form.watch("aiProvider") as AiProvider]?.label ?? "AI"} — {form.watch("aiModel") || (lang === "ar" ? "النموذج الافتراضي" : "default model")}.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!form.watch("aiProvider") && (
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar" ? "اختر مزوداً في الأعلى لتهيئة الردود الذكية التلقائية عبر الويب هوك." : "Select a provider above to configure AI-powered auto-responses on the webhook."}
                    </p>
                  )}
                </div>


              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="sheets" className="bg-card border border-border/50 rounded-lg px-1">
              <AccordionTrigger className="hover:no-underline px-4 py-4">
                <div className="flex items-center gap-2 font-semibold">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                  {t("company_google_sheets")}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-4">
                <FormField
                  control={form.control}
                  name="googleSheetsEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">{t("company_gs_enable")}</FormLabel>
                        <FormDescription>
                          {t("company_google_sheets_desc")}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                {form.watch("googleSheetsEnabled") && (
                  <div className="space-y-4 pt-4 border-t border-border mt-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <FormField
                      control={form.control}
                      name="googleSheetsLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("company_gs_link")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="bg-background"
                              placeholder="https://docs.google.com/spreadsheets/d/..."
                              onChange={(e) => { field.onChange(e); setTestResult(null); }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="googleSheetsName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ar" ? "اسم الجدول" : "Sheet Name"}</FormLabel>
                          <FormControl><Input {...field} className="bg-background" placeholder={lang === "ar" ? "مثال: تتبع العملاء" : "e.g. Q1 Leads Tracker"} /></FormControl>
                          <FormDescription>{lang === "ar" ? "اسم توضيحي للجدول كمرجع لك." : "A friendly label for this spreadsheet (for your own reference)."}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="googleSheetsPage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("company_gs_tab")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="bg-background"
                              placeholder={lang === "ar" ? "مثال: ورقة1 أو Leads" : "e.g. Leads or Sheet1"}
                              onChange={(e) => { field.onChange(e); setTestResult(null); }}
                            />
                          </FormControl>
                          <FormDescription>{lang === "ar" ? "اسم الصفحة (التبويب) داخل ملف الجدول للمزامنة معها." : "The tab (page) inside the spreadsheet to sync with."}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serviceAccountKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("company_gs_json_key")}</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              className="bg-background font-mono text-xs min-h-[100px]" 
                              placeholder='{"type": "service_account", "project_id": "...", ...}'
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTestConnection}
                        disabled={testingConnection || !form.watch("googleSheetsLink")}
                        className={
                          testResult?.success
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400"
                            : testResult && !testResult.success
                            ? "border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            : undefined
                        }
                      >
                        {testingConnection ? (
                          t("btn_testing")
                        ) : testResult?.success ? (
                          <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> {lang === "ar" ? "تم الاتصال" : "Connected"}</span>
                        ) : (
                          t("btn_test")
                        )}
                      </Button>
                      {!company && !testResult && (
                        <p className="text-xs text-muted-foreground">
                          {lang === "ar" ? "احفظ الإعدادات أولاً حتى تتمكن من اختبار الاتصال." : "Save your configuration first so we can test the connection."}
                        </p>
                      )}
                      {testResult && (
                        <p className={`text-xs rounded-lg border p-2.5 ${
                          testResult.success
                            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                            : "border-destructive/40 bg-destructive/5 text-destructive"
                        }`}>
                          {testResult.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

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
        <Card className="bg-card border-border/50 border-sky-500/30">
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

            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
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
        <Card className="bg-card border-border/50 border-primary/20">
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
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              {/* Row 1: Inputs */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {lang === "ar" ? "مصادر المعرفة والبيانات" : "Knowledge & Data Sources"}
              </p>
              <div className="grid grid-cols-2 min-[500px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
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

                {/* 7. Google Sheets */}
                <div className={`rounded-lg border p-2.5 space-y-1 transition-all ${
                  company.googleSheetsEnabled ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/40 bg-background"
                }`}>
                  <div className="text-base">📊</div>
                  <div className="font-medium truncate">Sheets</div>
                  <div className={`text-[10px] ${company.googleSheetsEnabled ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                    {company.googleSheetsEnabled ? (lang === "ar" ? "✓ مفعّل" : "✓ Enabled") : (lang === "ar" ? "معطل" : "Disabled")}
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center text-muted-foreground text-lg">↓</div>

              {/* AI Engine */}
              <div className={`rounded-lg border p-3 flex items-center gap-3 ${company.aiAgentApiKey && company.aiProvider ? "border-primary/40 bg-primary/5" : "border-amber-500/40 bg-amber-500/5"}`}>
                <span className="text-2xl">🤖</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">AI Engine</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {company.aiProvider && company.aiModel
                      ? `${company.aiProvider.toUpperCase()} · ${company.aiModel}`
                      : company.aiAgentApiKey
                      ? "Provider not selected"
                      : "⚠️ No API key — configure AI Provider above"}
                  </p>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${company.aiAgentApiKey && company.aiProvider ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600"}`}>
                  {company.aiAgentApiKey && company.aiProvider ? "Active" : "Needs setup"}
                </span>
              </div>

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
          <Card className="bg-card border-border/50 border-emerald-500/20">
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
