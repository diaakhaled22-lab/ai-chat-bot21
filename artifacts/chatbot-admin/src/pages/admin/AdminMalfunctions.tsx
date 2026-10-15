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

const GEMINI_MODELS = [
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro ⭐ (موصى به - سياق 1M وتحليل منطقي متقدم)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (أعلى دقة للمهام المعقدة)" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (فائق السرعة وحصص مجانية)" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash (خفيف ومتوازن)" },
];

export default function AdminMalfunctions() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [openCreate, setOpenCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [openAiConfig, setOpenAiConfig] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-1.5-pro");
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: malfunctions, isLoading, isError } = useQuery<any[]>({
    queryKey: ["admin-malfunctions"],
    queryFn: () => customFetch("/api/admin/malfunctions"),
    refetchInterval: 15_000,
  });

  const { data: aiConfig } = useQuery<{
    hasKey: boolean;
    maskedKey: string;
    model: string;
    isInherited: boolean;
  }>({
    queryKey: ["admin-malfunctions-ai-config"],
    queryFn: () => customFetch("/api/admin/malfunctions/ai-config"),
  });

  const saveAiConfigMutation = useMutation({
    mutationFn: (body: { apiKey?: string; model?: string }) =>
      customFetch("/api/admin/malfunctions/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions-ai-config"] });
      setOpenAiConfig(false);
      setGeminiKey("");
      toast({
        title: lang === "ar" ? "تم حفظ إعدادات Gemini Pro" : "Gemini Settings Saved",
        description: lang === "ar" ? "تم ربط اشتراك ونموذج Gemini Pro بنجاح." : "Gemini Pro configuration updated successfully.",
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
    mutationFn: (body: { apiKey?: string; model?: string }) =>
      customFetch<{ ok: boolean; response: string }>("/api/admin/malfunctions/ai-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (res) => {
      toast({
        title: lang === "ar" ? "نجح الاتصال بـ Gemini Pro ✓" : "Gemini Pro Connected ✓",
        description: res.response || (lang === "ar" ? "تم تأكيد الاتصال بنجاح." : "Connection verified successfully."),
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "فشل الاتصال" : "Connection Failed",
        description: err?.message || (lang === "ar" ? "تأكد من صحة مفتاح الـ API" : "Verify your Gemini API key"),
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch<{ ok: boolean; aiAnalysis: string }>(`/api/admin/malfunctions/${id}/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onMutate: (id) => {
      setAnalyzingId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions"] });
      toast({
        title: lang === "ar" ? "تم تحليل وتشخيص العطل" : "Analysis Complete",
        description: lang === "ar" ? "قام Gemini Pro بتوليد تشخيص دقيق وخطوات الحل." : "Gemini Pro generated root cause diagnosis and fix steps.",
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "فشل التحليل" : "Analysis Failed",
        description: err?.message || (lang === "ar" ? "تأكد من إعداد مفتاح Gemini Pro" : "Ensure Gemini Pro is configured"),
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
        description: lang === "ar"
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
  const desc = lang === "ar" ? "متابعة وحل الأعطال وتشخيصها تلقائياً باستخدام Google Gemini Pro." : "Monitor, diagnose, and resolve active malfunctions with Google Gemini Pro.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2">{desc}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Gemini Pro Config Dialog Trigger */}
          <Button
            variant="outline"
            className="shrink-0 flex items-center gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            onClick={() => {
              setGeminiModel(aiConfig?.model || "gemini-1.5-pro");
              setOpenAiConfig(true);
            }}
          >
            <Sparkles className="w-4 h-4 text-blue-400" />
            {lang === "ar" ? "إعدادات Gemini Pro" : "Gemini Pro Settings"}
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
            <DialogContent>
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

      {/* Gemini Pro Settings Dialog */}
      <Dialog open={openAiConfig} onOpenChange={setOpenAiConfig}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              {lang === "ar" ? "ربط اشتراك ونموذج Google Gemini Pro" : "Connect Google Gemini Pro"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "اربط مفتاح Gemini API Key لتفعيل التشخيص الذكي واقتراح الحلول وصياغة رسائل العملاء فوراً."
                : "Connect your Gemini API Key to enable AI diagnosis, actionable fixes, and customer notices."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Connection Status Box */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted-foreground">{lang === "ar" ? "حالة الربط:" : "Status:"}</span>
                {aiConfig?.hasKey ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === "ar" ? "مربوط ونشط" : "Connected & Active"}
                  </span>
                ) : (
                  <span className="text-amber-400">{lang === "ar" ? "غير مربوط بعد" : "Not connected"}</span>
                )}
              </div>
              {aiConfig?.hasKey && (
                <div className="text-xs text-muted-foreground font-mono">
                  {aiConfig.maskedKey} {aiConfig.isInherited ? (lang === "ar" ? "(مستمد من إعدادات الذكاء الاصطناعي العامة)" : "(from general AI settings)") : ""}
                </div>
              )}
            </div>

            {/* API Key Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-blue-400" />
                  {lang === "ar" ? "مفتاح Gemini API Key" : "Gemini API Key"}
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                >
                  {lang === "ar" ? "احصل على المفتاح من Google AI Studio" : "Get key from Google AI Studio"}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <PasswordInput
                placeholder={aiConfig?.hasKey ? (lang === "ar" ? "اتركه فارغاً للإبقاء على المفتاح الحالي" : "Leave blank to keep existing key") : "AIzaSy..."}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "يمكنك استخدام مفتاح مجاني أو مدفوع لاشتراكك من منصة Google AI Studio الرسمية."
                  : "You can use a free or paid API key from official Google AI Studio."}
              </p>
            </div>

            {/* Model Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-blue-400" />
                {lang === "ar" ? "نموذج Gemini المعتمد" : "Gemini Model"}
              </label>
              <Select value={geminiModel} onValueChange={setGeminiModel}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر نموذج Gemini" />
                </SelectTrigger>
                <SelectContent>
                  {GEMINI_MODELS.map((m) => (
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
              onClick={() => testAiConnectionMutation.mutate({ apiKey: geminiKey || undefined, model: geminiModel })}
              className="gap-2"
            >
              {testAiConnectionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
            </Button>
            <Button
              type="button"
              disabled={saveAiConfigMutation.isPending}
              onClick={() => saveAiConfigMutation.mutate({ apiKey: geminiKey || undefined, model: geminiModel })}
            >
              {saveAiConfigMutation.isPending ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : (lang === "ar" ? "حفظ الإعدادات" : "Save Settings")}
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
          {malfunctions.map((m) => (
            <Alert key={m.id} variant={m.isActive ? "destructive" : "default"} className={m.isActive ? "bg-red-500/5" : "bg-muted/50 border-muted"}>
              {m.isActive ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              <div className="flex flex-col w-full">
                <div className="flex flex-col md:flex-row md:items-start justify-between w-full gap-4">
                  <div className="flex-1 min-w-0">
                    <AlertTitle className="text-base mb-2 flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{m.title}</span>
                      {m.companyName && <span className="text-xs bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 px-2 py-0.5 rounded-full font-normal whitespace-nowrap">{m.companyName}</span>}
                      {m.source === 'client' && <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap"><User className="w-3 h-3"/> {lang === "ar" ? "بلاغ عميل" : "Client"}</span>}
                      {m.source === 'system' && <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap"><Monitor className="w-3 h-3"/> {lang === "ar" ? "نظام" : "System"}</span>}
                      {m.source === 'admin' && <span className="text-xs bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap"><ShieldAlert className="w-3 h-3"/> {lang === "ar" ? "إدارة" : "Admin"}</span>}
                    </AlertTitle>
                    <AlertDescription className="mt-2 text-sm opacity-90 leading-relaxed">
                      {m.description}
                      <div className="mt-3 text-xs opacity-70 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span>{lang === "ar" ? "وقت الحدوث:" : "Occurred:"} {new Date(m.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                        {!m.isActive && m.resolvedAt && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {lang === "ar" ? "تم الحل:" : "Resolved:"} {new Date(m.resolvedAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                          </span>
                        )}
                      </div>
                    </AlertDescription>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {/* Gemini Pro diagnose button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 gap-1.5 text-xs h-8"
                      onClick={() => analyzeMutation.mutate(m.id)}
                      disabled={analyzingId === m.id}
                    >
                      {analyzingId === m.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      {m.aiAnalysis
                        ? (lang === "ar" ? "إعادة التحليل بـ Gemini" : "Re-analyze")
                        : (lang === "ar" ? "تشخيص بـ Gemini Pro" : "Gemini Diagnosis")}
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

                {/* Gemini Pro Analysis Report Card */}
                {m.aiAnalysis && (
                  <div className="mt-4 border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-blue-500/20 pb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <span className="font-semibold text-sm text-blue-400">
                          {lang === "ar" ? "تقرير وتشخيص Gemini Pro" : "Gemini Pro Diagnostic Report"}
                        </span>
                        {m.aiModel && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-300 bg-blue-500/10 font-mono">
                            {m.aiModel}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          navigator.clipboard.writeText(m.aiAnalysis);
                          setCopiedId(m.id);
                          toast({ title: lang === "ar" ? "تم نسخ التقرير" : "Report copied to clipboard" });
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                      >
                        {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedId === m.id ? (lang === "ar" ? "تم النسخ ✓" : "Copied ✓") : (lang === "ar" ? "نسخ التقرير" : "Copy")}
                      </Button>
                    </div>

                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 font-sans" dir="auto">
                      {m.aiAnalysis}
                    </div>
                  </div>
                )}
              </div>
            </Alert>
          ))}
        </div>
      ) : null}
    </div>
  );
}