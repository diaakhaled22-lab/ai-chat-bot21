import { useGetAdminSettings, useUpdateAdminSettings, getGetAdminSettingsQueryKey } from "@workspace/api-client-react";
import AdminEmailSettings from "./AdminEmailSettings";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import { Globe, Zap, Sparkles, CheckCircle2, ChevronDown } from "lucide-react";

import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "free" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", tier: "free" },
      { id: "o3-mini", label: "o3-mini", tier: "free" },
      { id: "gpt-4o", label: "GPT-4o", tier: "paid" },
      { id: "chatgpt-4o-latest", label: "ChatGPT-4o Latest", tier: "paid" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", tier: "paid" },
      { id: "gpt-4", label: "GPT-4", tier: "paid" },
      { id: "o1", label: "o1", tier: "paid" },
      { id: "o3", label: "o3", tier: "paid" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    models: [
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", tier: "free" },
      { id: "claude-3-haiku-20240307", label: "Claude 3 Haiku", tier: "free" },
      { id: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet", tier: "paid" },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", tier: "paid" },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus", tier: "paid" },
      { id: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet", tier: "paid" },
    ],
  },
  {
    id: "google",
    label: "Google",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tier: "free" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", tier: "free" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", tier: "free" },
      { id: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B", tier: "free" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", tier: "paid" },
      { id: "gemini-2.0-pro-exp-02-05", label: "Gemini 2.0 Pro Exp", tier: "paid" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "paid" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    models: [
      { id: "openrouter/free", label: "OpenRouter Free Auto", tier: "free" },
      { id: "google/gemma-4-31b-it:free", label: "Google Gemma 4 31B", tier: "free" },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "NVIDIA Nemotron 3.5 Lightning", tier: "free" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B Instruct", tier: "free" },
      { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", tier: "paid" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 ⭐", tier: "paid" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", tier: "paid" },
      { id: "openai/gpt-4o", label: "GPT-4o", tier: "paid" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "paid" },
      { id: "openai/o3-mini", label: "OpenAI o3-mini", tier: "paid" },
      { id: "openai/o1", label: "OpenAI o1", tier: "paid" },
      { id: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 (Paid)", tier: "paid" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek V3", tier: "paid" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "paid" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "paid" },
      { id: "mistralai/mistral-large", label: "Mistral Large", tier: "paid" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct", tier: "paid" },
    ],
  },
] as const;

// ── Auth form schema ────────────────────────────────────────────────────────
const formSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  currentPassword: z.string().min(1, "Current password is required to save changes"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").optional().or(z.literal("")),
});

// ── Model picker component ──────────────────────────────────────────────────
function ModelPicker({
  selectedProvider,
  selectedModel,
  onSelect,
}: {
  selectedProvider: string;
  selectedModel: string;
  onSelect: (provider: string, model: string) => void;
}) {
  const [activeProvider, setActiveProvider] = useState<string>(selectedProvider || "openai");

  const provider   = PROVIDERS.find((p) => p.id === activeProvider) ?? PROVIDERS[0];
  const freeModels = provider.models.filter((m) => m.tier === "free");
  const paidModels = provider.models.filter((m) => m.tier === "paid");

  // Which dropdown has the current selection?
  const isFreeSelected = selectedProvider === activeProvider && freeModels.some((m) => m.id === selectedModel);
  const isPaidSelected = selectedProvider === activeProvider && paidModels.some((m) => m.id === selectedModel);
  const freeValue      = isFreeSelected ? selectedModel : "";
  const paidValue      = isPaidSelected ? selectedModel : "";

  const selectClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground " +
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 " +
    "disabled:opacity-50 cursor-pointer appearance-none";

  return (
    <div className="space-y-4">
      {/* Provider tabs */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border/50 overflow-x-auto scrollbar-hide">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveProvider(p.id)}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
              activeProvider === p.id
                ? "bg-card text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Free Tier dropdown */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Free Tier</span>
          {isFreeSelected && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" /> Selected
            </span>
          )}
        </div>
        <div className="relative">
          <select
            value={freeValue}
            onChange={(e) => { if (e.target.value) onSelect(activeProvider, e.target.value); }}
            className={`${selectClass} ${isFreeSelected ? "border-amber-500/50 bg-amber-500/5" : ""}`}
          >
            <option value="">— اختر نموذج مجاني —</option>
            {freeModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{("contextWindow" in m && m.contextWindow) ? ` · ${m.contextWindow}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        {isFreeSelected && (
          <p className="text-xs text-muted-foreground px-1">
            {(freeModels.find((m) => m.id === selectedModel) as { description?: string } | undefined)?.description}
          </p>
        )}
      </div>

      {/* Paid Tier dropdown */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Paid Tier</span>
          {isPaidSelected && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" /> Selected
            </span>
          )}
        </div>
        <div className="relative">
          <select
            value={paidValue}
            onChange={(e) => { if (e.target.value) onSelect(activeProvider, e.target.value); }}
            className={`${selectClass} ${isPaidSelected ? "border-primary/50 bg-primary/5" : ""}`}
          >
            <option value="">— اختر نموذج مدفوع —</option>
            {paidModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{("contextWindow" in m && m.contextWindow) ? ` · ${m.contextWindow}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        {isPaidSelected && (
          <p className="text-xs text-muted-foreground px-1">
            {(paidModels.find((m) => m.id === selectedModel) as { description?: string } | undefined)?.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function AdminSettings() {
  const { data: settings, isLoading } = useGetAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { lang, setLang, t } = useLanguage();
  const initialized = useRef(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", username: "", currentPassword: "", newPassword: "" },
  });

  useEffect(() => {
    if (settings && !initialized.current) {
      form.setValue("name", settings.name);
      form.setValue("username", settings.username);
      initialized.current = true;
    }
  }, [settings, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const data: any = { currentPassword: values.currentPassword };
    if (values.name !== settings?.name) data.name = values.name;
    if (values.username && values.username !== settings?.username) data.username = values.username;
    if (values.newPassword) data.newPassword = values.newPassword;

    updateSettings.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        toast({ title: "Settings updated successfully" });
        form.setValue("currentPassword", "");
        form.setValue("newPassword", "");
      },
      onError: (error: any) => {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-10 w-48" />
        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-sm">
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Hero Operations Banner matching Bot Manager Login aesthetic ── */}
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
              <i className="fa-solid fa-sliders text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                {lang === "ar" ? "تكوين المنصة والنظام" : "Platform & Admin Config"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "إعدادات المشرف والمنصة" : "Admin & Platform Settings"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "إدارة بيانات الاعتماد الإدارية، إعدادات البريد الإلكتروني، واللغة المفضلة."
                  : "Manage your administrative credentials, system email alerts, and interface language."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <AdminEmailSettings />

      {/* Language */}
      <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            {t("settings_language")}
          </CardTitle>
          <CardDescription>{t("settings_language_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                lang === "en"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              🇬🇧 {t("settings_lang_english")}
            </button>
            <button
              type="button"
              onClick={() => setLang("ar")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                lang === "ar"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              🇸🇦 {t("settings_lang_arabic")}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Update your username and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl><Input {...field} className="bg-background" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-4 border-t border-border">
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password <span className="text-destructive">*</span></FormLabel>
                      <FormControl><PasswordInput {...field} className="bg-background" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password (optional)</FormLabel>
                      <FormControl><PasswordInput {...field} className="bg-background" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" disabled={updateSettings.isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 px-6">
                {updateSettings.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
