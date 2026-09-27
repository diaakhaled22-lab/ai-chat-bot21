import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";

export default function ClientLeads() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState("");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["client-leads"],
    queryFn: async () => {
      const res = await fetch("/api/client/leads", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json() as Promise<any[]>;
    }
  });

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter(l => 
      (l.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.phone || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.interest || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [leads, search]);

  const handleExportCSV = () => {
    if (!filteredLeads.length) return;
    const headers = ["Name", "Email", "Phone", "Interest", "Channel", "Date"];
    const csvContent = [
      headers.join(","),
      ...filteredLeads.map(l => [
        `"${l.name || ''}"`,
        `"${l.email || ''}"`,
        `"${l.phone || ''}"`,
        `"${l.interest || ''}"`,
        `"${l.channel || ''}"`,
        `"${new Date(l.createdAt).toLocaleString()}"`
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-background/50 p-4 sm:p-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {lang === "ar" ? "العملاء المحتملين (Leads)" : "Leads CRM"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {lang === "ar" ? "تتبع بيانات العملاء المهتمين التي يجمعها الذكاء الاصطناعي." : "Track customer contact details collected automatically by AI."}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button onClick={handleExportCSV} disabled={!filteredLeads.length} variant="outline" className="bg-card w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            {t("btn_export_csv" as any) || "Export CSV"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder={lang === "ar" ? "ابحث بالاسم، الهاتف، الايميل..." : "Search name, phone, email..."}
            className="pl-9 bg-card w-full" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-[300px]">
        <div className="overflow-x-auto flex-1 max-w-[100vw] sm:max-w-none">
          <table className="w-full text-sm text-left whitespace-nowrap min-w-[800px]">
            <thead className="text-xs text-muted-foreground bg-muted/30 uppercase sticky top-0">
              <tr>
                <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "الاسم" : "Name"}</th>
                <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "الايميل" : "Email"}</th>
                <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "رقم الهاتف" : "Phone"}</th>
                <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "الاهتمام" : "Interest"}</th>
                <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "القناة" : "Channel"}</th>
                <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "التاريخ" : "Date"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 sm:px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
                      <p>{lang === "ar" ? "لا يوجد عملاء محتملين مسجلين بعد." : "No leads found yet."}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 sm:px-6 py-4 font-medium">{lead.name || "-"}</td>
                    <td className="px-4 sm:px-6 py-4 text-muted-foreground">{lead.email || "-"}</td>
                    <td className="px-4 sm:px-6 py-4 text-muted-foreground">{lead.phone || "-"}</td>
                    <td className="px-4 sm:px-6 py-4">{lead.interest || "-"}</td>
                    <td className="px-4 sm:px-6 py-4 capitalize text-muted-foreground">{lead.channel}</td>
                    <td className="px-4 sm:px-6 py-4 text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
