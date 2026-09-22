import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function ClientMalfunctions() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isAdding, setIsAdding] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [descInput, setDescInput] = useState("");

  const { data: malfunctions, isLoading, isError } = useQuery<any[]>({
    queryKey: ["client-malfunctions"],
    queryFn: () => customFetch("/api/client/malfunctions"),
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      customFetch("/api/client/malfunctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-malfunctions"] });
      queryClient.invalidateQueries({ queryKey: ["client-malfunctions-status"] });
      setIsAdding(false);
      setTitleInput("");
      setDescInput("");
      toast({
        title: lang === "ar" ? "تم الإبلاغ بنجاح" : "Report Submitted",
        description: lang === "ar" ? "تم تسجيل العطل وإرساله للإدارة." : "The issue has been reported to the admin.",
      });
    },
  });

  const handleCreate = () => {
    if (!titleInput.trim() || !descInput.trim()) return;
    createMutation.mutate({ title: titleInput, description: descInput });
  };

  const title = lang === "ar" ? "الأعطال وحالة النظام" : "System Malfunctions";
  const desc = lang === "ar" ? "عرض الأعطال الحالية المؤثرة على البوت أو قنوات الربط." : "View active issues affecting the chatbot or integrations.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2">{desc}</p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            {lang === "ar" ? "الإبلاغ عن مشكلة" : "Report a Problem"}
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>{lang === "ar" ? "الإبلاغ عن عطل" : "Report Malfunction"}</CardTitle>
            <CardDescription>{lang === "ar" ? "سيتم إرسال هذا العطل لفريق الدعم الفني لمراجعته." : "This issue will be reported to support."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{lang === "ar" ? "عنوان المشكلة" : "Issue Title"}</label>
              <Input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} placeholder={lang === "ar" ? "مثال: توقف البوت عن الرد" : "e.g., Bot stopped responding"} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{lang === "ar" ? "تفاصيل المشكلة" : "Description"}</label>
              <Textarea value={descInput} onChange={(e) => setDescInput(e.target.value)} placeholder={lang === "ar" ? "اشرح المشكلة باختصار..." : "Explain the issue briefly..."} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAdding(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !titleInput.trim() || !descInput.trim()} variant="destructive">
                {lang === "ar" ? "إرسال البلاغ" : "Submit Report"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{lang === "ar" ? "خطأ في الاتصال" : "Connection Error"}</AlertTitle>
          <AlertDescription>
            {lang === "ar" 
              ? "تعذر الاتصال بالخادم لجلب حالة النظام. قد يكون هناك عطل في السيرفر الرئيسي." 
              : "Failed to connect to the server to fetch system status. There might be a core server malfunction."}
          </AlertDescription>
        </Alert>
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
              {lang === "ar" ? "لا توجد أي أعطال أو تنبيهات نشطة حالياً." : "There are no active malfunctions or alerts."}
            </p>
          </CardContent>
        </Card>
      ) : !isError && malfunctions && malfunctions.length > 0 ? (
        <div className="space-y-4">
          {malfunctions.map((m) => (
            <Alert key={m.id} variant="destructive" className="bg-red-500/5">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="text-base ml-2">{m.title}</AlertTitle>
              <AlertDescription className="mt-2 ml-2 text-sm opacity-90 leading-relaxed">
                {m.description}
                <div className="mt-4 text-xs opacity-70">
                  {new Date(m.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}
    </div>
  );
}