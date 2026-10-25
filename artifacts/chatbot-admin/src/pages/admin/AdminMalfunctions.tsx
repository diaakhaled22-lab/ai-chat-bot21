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
} from "lucide-react";
import SupportAICard from "@/components/SupportAICard";
import { useLanguage } from "@/hooks/use-language";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useToast } from "@/hooks/use-toast";

interface MalfunctionItem {
  id: number;
  title: string;
  description: string;
  source: "client" | "system" | "admin";
  isActive: boolean;
  aiAnalysis?: string | null;
  aiProvider?: "google" | "openai" | "anthropic" | "openrouter" | string | null;
  aiModel?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  companyName?: string | null;
}

const PROVIDER_INFO: Record<string, { label: string; color: string; badgeClass: string; cardClass: string; headerBorder: string }> = {
  openai: {
    label: "OpenAI",
    color: "text-emerald-400",
    badgeClass: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10",
    cardClass: "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20",
    headerBorder: "border-emerald-500/20",
  },
  anthropic: {
    label: "Anthropic Claude",
    color: "text-violet-400",
    badgeClass: "border-violet-500/30 text-violet-300 bg-violet-500/10",
    cardClass: "border-violet-500/30 bg-violet-500/5 dark:bg-violet-950/20",
    headerBorder: "border-violet-500/20",
  },
  google: {
    label: "Google Gemini",
    color: "text-blue-400",
    badgeClass: "border-blue-500/30 text-blue-300 bg-blue-500/10",
    cardClass: "border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/20",
    headerBorder: "border-blue-500/20",
  },
  openrouter: {
    label: "OpenRouter",
    color: "text-purple-400",
    badgeClass: "border-purple-500/30 text-purple-300 bg-purple-500/10",
    cardClass: "border-purple-500/30 bg-purple-500/5 dark:bg-purple-950/20",
    headerBorder: "border-purple-500/20",
  },
};

export default function AdminMalfunctions() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [openCreate, setOpenCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: malfunctions, isLoading, isError } = useQuery<MalfunctionItem[]>({
    queryKey: ["admin-malfunctions"],
    queryFn: () => customFetch("/api/admin/malfunctions"),
    refetchInterval: 15_000,
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
      const provInfo = PROVIDER_INFO[res.aiProvider || ""];
      const provLabel = provInfo ? provInfo.label : (res.aiProvider || "Support AI");
      toast({
        title: lang === "ar" ? "تم تشخيص وتحليل العطل" : "Analysis Complete",
        description:
          lang === "ar"
            ? `قام ${provLabel} (Support AI) بتوليد تقرير تشخيصي دقيق وخطوات الحل المقترحة.`
            : `${provLabel} (Support AI) generated root cause diagnosis and fix steps.`,
      });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "فشل التحليل" : "Analysis Failed",
        description:
          err?.message ||
          (lang === "ar"
            ? "تأكد من إعداد وكيل الدعم الفني الذكي (Support AI) ومفتاح الـ API في أسفل الصفحة أو من صفحة مشاكل العملاء"
            : "Ensure Support AI is configured at the bottom of the page or in Customer Problems"),
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

  const totalCount = malfunctions?.length ?? 0;
  const activeCount = malfunctions?.filter((m) => m.isActive).length ?? 0;
  const resolvedCount = totalCount - activeCount;
  const aiDiagnosedCount = malfunctions?.filter((m) => Boolean(m.aiAnalysis)).length ?? 0;

  const title = lang === "ar" ? "إدارة وتتبع الأعطال" : "Manage Malfunctions";
  const desc =
    lang === "ar"
      ? "متابعة وحل الأعطال وتشخيصها تلقائياً بالاعتماد على وكيل الدعم الفني الذكي (Support AI)."
      : "Monitor, diagnose, and resolve active malfunctions powered by the unified Support AI agent.";

  return (
    <div className="space-y-6">
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
              <i className="fa-solid fa-triangle-exclamation text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {lang === "ar" ? "مركز مراقبة وتشخيص الأعطال" : "Malfunctions & Diagnostics Center"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {title}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {desc}
              </p>
            </div>
          </div>

          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button className="bg-white hover:bg-blue-50 text-blue-700 font-bold shadow-lg shadow-black/10 rounded-xl px-5 py-2.5 h-auto transition-all shrink-0 cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />
                {lang === "ar" ? "تسجيل عطل جديد" : "Report Malfunction"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg w-[calc(100vw-2rem)] max-w-[95vw] overflow-hidden rounded-2xl">
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
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{lang === "ar" ? "تفاصيل العطل *" : "Description *"}</label>
                  <Textarea
                    placeholder={lang === "ar" ? "اكتب وصف المشكلة والخطوات الجاري اتخاذها..." : "Describe the issue and next steps..."}
                    rows={4}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)} className="rounded-xl">
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  disabled={!newTitle.trim() || !newDescription.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate({ title: newTitle.trim(), description: newDescription.trim() })}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 cursor-pointer"
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

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight leading-tight">{isLoading ? "—" : totalCount}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">{lang === "ar" ? "إجمالي الأعطال" : "Total Issues"}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10 text-red-600 dark:text-red-400 shadow-inner">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight leading-tight text-red-600 dark:text-red-400">{isLoading ? "—" : activeCount}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">{lang === "ar" ? "أعطال نشطة" : "Active Issues"}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight leading-tight text-emerald-600 dark:text-emerald-400">{isLoading ? "—" : resolvedCount}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">{lang === "ar" ? "أعطال تم حلها" : "Resolved"}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-purple-500/10 text-purple-600 dark:text-purple-400 shadow-inner">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight leading-tight text-purple-600 dark:text-purple-400">{isLoading ? "—" : aiDiagnosedCount}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">{lang === "ar" ? "مشخصة بـ AI" : "AI Diagnosed"}</p>
          </div>
        </div>
      </div>

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
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">{lang === "ar" ? "سجل الأعطال" : "Malfunctions History"}</h2>
          {malfunctions.map((m) => {
            const pInfo = PROVIDER_INFO[m.aiProvider || ""] || {
              label: m.aiProvider || "Support AI",
              color: "text-primary",
              badgeClass: "border-primary/30 text-primary bg-primary/10",
              cardClass: "border-primary/20 bg-muted/30",
              headerBorder: "border-primary/10",
            };

            return (
              <Alert
                key={m.id}
                variant={m.isActive ? "destructive" : "default"}
                className={`rounded-2xl border p-5 transition-all shadow-sm ${m.isActive ? "bg-red-500/5 border-red-500/30" : "bg-card border-[#DCE7FF] dark:border-slate-800"}`}
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
                        className="gap-1.5 text-xs h-8 border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => analyzeMutation.mutate(m.id)}
                        disabled={analyzingId === m.id}
                      >
                        {analyzingId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                        )}
                        {m.aiAnalysis
                          ? (lang === "ar" ? "إعادة التشخيص (Support AI)" : "Re-diagnose (Support AI)")
                          : (lang === "ar" ? "تشخيص بواسطة Support AI" : "Diagnose with Support AI")}
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
                    <div className={`mt-4 border rounded-xl p-4 space-y-3 ${pInfo.cardClass}`}>
                      <div className={`flex items-center justify-between border-b pb-2 flex-wrap gap-2 ${pInfo.headerBorder}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary/15">
                            <Bot className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className={`font-semibold text-sm ${pInfo.color}`}>
                            {lang === "ar"
                              ? `تقرير تشخيص Support AI (${pInfo.label})`
                              : `Support AI Diagnostic Report (${pInfo.label})`}
                          </span>
                          {m.aiModel && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${pInfo.badgeClass}`}>
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

      {/* Support AI Agent Shared Configuration Card */}
      <div className="pt-6 border-t">
        <SupportAICard />
      </div>
    </div>
  );
}
