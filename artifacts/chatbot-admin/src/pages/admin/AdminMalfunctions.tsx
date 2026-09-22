import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Check, User, Monitor, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AdminMalfunctions() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const { data: malfunctions, isLoading, isError } = useQuery<any[]>({
    queryKey: ["admin-malfunctions"],
    queryFn: () => customFetch("/api/admin/malfunctions"),
    refetchInterval: 15_000,
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

  const title = lang === "ar" ? "إدارة الأعطال" : "Manage Malfunctions";
  const desc = lang === "ar" ? "متابعة وحل الأعطال لكي تظهر أو تختفي من لوحة تحكم العملاء." : "Monitor and resolve active malfunctions displayed in the client dashboard.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2">{desc}</p>
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
        <div className="space-y-4 mt-6">
          <h2 className="text-xl font-semibold mb-4">{lang === "ar" ? "سجل الأعطال" : "Malfunctions History"}</h2>
          {malfunctions.map((m) => (
            <Alert key={m.id} variant={m.isActive ? "destructive" : "default"} className={m.isActive ? "bg-red-500/5" : "bg-muted/50 border-muted"}>
              {m.isActive ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              <div className="flex flex-col md:flex-row md:items-start justify-between w-full ml-2">
                <div>
                  <AlertTitle className="text-base mb-0 flex items-center gap-2">
                    {m.title} 
                    {m.companyName && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-normal">{m.companyName}</span>}
                    {m.source === 'client' && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-normal flex items-center gap-1"><User className="w-3 h-3"/> {lang === "ar" ? "بلاغ عميل" : "Client"}</span>}
                    {m.source === 'system' && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-normal flex items-center gap-1"><Monitor className="w-3 h-3"/> {lang === "ar" ? "نظام" : "System"}</span>}
                    {m.source === 'admin' && <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full font-normal flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> {lang === "ar" ? "إدارة" : "Admin"}</span>}
                  </AlertTitle>
                  <AlertDescription className="mt-2 text-sm opacity-90 leading-relaxed">
                    {m.description}
                    <div className="mt-4 text-xs opacity-70 flex items-center gap-4">
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
                    className="mt-4 md:mt-0 md:ml-4 shrink-0 bg-background"
                    onClick={() => resolveMutation.mutate(m.id)}
                    disabled={resolveMutation.isPending}
                  >
                    <Check className="w-4 h-4 mr-2 text-emerald-500" />
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