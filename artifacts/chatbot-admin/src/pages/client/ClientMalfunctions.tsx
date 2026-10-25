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
      {/* ── Bot Manager Hero Operations Banner ── */}
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
                {lang === "ar" ? "مراقبة سلامة واستقرار النظام" : "System Reliability Monitor"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {title}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {desc}
              </p>
            </div>
          </div>
        </div>
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
        <Card className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl shadow-sm">
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
            <Alert key={m.id} variant="destructive" className="bg-red-500/5 border-red-500/30 rounded-2xl shadow-sm">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="text-base break-words">{m.title}</AlertTitle>
              <AlertDescription className="mt-2 text-sm opacity-90 leading-relaxed">
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