import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Download, Users, Clock, CalendarRange, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetClientChatLogRetention } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";

export default function ClientLeads() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`/api/client/leads/${leadId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete lead');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-leads"] });
    }
  });

  const handleDelete = (leadId: number) => {
    if (confirm(lang === "ar" ? "هل أنت متأكد من حذف هذا العميل؟" : "Are you sure you want to delete this lead?")) {
      deleteLeadMutation.mutate(leadId);
    }
  };
  const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();
  const currentRetention = retentionData?.retentionDays ?? 7;

  const { data: leads, isLoading } = useQuery({
    queryKey: ["client-leads"],
    queryFn: async () => {
      const res = await fetch("/api/client/leads", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json() as Promise<any[]>;
    }
  });

  const [dateFilter, setDateFilter] = useState("all");

  const dateOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < currentRetention; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      let label = iso;
      if (i === 0) label = lang === "ar" ? `اليوم (${iso})` : `Today (${iso})`;
      else if (i === 1) label = lang === "ar" ? `أمس (${iso})` : `Yesterday (${iso})`;
      
      options.push({ value: iso, label });
    }
    return options;
  }, [currentRetention, lang]);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter(l => {
      const matchesSearch = (l.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.phone || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.interest || "").toLowerCase().includes(search.toLowerCase());
      
      let matchesDate = true;
      if (dateFilter !== "all" && l.createdAt) {
        const leadDate = new Date(l.createdAt).toISOString().split("T")[0];
        matchesDate = leadDate === dateFilter;
      }
      return matchesSearch && matchesDate;
    });
  }, [leads, search, dateFilter]);

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

      {/* Retention Policy Banner */}
      <Card className="bg-card border-border shrink-0">
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{lang === "ar" ? "سياسة الاحتفاظ بالبيانات" : "Data Retention Policy"}</p>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                  {lang === "ar" ? "إعدادات المدير" : "Configured by Administrator"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {retentionLoading ? (
                  <Skeleton className="h-3 w-48 mt-1" />
                ) : lang === "ar" ? (
                  `يتم مسح بيانات العملاء المحتملين (Leads) تلقائياً بعد ${currentRetention} ${currentRetention === 1 ? "يوم" : currentRetention === 2 ? "يومين" : "أيام"} حسب إعدادات المدير.`
                ) : (
                  `Leads are automatically deleted after ${currentRetention} day${currentRetention === 1 ? "" : "s"} as set by your administrator.`
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <div className="text-sm font-bold tabular-nums">
              {retentionLoading ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                `${currentRetention} ${lang === "ar" ? "أيام" : currentRetention === 1 ? "day" : "days"}`
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col md:flex-row gap-4 shrink-0 w-full">
        <div className="flex-1 flex items-center space-x-2 bg-card p-2 rounded-lg border border-border">
          <Search className="w-5 h-5 ml-2 text-muted-foreground" />
          <Input 
            placeholder={lang === "ar" ? "ابحث بالاسم، الهاتف، الايميل..." : "Search name, phone, email..."}
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-[220px]">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-full bg-card">
              <div className="flex items-center gap-2 truncate">
                <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder={lang === "ar" ? "كل الأيام" : "All Days"} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الأيام" : "All Days"}</SelectItem>
              {dateOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                  <th className="px-4 sm:px-6 py-4 font-semibold w-12"></th>
                  <th className="px-4 sm:px-6 py-4 font-semibold w-12"></th>
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
                  <td colSpan={7} className="px-4 sm:px-6 py-12 text-center text-muted-foreground">
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
