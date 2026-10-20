import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Check,
  User,
  Monitor,
  ShieldAlert,
  Trash2,
  Plus,
  Sparkles,
  Bot,
  Loader2,
  Copy,
  ExternalLink,
  Key,
  Cpu,
  RefreshCw,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useToast } from "@/hooks/use-toast";

type AiProvider = "google" | "openai";

interface ProviderConfig {
  id: AiProvider;
  name: string;
  badgeName: string;
  models: { id: string; label: string }[];
  defaultModel: string;
  keyPlaceholder: string;
  keyHelpText: { ar: string; en: string };
  keyLink: string;
  keyLinkLabel: { ar: string; en: string };
}

const AI_PROVIDERS: Record<AiProvider, ProviderConfig> = {
  google: {
    id: "google",
    name: "Google Gemini",
    badgeName: "Gemini Pro",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash ⭐ (موصى به - فائق السرعة ومجاني)" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (خفيف وسريع جداً)" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash (سياق 1M ومجاني)" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro (استدلال متقدم)" },
    ],
    defaultModel: "gemini-2.0-flash",
    keyPlaceholder: "AIzaSy...",
    keyHelpText: {
      ar: "يمكنك استخدام مفتاح مجاني أو مدفوع لاشتراكك من منصة Google AI Studio الرسمية.",
      en: "You can use a free or paid API key from official Google AI Studio.",
    },
    keyLink: "https://aistudio.google.com/app/apikey",
    keyLinkLabel: {
      ar: "احصل على المفتاح من Google AI Studio",
      en: "Get key from Google AI Studio",
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    badgeName: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o ⭐ (موصى به - ذكاء فائق وتحليل شامل وسريع)" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini (سريع وخفيف واقتصادي)" },
      { id: "o3-mini", label: "o3-mini (استدلال برمجي عميق)" },
      { id: "o1", label: "o1 (أقوى قدرات تفكير منطقي)" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo (قوي ومعتمد)" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (نموذج خفيف)" },
    ],
    defaultModel: "gpt-4o",
    keyPlaceholder: "sk-proj-...",
    keyHelpText: {
      ar: "استخدم مفتاح OpenAI API Key الخاص بحسابك على منصة OpenAI.",
      en: "Use an OpenAI API Key from your OpenAI Platform account.",
    },
    keyLink: "https://platform.openai.com/api-keys",
    keyLinkLabel: {
      ar: "احصل على المفتاح من OpenAI Platform",
      en: "Get key from OpenAI Platform",
    },
  },
};

interface MalfunctionItem {
  id: number;
  title: string;
  description: string;
  source: "client" | "system" | "admin";
  isActive: boolean;
  aiAnalysis?: string | null;
  aiProvider?: "google" | "openai" | null;
  aiModel?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  companyName?: string | null;
}

export default function AdminMalfunctions() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [openCreate, setOpenCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [openAiConfig, setOpenAiConfig] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>("google");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-pro");
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: malfunctions, isLoading, isError } = useQuery<MalfunctionItem[]>({
    queryKey: ["admin-malfunctions"],
    queryFn: () => customFetch("/api/admin/malfunctions"),
    refetchInterval: 15_000,
  });

  const { data: aiConfig } = useQuery<{
    provider: AiProvider;
    hasKey: boolean;
    maskedKey: string;
    model: string;
    isInherited: boolean;
  }>({
    queryKey: ["admin-malfunctions-ai-config"],
    queryFn: () => customFetch("/api/admin/malfunctions/ai-config"),
  });

  const currentProviderConfig = AI_PROVIDERS[selectedProvider];

  const handleOpenConfig = () => {
    const prov = aiConfig?.provider || "google";
    setSelectedProvider(prov);
    setSelectedModel(aiConfig?.model || AI_PROVIDERS[prov].defaultModel);
    setApiKeyInput("");
    setOpenAiConfig(true);
  };

  const handleProviderChange = (newProv: AiProvider) => {
    setSelectedProvider(newProv);
    const availableModelIds = AI_PROVIDERS[newProv].models.map((m) => m.id);
    if (!availableModelIds.includes(selectedModel)) {
      setSelectedModel(AI_PROVIDERS[newProv].defaultModel);
    }
    setApiKeyInput("");
  };

  const saveAiConfigMutation = useMutation({
    mutationFn: (body: { provider: AiProvider; apiKey?: string; model?: string }) =>
      customFetch("/api/admin/malfunctions/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions-ai-config"] });
      setOpenAiConfig(false);
      setApiKeyInput("");
      const provName = currentProviderConfig.name;
      toast({
        title: lang === "ar" ? `تم حفظ إعدادات ${provName}` : `${provName} Settings Saved`,
        description:
          lang === "ar"
            ? `تم حفظ المزود (${provName}) والنموذج (${selectedModel}) بنجاح.`
            : `${provName} provider and model (${selectedModel}) saved successfully.`,
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "خطأ في الحفظ" : "Save Error",
        description: err?.message || (lang === "ar" ? "فشل حفظ الإعدادات" : "Failed to save settings"),
      });
    },
  });

  const testAiConnectionMutation = useMutation({
    mutationFn: (body: { provider: AiProvider; apiKey?: string; model?: string }) =>
      customFetch<{ ok: boolean; response: string }>("/api/admin/malfunctions/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      const provName = currentProviderConfig.name;
      toast({
        title: lang === "ar" ? `نجح الاتصال بـ ${provName} ✓` : `${provName} Connected ✓`,
        description: res.response || (lang === "ar" ? "تم تأكيد الاتصال بنجاح." : "Connection verified successfully."),
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "فشل الاتصال" : "Connection Failed",
        description: err?.message || (lang === "ar" ? "تأكد من صحة مفتاح الـ API" : "Verify your API key"),
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch<{ ok: boolean; aiAnalysis: string; aiProvider?: string; aiModel?: string }>(
        `/api/admin/malfunctions/${id}/ai-analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      ),
    onMutate: (id) => {
      setAnalyzingId(id);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions"] });
      const provLabel = res.aiProvider === "openai" ? "OpenAI" : "Google Gemini";
      toast({
        title: lang === "ar" ? "تم تشخيص وتحليل العطل" : "Analysis Complete",
        description:
          lang === "ar"
            ? `قام ${provLabel} بتوليد تقرير تشخيصي دقيق وخطوات الحل المقترحة.`
            : `${provLabel} generated root cause diagnosis and fix steps.`,
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "فشل التحليل" : "Analysis Failed",
        description: err?.message || (lang === "ar" ? "تأكد من إعداد مفتاح الذكاء الاصطناعي" : "Ensure AI is configured"),
      });
    },
    onSettled: () => {
      setAnalyzingId(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: { title: string; description: string }) =>
      customFetch("/api/admin/malfunctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      setOpenCreate(false);
      setNewTitle("");
      setNewDescription("");
      toast({
        title: lang === "ar" ? "تم تسجيل العطل وإرسال الإشعار" : "Malfunction Reported",
        description:
          lang === "ar"
            ? "تم إرسال التنبيه إلى أيقونة الإشعارات وإلى البريد الإلكتروني بنجاح."
            : "Notification sent to bell icon and admin email successfully.",
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "خطأ" : "Error",
        description: err?.message || (lang === "ar" ? "فشل تسجيل العطل" : "Failed to report malfunction"),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/malfunctions/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions-status"] });
      toast({
        title: lang === "ar" ? "تم الحذف" : "Deleted",
        description: lang === "ar" ? "تم حذف العطل بنجاح" : "Malfunction deleted successfully",
      });
    },
    onError: (err: any) => {
      console.error("Delete malfunction error:", err);
      toast({
        variant: "destructive",
        title: lang === "ar" ? "خطأ" : "Error",
        description: err?.message || (lang === "ar" ? "فشل حذف العطل" : "Failed to delete malfunction"),
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/malfunctions/${id}/resolve`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions-status"] });
      toast({
        title: lang === "ar" ? "تم التحديث" : "Updated",
        description: lang === "ar" ? "تم تحديد العطل كـ محلول بنجاح" : "Malfunction marked as resolved",
      });
    },
    onError: (err: any) => {
      console.error("Resolve malfunction error:", err);
      toast({
        variant: "destructive",
        title: lang === "ar" ? "خطأ" : "Error",
        description: err?.message || (lang === "ar" ? "فشل تحديث حالة العطل" : "Failed to update malfunction"),
      });
    },
  });

  const title = lang === "ar" ? "إدارة الأعطال" : "Manage Malfunctions";
  const desc =
    lang === "ar"
      ? "متابعة وحل الأعطال وتشخيصها تلقائياً بالذكاء الاصطناعي (Google Gemini أو OpenAI)."
      : "Monitor, diagnose, and resolve active malfunctions with AI (Google Gemini or OpenAI).";

  const activeProvider = aiConfig?.provider || "google";
  const isOpenAiActive = activeProvider === "openai";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2">{desc}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* AI Settings Dialog Trigger */}
          <Button
            variant="outline"
            className={`shrink-0 flex items-center gap-2 transition-all ${
              isOpenAiActive
                ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                : "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            }`}
            onClick={handleOpenConfig}
          >
            {isOpenAiActive ? (
              <Bot className="w-4 h-4 text-emerald-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-blue-400" />
            )}
            {lang === "ar"
              ? `إعدادات الذكاء الاصطناعي (${isOpenAiActive ? "OpenAI" : "Gemini"})`
              : `AI Settings (${isOpenAiActive ? "OpenAI" : "Gemini"})`}
            {aiConfig?.hasKey && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Connected" />
            )}
          </Button>

          {/* Report Malfunction Dialog */}
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button className="shrink-0 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {lang === "ar" ? "تسجيل عطل جديد" : "Report Malfunction"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg w-[calc(100vw-2rem)] max-w-[95vw] overflow-hidden">
              <DialogHeader>
                <DialogTitle>{lang === "ar" ? "تسجيل عطل جديد" : "Report New Malfunction"}</DialogTitle>
                <DialogDescription>
                  {lang === "ar"
                    ? "سيتم إرسال هذا العطل تلقائياً إلى أيقونة الإشعارات وإلى بريد الإشعارات المحدد."
                    : "This issue will automatically be sent to the notification bell and admin email."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{lang === "ar" ? "عنوان العطل *" : "Title *"}</label>
                  <Input
                    placeholder={lang === "ar" ? "مثال: توقف خدمة الواتساب مؤقتاً" : "e.g. WhatsApp service degraded"}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{lang === "ar" ? "تفاصيل العطل *" : "Description *"}</label>
                  <Textarea
                    placeholder={lang === "ar" ? "اكتب وصف المشكلة والخطوات الجاري اتخاذها..." : "Describe the issue and next steps..."}
                    rows={4}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  disabled={!newTitle.trim() || !newDescription.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate({ title: newTitle.trim(), description: newDescription.trim() })}
                >
                  {createMutation.isPending
                    ? (lang === "ar" ? "جاري الإرسال..." : "Sending...")
                    : (lang === "ar" ? "تسجيل وإرسال الإشعار" : "Submit & Notify")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* AI Settings Dialog (Gemini & OpenAI) */}
      <Dialog open={openAiConfig} onOpenChange={setOpenAiConfig}>
        <DialogContent className="sm:max-w-lg w-[calc(100vw-2rem)] max-w-[95vw] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedProvider === "openai" ? (
                <Bot className="w-5 h-5 text-emerald-400" />
              ) : (
                <Sparkles className="w-5 h-5 text-blue-400" />
              )}
              {lang === "ar" ? "إعدادات محرك الذكاء الاصطناعي لتشخيص الأعطال" : "Malfunction AI Diagnosis Settings"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "اختر مزود الذكاء الاصطناعي (OpenAI أو Google Gemini) ونموذج العمل المناسب لتشخيص الأعطال واقتراح خطوات الحل."
                : "Choose your AI provider (OpenAI or Google Gemini) and model to diagnose malfunctions and generate solutions."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 min-w-0">
            {/* Provider Selector Tabs */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-primary" />
                {lang === "ar" ? "مزود الذكاء الاصطناعي (AI Provider)" : "AI Provider"}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleProviderChange("google")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                    selectedProvider === "google"
                      ? "border-blue-500 bg-blue-500/10 text-blue-400 ring-2 ring-blue-500/20 shadow-sm"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  Google Gemini
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange("openai")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all ${
                    selectedProvider === "openai"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 ring-2 ring-emerald-500/20 shadow-sm"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <Bot className="w-4 h-4 text-emerald-400" />
                  OpenAI (ChatGPT)
                </button>
              </div>
            </div>

            {/* Connection Status Box */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1 overflow-hidden">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted-foreground">{lang === "ar" ? "حالة الربط الحالية:" : "Connection Status:"}</span>
                {aiConfig?.provider === selectedProvider && aiConfig?.hasKey ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === "ar" ? "مربوط ونشط" : "Connected & Active"}
                  </span>
                ) : (
                  <span className="text-amber-400">
                    {lang === "ar" ? "غير مربوط أو يحتاج حفظ المفتاح" : "Not connected or needs save"}
                  </span>
                )}
              </div>
              {aiConfig?.provider === selectedProvider && aiConfig?.hasKey && (
                <div className="text-xs text-muted-foreground font-mono break-all line-clamp-2">
                  <span className="font-semibold">{aiConfig.maskedKey}</span>{" "}
                  {aiConfig.isInherited
                    ? lang === "ar"
                      ? "(مستمد من إعدادات الذكاء الاصطناعي العامة)"
                      : "(from general AI settings)"
                    : ""}
                </div>
              )}
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Key
                    className={`w-4 h-4 ${
                      selectedProvider === "openai" ? "text-emerald-400" : "text-blue-400"
                    }`}
                  />
                  {selectedProvider === "openai" ? "OpenAI API Key" : "Gemini API Key"}
                </label>
                <a
                  href={currentProviderConfig.keyLink}
                  target="_blank"
                  rel="noreferrer"
                  className={`text-xs hover:underline flex items-center gap-1 ${
                    selectedProvider === "openai" ? "text-emerald-400" : "text-blue-400"
                  }`}
                >
                  {currentProviderConfig.keyLinkLabel[lang === "ar" ? "ar" : "en"]}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <PasswordInput
                placeholder={
                  aiConfig?.provider === selectedProvider && aiConfig?.hasKey
                    ? lang === "ar"
                      ? "اتركه فارغاً للإبقاء على المفتاح الحالي"
                      : "Leave blank to keep current key"
                    : currentProviderConfig.keyPlaceholder
                }
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {currentProviderConfig.keyHelpText[lang === "ar" ? "ar" : "en"]}
              </p>
            </div>

            {/* Model Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Cpu
                  className={`w-4 h-4 ${
                    selectedProvider === "openai" ? "text-emerald-400" : "text-blue-400"
                  }`}
                />
                {lang === "ar"
                  ? `نموذج ${currentProviderConfig.name} المعتمد`
                  : `${currentProviderConfig.name} Model`}
              </label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      lang === "ar"
                        ? `اختر نموذج ${currentProviderConfig.name}`
                        : `Select ${currentProviderConfig.name} Model`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {currentProviderConfig.models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={testAiConnectionMutation.isPending}
              onClick={() =>
                testAiConnectionMutation.mutate({
                  provider: selectedProvider,
                  apiKey: apiKeyInput || undefined,
                  model: selectedModel,
                })
              }
              className="gap-2"
            >
              {testAiConnectionMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
            </Button>
            <Button
              type="button"
              disabled={saveAiConfigMutation.isPending}
              onClick={() =>
                saveAiConfigMutation.mutate({
                  provider: selectedProvider,
                  apiKey: apiKeyInput || undefined,
                  model: selectedModel,
                })
              }
            >
              {saveAiConfigMutation.isPending
                ? lang === "ar"
                  ? "جاري الحفظ..."
                  : "Saving..."
                : lang === "ar"
                ? "حفظ الإعدادات"
                : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{lang === "ar" ? "خطأ في الاتصال" : "Connection Error"}</AlertTitle>
          <AlertDescription>
            {lang === "ar"
              ? "تعذر الاتصال بالخادم. السيرفر لا يستجيب."
              : "Failed to connect to the server."}
          </AlertDescription>
        </Alert>
      )}

      {!isError && isLoading ? (
        <div className="text-muted-foreground text-sm">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div>
      ) : !isError && malfunctions?.length === 0 ? (
        <div className="text-muted-foreground text-sm">{lang === "ar" ? "لا توجد أعطال مسجلة." : "No malfunctions recorded."}</div>
      ) : !isError && malfunctions && malfunctions.length > 0 ? (
        <div className="space-y-4 mt-6">
          <h2 className="text-xl font-semibold mb-4">{lang === "ar" ? "سجل الأعطال" : "Malfunctions History"}</h2>
          {malfunctions.map((m) => {
            const isDiagnosedByOpenAi = m.aiProvider === "openai";
            return (
              <Alert
                key={m.id}
                variant={m.isActive ? "destructive" : "default"}
                className={m.isActive ? "bg-red-500/5" : "bg-muted/50 border-muted"}
              >
                {m.isActive ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                )}
                <div className="flex flex-col w-full">
                  <div className="flex flex-col md:flex-row md:items-start justify-between w-full gap-4">
                    <div className="flex-1 min-w-0">
                      <AlertTitle className="text-base mb-2 flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{m.title}</span>
                        {m.companyName && (
                          <span className="text-xs bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 px-2 py-0.5 rounded-full font-normal whitespace-nowrap">
                            {m.companyName}
                          </span>
                        )}
                        {m.source === "client" && (
                          <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap">
                            <User className="w-3 h-3" /> {lang === "ar" ? "بلاغ عميل" : "Client"}
                          </span>
                        )}
                        {m.source === "system" && (
                          <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap">
                            <Monitor className="w-3 h-3" /> {lang === "ar" ? "نظام" : "System"}
                          </span>
                        )}
                        {m.source === "admin" && (
                          <span className="text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap">
                            <ShieldAlert className="w-3 h-3" /> {lang === "ar" ? "إدارة" : "Admin"}
                          </span>
                        )}
                      </AlertTitle>
                      <AlertDescription className="mt-2 text-sm opacity-90 leading-relaxed">
                        {m.description}
                        <div className="mt-3 text-xs opacity-70 flex flex-wrap items-center gap-x-4 gap-y-2">
                          <span>
                            {lang === "ar" ? "وقت الحدوث:" : "Occurred:"}{" "}
                            {new Date(m.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                          </span>
                          {!m.isActive && m.resolvedAt && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {lang === "ar" ? "تم الحل:" : "Resolved:"}{" "}
                              {new Date(m.resolvedAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                            </span>
                          )}
                        </div>
                      </AlertDescription>
                    </div>

                    {/* Actions buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {/* AI diagnose button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-1.5 text-xs h-8 ${
                          isOpenAiActive
                            ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            : "border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        }`}
                        onClick={() => analyzeMutation.mutate(m.id)}
                        disabled={analyzingId === m.id}
                      >
                        {analyzingId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isOpenAiActive ? (
                          <Bot className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        )}
                        {m.aiAnalysis
                          ? lang === "ar"
                            ? "إعادة التشخيص بالذكاء الاصطناعي"
                            : "Re-diagnose"
                          : lang === "ar"
                          ? `تشخيص بـ ${isOpenAiActive ? "OpenAI" : "Gemini"}`
                          : `${isOpenAiActive ? "OpenAI" : "Gemini"} Diagnosis`}
                      </Button>

                      {m.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs bg-background"
                          onClick={() => resolveMutation.mutate(m.id)}
                          disabled={resolveMutation.isPending}
                        >
                          <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                          {lang === "ar" ? "تحديد كـ محلول" : "Mark Resolved"}
                        </Button>
                      )}

                      <ConfirmDeleteDialog onConfirm={() => deleteMutation.mutate(m.id)}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </ConfirmDeleteDialog>
                    </div>
                  </div>

                  {/* AI Analysis Report Card */}
                  {m.aiAnalysis && (
                    <div
                      className={`mt-4 border rounded-xl p-4 space-y-3 ${
                        isDiagnosedByOpenAi
                          ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
                          : "border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-between border-b pb-2 flex-wrap gap-2 ${
                          isDiagnosedByOpenAi ? "border-emerald-500/20" : "border-blue-500/20"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-md flex items-center justify-center ${
                              isDiagnosedByOpenAi ? "bg-emerald-500/20" : "bg-blue-500/20"
                            }`}
                          >
                            {isDiagnosedByOpenAi ? (
                              <Bot className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                            )}
                          </div>
                          <span
                            className={`font-semibold text-sm ${
                              isDiagnosedByOpenAi ? "text-emerald-400" : "text-blue-400"
                            }`}
                          >
                            {isDiagnosedByOpenAi
                              ? lang === "ar"
                                ? "تقرير وتشخيص OpenAI"
                                : "OpenAI Diagnostic Report"
                              : lang === "ar"
                              ? "تقرير وتشخيص Google Gemini"
                              : "Google Gemini Diagnostic Report"}
                          </span>
                          {m.aiModel && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                                isDiagnosedByOpenAi
                                  ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                                  : "border-blue-500/30 text-blue-300 bg-blue-500/10"
                              }`}
                            >
                              {m.aiModel}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            if (m.aiAnalysis) {
                              navigator.clipboard.writeText(m.aiAnalysis);
                              setCopiedId(m.id);
                              toast({
                                title: lang === "ar" ? "تم نسخ التقرير" : "Report copied to clipboard",
                              });
                              setTimeout(() => setCopiedId(null), 2000);
                            }
                          }}
                        >
                          {copiedId === m.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedId === m.id
                            ? lang === "ar"
                              ? "تم النسخ ✓"
                              : "Copied ✓"
                            : lang === "ar"
                            ? "نسخ التقرير"
                            : "Copy"}
                        </Button>
                      </div>

                      <div
                        className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90 font-sans"
                        dir="auto"
                      >
                        {m.aiAnalysis}
                      </div>
                    </div>
                  )}
                </div>
              </Alert>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}