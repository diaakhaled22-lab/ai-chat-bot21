import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ClientMalfunctions() {
  const { lang } = useLanguage();
  const { data: malfunctions, isLoading, isError } = useQuery<any[]>({
    queryKey: ["client-malfunctions"],
    queryFn: () => customFetch("/api/client/malfunctions"),
    refetchInterval: 15_000,
  });

  const title = lang === "ar" ? "الأعطال وحالة النظام" : "System Malfunctions";
  const desc = lang === "ar" ? "عرض الأعطال الحالية المؤثرة على البوت أو قنوات الربط." : "View active issues affecting the chatbot or integrations.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2">{desc}</p>
      </div>

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