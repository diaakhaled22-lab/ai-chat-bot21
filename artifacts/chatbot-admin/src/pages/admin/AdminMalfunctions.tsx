import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Plus, Trash2, Check } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function AdminMalfunctions() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [descInput, setDescInput] = useState("");

  const { data: malfunctions, isLoading, isError } = useQuery<any[]>({
    queryKey: ["admin-malfunctions"],
    queryFn: () => customFetch("/api/admin/malfunctions"),
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      customFetch("/api/admin/malfunctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-malfunctions-status"] });
      setIsAdding(false);
      setTitleInput("");
      setDescInput("");
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
    },
  });

  const handleCreate = () => {
    if (!titleInput.trim() || !descInput.trim()) return;
    createMutation.mutate({ title: titleInput, description: descInput });
  };

  const title = lang === "ar" ? "إدارة الأعطال" : "Manage Malfunctions";
  const desc = lang === "ar" ? "أضف، عدّل أو قم بحل الأعطال لكي تظهر في لوحة تحكم العملاء." : "Add or resolve active malfunctions displayed in the client dashboard.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2">{desc}</p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {lang === "ar" ? "إضافة عطل جديد" : "Add Malfunction"}
          </Button>
        )}
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

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>{lang === "ar" ? "إضافة عطل جديد" : "Add New Malfunction"}</CardTitle>
            <CardDescription>{lang === "ar" ? "سيظهر هذا العطل باللون الأحمر في لوحة العميل." : "This will be displayed as a red alert in the client dashboard."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{lang === "ar" ? "العنوان" : "Title"}</label>
              <Input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} placeholder={lang === "ar" ? "مثال: عطل في خوادم الواتساب" : "e.g., WhatsApp Servers Down"} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{lang === "ar" ? "التفاصيل" : "Description"}</label>
              <Textarea value={descInput} onChange={(e) => setDescInput(e.target.value)} placeholder={lang === "ar" ? "اشرح المشكلة باختصار للعميل..." : "Explain the issue briefly..."} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAdding(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !titleInput.trim() || !descInput.trim()}>{lang === "ar" ? "حفظ ونشر" : "Save & Publish"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isError && isLoading ? (
        <div className="text-muted-foreground text-sm">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div>
      ) : !isError && malfunctions?.length === 0 ? (
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
            <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              {lang === "ar" ? "جميع الأنظمة تعمل بكفاءة" : "All Systems Operational"}
            </h3>
            <p className="text-emerald-600/80 dark:text-emerald-400/80 mt-2 text-sm">
              {lang === "ar" ? "لا توجد أي أعطال مسجلة." : "No recorded malfunctions."}
            </p>
          </CardContent>
        </Card>
      ) : !isError && malfunctions && malfunctions.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{lang === "ar" ? "سجل الأعطال" : "Malfunctions History"}</h2>
          {malfunctions.map((m) => (
            <Alert key={m.id} variant={m.isActive ? "destructive" : "default"} className={m.isActive ? "bg-red-500/5" : "bg-muted/30 border-muted-foreground/20"}>
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {m.isActive ? <AlertTriangle className="h-5 w-5 text-red-500" /> : <CheckCircle2 className="h-5 w-5 text-muted-foreground" />}
                    <AlertTitle className="text-base mb-0">{m.title}</AlertTitle>
                  </div>
                  <AlertDescription className="mt-2 text-sm opacity-90 leading-relaxed ml-7">
                    {m.description}
                    <div className="mt-2 text-xs opacity-70 flex gap-4">
                      <span>{lang === "ar" ? "أُضيف:" : "Added:"} {new Date(m.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                      {!m.isActive && m.resolvedAt && (
                        <span>{lang === "ar" ? "تم الحل:" : "Resolved:"} {new Date(m.resolvedAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}</span>
                      )}
                    </div>
                  </AlertDescription>
                </div>
                {m.isActive && (
                  <Button variant="outline" size="sm" onClick={() => resolveMutation.mutate(m.id)} disabled={resolveMutation.isPending} className="shrink-0">
                    <Check className="w-4 h-4 mr-2" />
                    {lang === "ar" ? "تحديد كـ محلول" : "Mark as Resolved"}
                  </Button>
                )}
              </div>
            </Alert>
          ))}
        </div>
      ) : null}
    </div>
  );
}