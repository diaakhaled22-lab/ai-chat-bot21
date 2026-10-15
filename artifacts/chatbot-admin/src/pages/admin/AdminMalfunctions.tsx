import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Check, User, Monitor, ShieldAlert, Trash2, Plus } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useToast } from "@/hooks/use-toast";

export default function AdminMalfunctions() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [openCreate, setOpenCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const { data: malfunctions, isLoading, isError } = useQuery<any[]>({
    queryKey: ["admin-malfunctions"],
    queryFn: () => customFetch("/api/admin/malfunctions"),
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: { title: string; description: string }) =>
      customFetch("/api/admin/malfunctions", {
        method: "POST",
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
  const desc = lang === "ar" ? "متابعة وحل الأعطال لكي تظهر أو تختفي من لوحة تحكم العملاء." : "Monitor and resolve active malfunctions displayed in the client dashboard.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2">{desc}</p>
        </div>
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
              <div className="flex flex-col md:flex-row md:items-start justify-between w-full">
                <div className="flex-1 min-w-0">
                  <AlertTitle className="text-base mb-2 flex flex-wrap items-center gap-2">
                    <span className="truncate">{m.title}</span>
                    {m.companyName && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-normal whitespace-nowrap">{m.companyName}</span>}
                    {m.source === 'client' && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap"><User className="w-3 h-3"/> {lang === "ar" ? "بلاغ عميل" : "Client"}</span>}
                    {m.source === 'system' && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap"><Monitor className="w-3 h-3"/> {lang === "ar" ? "نظام" : "System"}</span>}
                    {m.source === 'admin' && <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full font-normal flex items-center gap-1 whitespace-nowrap"><ShieldAlert className="w-3 h-3"/> {lang === "ar" ? "إدارة" : "Admin"}</span>}
                  </AlertTitle>
                  <AlertDescription className="mt-2 text-sm opacity-90 leading-relaxed">
                    {m.description}
                    <div className="mt-4 text-xs opacity-70 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span>{lang === "ar" ? "وقت الحدوث:" : "Occurred:"} {new Date(m.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                      {!m.isActive && m.resolvedAt && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {lang === "ar" ? "تم الحل:" : "Resolved:"} {new Date(m.resolvedAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                        </span>
                      )}
                    </div>
                  </AlertDescription>
                </div>
                {m.isActive && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 md:mt-0 md:ml-4 shrink-0 bg-background w-full md:w-auto"
                    onClick={() => resolveMutation.mutate(m.id)}
                    disabled={resolveMutation.isPending}
                  >
                    <Check className="w-4 h-4 mr-2 text-emerald-500" />
                    {lang === "ar" ? "تحديد كـ محلول" : "Mark as Resolved"}
                  </Button>
                )}
                <ConfirmDeleteDialog onConfirm={() => deleteMutation.mutate(m.id)}>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0 ml-2">
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </Alert>
          ))}
        </div>
      ) : null}
    </div>
  );
}