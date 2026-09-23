import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import SupportAICard from "@/components/SupportAICard";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp,
  Building2,
  Search,
  Loader2,
  X,
  Coins,
  Cpu,
  Zap,
  RotateCcw,
  Download,
  PieChart,
  ArrowUpDown,
  BarChart3
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

interface Company {
  id: number;
  name: string;
  clientId: number;
  clientName?: string;
  clientUsername?: string;
  aiProvider?: string;
  aiModel?: string;
  monthlyTokenQuota?: number | null;
  isActive: boolean;
}

interface CompanyUsage {
  companyId: number;
  companyName: string;
  provider: string;
  model: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface UsageCostData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  byCompany: CompanyUsage[];
  byModel: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }[];
}

const QUOTA_PRESETS = [
  { label: "100K", value: 100_000 },
  { label: "500K", value: 500_000 },
  { label: "1M", value: 1_000_000 },
  { label: "2M", value: 2_000_000 },
  { label: "5M", value: 5_000_000 },
  { label: "10M", value: 10_000_000 },
];

function formatQuota(num: number | null | undefined): string {
  if (!num) return "No Quota";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return num.toLocaleString();
}

export default function AdminAiQuota() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [quotaTarget, setQuotaTarget] = useState<Company | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [showModelCostModal, setShowModelCostModal] = useState(false);

  const [showOnlyWithQuota, setShowOnlyWithQuota] = useState(true);

  // Fetch Companies
  const {
    data: companies = [],
    isLoading: companiesLoading,
    refetch: refetchCompanies,
    isFetching: isFetchingCompanies,
  } = useQuery<Company[]>({
    queryKey: ["admin-companies"],
    queryFn: () => customFetch("/api/admin/companies"),
    refetchInterval: 10_000,
  });

  // Fetch Usage
  const {
    data: usageData,
    isLoading: usageLoading,
    refetch: refetchUsage,
    isFetching: isFetchingUsage,
  } = useQuery<UsageCostData>({
    queryKey: ["admin-usage-cost", "month"],
    queryFn: () => customFetch("/api/admin/usage-cost?range=month"),
    refetchInterval: 10_000,
  });

  // Quota Mutation
  const setQuotaMutation = useMutation({
    mutationFn: ({ companyId, quota }: { companyId: number; quota: number | null }) =>
      customFetch(`/api/admin/companies/${companyId}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyTokenQuota: quota }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({
        title: lang === "ar" ? "تم تحديث الحصة بنجاح" : "Quota updated successfully",
      });
      setQuotaTarget(null);
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "فشل تحديث الحصة" : "Failed to update quota",
        description: err?.message,
        variant: "destructive",
      });
    },
  });

  const openQuotaDialog = (company: Company) => {
    setQuotaTarget(company);
    setQuotaInput(company.monthlyTokenQuota ? String(company.monthlyTokenQuota) : "");
  };

  const handleSaveQuota = () => {
    if (!quotaTarget) return;
    const val = quotaInput.trim();
    const quota = val === "" ? null : Number(val.replace(/,/g, ""));
    if (quota !== null && (isNaN(quota) || quota < 0)) {
      toast({
        title: lang === "ar" ? "قيمة غير صالحة" : "Invalid value",
        description: lang === "ar" ? "يرجى إدخال رقم صحيح أو تركه فارغاً" : "Please enter a valid number or leave empty for unlimited",
        variant: "destructive",
      });
      return;
    }
    setQuotaMutation.mutate({ companyId: quotaTarget.id, quota });
  };

  // Build Company Stats Map
  const companyUsageMap = useMemo(() => {
    const map = new Map<number, { tokens: number; messages: number; cost: number }>();
    if (usageData?.byCompany) {
      for (const c of usageData.byCompany) {
        map.set(c.companyId, {
          tokens: c.inputTokens + c.outputTokens,
          messages: c.messages,
          cost: c.costUsd,
        });
      }
    }
    return map;
  }, [usageData]);

  // Filtering and Sorting
  const filteredAndSortedCompanies = useMemo(() => {
    let result = companies.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.clientName && c.clientName.toLowerCase().includes(search.toLowerCase())) ||
      (c.clientUsername && c.clientUsername.toLowerCase().includes(search.toLowerCase()))
    );

    if (showOnlyWithQuota) {
      result = result.filter(c => c.monthlyTokenQuota && c.monthlyTokenQuota > 0);
    }

    result.sort((a, b) => {
      const aUsage = companyUsageMap.get(a.id)?.tokens ?? 0;
      const bUsage = companyUsageMap.get(b.id)?.tokens ?? 0;

      const aQuota = a.monthlyTokenQuota ?? 0;
      const bQuota = b.monthlyTokenQuota ?? 0;
      
      const aPercent = aQuota > 0 ? aUsage / aQuota : 0;
      const bPercent = bQuota > 0 ? bUsage / bQuota : 0;

      switch (sortBy) {
        case "usage-desc":
          return bUsage - aUsage;
        case "usage-asc":
          return aUsage - bUsage;
        case "quota-util-desc":
          return bPercent - aPercent;
        case "name":
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [companies, search, sortBy, companyUsageMap]);

  const topCompaniesData = useMemo(() => {
    // Get top 10 companies by usage
    const sorted = [...companies].sort((a, b) => {
      const aUsage = companyUsageMap.get(a.id)?.tokens ?? 0;
      const bUsage = companyUsageMap.get(b.id)?.tokens ?? 0;
      return bUsage - aUsage;
    });
    return sorted.slice(0, 10).map(c => ({
      name: c.name,
      tokens: companyUsageMap.get(c.id)?.tokens ?? 0,
      cost: companyUsageMap.get(c.id)?.cost ?? 0
    })).filter(c => c.tokens > 0);
  }, [companies, companyUsageMap]);

  const exportToCSV = () => {
    if (!filteredAndSortedCompanies.length) return;
    
    const headers = ["Company", "Client Name", "AI Model", "Quota", "Tokens Used", "Usage %", "Cost (USD)"];
    
    const rows = filteredAndSortedCompanies.map(c => {
      const hasQuota = typeof c.monthlyTokenQuota === "number" && c.monthlyTokenQuota > 0;
      const usage = companyUsageMap.get(c.id);
      const tokensUsed = hasQuota ? (usage?.tokens ?? 0) : 0;
      const percent = hasQuota && c.monthlyTokenQuota ? (tokensUsed / c.monthlyTokenQuota) * 100 : 0;
      const cost = hasQuota ? (usage?.cost ?? 0) : 0;

      return [
        `"${c.name.replace(/"/g, '""')}"`,
        `"${c.clientName ? c.clientName.replace(/"/g, '""') : ''}"`,
        `"${c.aiModel || 'Default'}"`,
        c.monthlyTokenQuota ?? "Unlimited",
        tokensUsed,
        hasQuota ? `${percent.toFixed(2)}%` : "N/A",
        cost.toFixed(4)
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" }); // Add BOM for Excel Arabic support
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `Quota_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalAllocatedQuota = useMemo(() => {
    return companies.reduce((sum, c) => sum + (c.monthlyTokenQuota ?? 0), 0);
  }, [companies]);

  const { totalTokensConsumedMonth, totalCostConsumedMonth } = useMemo(() => {
    let tokens = 0;
    let cost = 0;
    for (const c of companies) {
      if (c.monthlyTokenQuota && c.monthlyTokenQuota > 0) {
        const usage = companyUsageMap.get(c.id);
        if (usage) {
          tokens += usage.tokens;
          cost += usage.cost;
        }
      }
    }
    return { totalTokensConsumedMonth: tokens, totalCostConsumedMonth: cost };
  }, [companies, companyUsageMap]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Cpu className="w-8 h-8 text-violet-400" />
            {lang === "ar" ? "الذكاء الاصطناعي وإدارة الحصص (AI / Quota)" : "AI / Quota Management"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {lang === "ar"
              ? "تكوين نموذج الدعم الفني بالذكاء الاصطناعي، ومراقبة وتحديد حصص الرموز (Token Quotas) لشركات العملاء."
              : "Configure the Support AI Agent model, and monitor & assign monthly token quotas to companies."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!usageData?.byModel?.length}
            onClick={() => setShowModelCostModal(true)}
          >
            <PieChart className="w-4 h-4 text-purple-400" />
            {lang === "ar" ? "تفاصيل التكلفة" : "Cost Breakdown"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportToCSV}
          >
            <Download className="w-4 h-4 text-emerald-400" />
            {lang === "ar" ? "تصدير CSV" : "Export CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isFetchingCompanies || isFetchingUsage}
            onClick={() => {
              refetchCompanies();
              refetchUsage();
            }}
          >
            <RotateCcw className={`w-4 h-4 ${isFetchingCompanies || isFetchingUsage ? "animate-spin" : ""}`} />
            {lang === "ar" ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              {lang === "ar" ? "إجمالي الحصص المخصصة" : "Total Allocated Quota"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatQuota(totalAllocatedQuota)} <span className="text-xs font-normal text-muted-foreground">tokens</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {companies.filter((c) => c.monthlyTokenQuota).length} {lang === "ar" ? "شركات بحصص محددة" : "companies with set quotas"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              {lang === "ar" ? "استهلاك الرموز هذا الشهر" : "Tokens Consumed This Month"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {totalTokensConsumedMonth.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ${totalCostConsumedMonth.toFixed(4)} {lang === "ar" ? "التكلفة التقديرية" : "est. cost"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              {lang === "ar" ? "الشركات المسجلة" : "Total Companies"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {companies.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {companies.filter((c) => c.isActive).length} {lang === "ar" ? "نشطة حالياً" : "currently active"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Feature 1: Charts Section */}
      {topCompaniesData.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              {lang === "ar" ? "أعلى الشركات استهلاكاً (Top 10)" : "Top 10 Consumers"}
            </CardTitle>
            <CardDescription className="text-xs">
              {lang === "ar" ? "حجم استهلاك الرموز (Tokens) خلال الشهر الحالي" : "Token consumption volume for the current month"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCompaniesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => formatQuota(val)}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number, name: string) => [
                      name === "tokens" ? value.toLocaleString() : value,
                      name === "tokens" ? (lang === "ar" ? "الرموز" : "Tokens") : name
                    ]}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold", marginBottom: "4px" }}
                  />
                  <Bar dataKey="tokens" radius={[4, 4, 0, 0]} maxBarSize={50}>
                    {topCompaniesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="hsl(var(--primary))" className="opacity-80 hover:opacity-100 transition-opacity" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature 1: Support AI Agent (Identical to Customer Problems page) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          {lang === "ar" ? "تكوين وكيل الدعم الفني الذكي (Support AI Agent)" : "Support AI Agent Configuration"}
        </h2>
        <SupportAICard />
      </div>

      {/* Feature 2: Company Quota Management */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              {lang === "ar" ? "حصص الشركات والاستهلاك الشهري" : "Company Quotas & Monthly Usage"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar" ? "تحديد حصة الرموز (Tokens) لكل شركة ومتابعة نسبة الاستهلاك." : "Set token limits per company and monitor their monthly consumption."}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2 space-x-reverse mr-2">
              <Switch 
                id="quota-filter" 
                checked={showOnlyWithQuota}
                onCheckedChange={setShowOnlyWithQuota} 
              />
              <Label htmlFor="quota-filter" className="text-xs cursor-pointer select-none">
                {lang === "ar" ? "عرض الشركات ذات الحصة فقط" : "Show with quota only"}
              </Label>
            </div>
            
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "ar" ? "بحث عن شركة..." : "Search companies..."}
                className="pl-9 h-9 text-xs"
              />
            </div>
            
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-48 h-9 text-xs">
                <ArrowUpDown className="w-3 h-3 mr-2 text-muted-foreground" />
                <SelectValue placeholder={lang === "ar" ? "ترتيب حسب..." : "Sort by..."} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{lang === "ar" ? "الاسم (أبجدي)" : "Name (Alphabetical)"}</SelectItem>
                <SelectItem value="usage-desc">{lang === "ar" ? "الأكثر استهلاكاً" : "Highest Usage"}</SelectItem>
                <SelectItem value="usage-asc">{lang === "ar" ? "الأقل استهلاكاً" : "Lowest Usage"}</SelectItem>
                <SelectItem value="quota-util-desc">{lang === "ar" ? "الأعلى استنفاداً للحصة" : "Highest Quota Utilization"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="bg-card border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "الشركة" : "Company"}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "النموذج" : "Model"}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "الحصة" : "Quota"}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "الاستهلاك" : "Usage"}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "التكلفة" : "Cost"}</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "النسبة" : "Percent"}</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">{lang === "ar" ? "الإجراء" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border/30">
                {companiesLoading || usageLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      {lang === "ar" ? "جاري تحميل البيانات..." : "Loading data..."}
                    </td>
                  </tr>
                ) : filteredAndSortedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      {lang === "ar" ? "لا توجد بيانات." : "No data found."}
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedCompanies.map((c) => {
                    const hasQuota = typeof c.monthlyTokenQuota === "number" && c.monthlyTokenQuota > 0;
                    const usage = companyUsageMap.get(c.id);
                    const rawTokens = usage?.tokens ?? 0;
                    const tokensUsed = hasQuota ? rawTokens : 0;
                    const cost = hasQuota ? (usage?.cost ?? 0) : 0;
                    const quota = c.monthlyTokenQuota;
                    const percentFloat = hasQuota && quota && quota > 0 ? (tokensUsed / quota) * 100 : null;
                    const percentDisplay = percentFloat === null
                      ? null
                      : tokensUsed === 0
                      ? "0%"
                      : percentFloat < 0.01
                      ? "< 0.01%"
                      : percentFloat < 1
                      ? `${percentFloat.toFixed(2)}%`
                      : `${Math.min(100, Math.round(percentFloat))}%`;
                    const percentBarWidth = percentFloat !== null
                      ? Math.min(100, Math.max(tokensUsed > 0 ? 1 : 0, Math.round(percentFloat)))
                      : 0;

                    return (
                      <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{c.name}</div>
                          {c.clientName && (
                            <div className="text-[11px] text-muted-foreground">{c.clientName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                            {c.aiModel || "Default"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {hasQuota ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full text-[11px]">
                              {formatQuota(c.monthlyTokenQuota)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 text-[10px] font-medium bg-muted/40 border border-muted/50 px-2 py-0.5 rounded-full">
                              {lang === "ar" ? "معطل" : "Disabled"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-mono">
                          {hasQuota ? (
                            tokensUsed.toLocaleString()
                          ) : (
                            <span className="text-muted-foreground/40 font-sans text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-500/90 font-medium">
                          {hasQuota ? `$${cost.toFixed(4)}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {percentDisplay !== null ? (
                            <div className="w-24 space-y-1">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className={percentFloat! >= 100 ? "text-red-500 font-bold" : percentFloat! >= 80 ? "text-amber-500 font-semibold" : "text-emerald-500"}>
                                  {percentDisplay}
                                </span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    percentFloat! >= 100 ? "bg-red-500" : percentFloat! >= 80 ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${percentBarWidth}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => openQuotaDialog(c)}
                          >
                            <TrendingUp className="w-3 h-3 mr-1.5 text-blue-400" />
                            {lang === "ar" ? "الحصة" : "Quota"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Quota Modal */}
      <Dialog open={!!quotaTarget} onOpenChange={(open) => !open && setQuotaTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              {lang === "ar" ? `تحديد حصة الرموز: ${quotaTarget?.name}` : `Set Monthly Token Quota: ${quotaTarget?.name}`}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "يتم خصم الرموز المستهلكة من مفتاح Support AI Agent حتى استهلاك هذه الحصة. بدون حصة، لن يتم السحب من مفتاح المنصة إطلاقاً."
                : "Usage will be deducted from the Support AI Agent API key up to this limit. Without an assigned quota, Support AI will not be drawn from."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="quota-input-ai">
                {lang === "ar" ? "الحصة الشهرية (رموز / Tokens)" : "Monthly Token Quota"}
              </Label>
              <div className="relative">
                <Input
                  id="quota-input-ai"
                  placeholder={lang === "ar" ? "مثال: 1000000 أو اتركه فارغاً لتعطيل الحصة" : "e.g. 1000000 (leave blank to disable quota)"}
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value.replace(/[^0-9]/g, ""))}
                  className="font-mono text-sm"
                />
                {quotaInput && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    ≈ {formatQuota(Number(quotaInput))}
                  </span>
                )}
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground font-medium">
                {lang === "ar" ? "خيارات سريعة:" : "Quick presets:"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUOTA_PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    type="button"
                    size="sm"
                    variant={quotaInput === String(p.value) ? "default" : "outline"}
                    className="text-xs h-7"
                    onClick={() => setQuotaInput(String(p.value))}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 text-muted-foreground"
                  onClick={() => setQuotaInput("")}
                >
                  <X className="w-3 h-3 mr-1" />
                  {lang === "ar" ? "تعطيل الحصة" : "Clear — Disable Quota"}
                </Button>
              </div>
            </div>

            {quotaTarget?.monthlyTokenQuota && (
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg flex items-center justify-between">
                <span>{lang === "ar" ? "الحصة الحالية:" : "Current Quota:"}</span>
                <span className="font-semibold text-foreground">{formatQuota(quotaTarget.monthlyTokenQuota)} tokens / month</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotaTarget(null)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSaveQuota} disabled={setQuotaMutation.isPending}>
              {setQuotaMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {lang === "ar" ? "جاري الحفظ..." : "Saving..."}
                </>
              ) : (
                lang === "ar" ? "حفظ التغييرات" : "Save Quota"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Global Cost Breakdown Modal */}
      <Dialog open={showModelCostModal} onOpenChange={setShowModelCostModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-purple-400" />
              {lang === "ar" ? "تفاصيل التكلفة حسب النموذج" : "Cost Breakdown by Model"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar" 
                ? "إجمالي الاستهلاك والتكلفة التقديرية مقسمة حسب كل نموذج ذكاء اصطناعي لجميع الشركات هذا الشهر." 
                : "Total usage and estimated cost broken down by AI model across all companies this month."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="text-left p-3 font-medium text-muted-foreground">{lang === "ar" ? "النموذج" : "Model"}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{lang === "ar" ? "المزود" : "Provider"}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{lang === "ar" ? "مدخلات (Input)" : "Input Tokens"}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{lang === "ar" ? "مخرجات (Output)" : "Output Tokens"}</th>
                  <th className="text-right p-3 font-medium text-emerald-500/90">{lang === "ar" ? "التكلفة" : "Total Cost"}</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border/30">
                {usageData?.byModel?.length ? (
                  usageData.byModel.map((m, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="p-3 font-medium">
                        <span className="font-mono bg-muted/50 px-2 py-1 rounded">{m.model}</span>
                      </td>
                      <td className="p-3 text-muted-foreground">{m.provider}</td>
                      <td className="p-3 text-right tabular-nums">{m.inputTokens.toLocaleString()}</td>
                      <td className="p-3 text-right tabular-nums">{m.outputTokens.toLocaleString()}</td>
                      <td className="p-3 text-right font-semibold text-emerald-400 tabular-nums">
                        ${m.costUsd.toFixed(4)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center p-6 text-muted-foreground">
                      {lang === "ar" ? "لا توجد بيانات تكلفة مسجلة حتى الآن." : "No cost data recorded yet."}
                    </td>
                  </tr>
                )}
                {/* Total Row */}
                {usageData?.byModel?.length > 0 && (
                  <tr className="bg-muted/20 font-bold border-t-2 border-border/50">
                    <td colSpan={2} className="p-3">{lang === "ar" ? "الإجمالي" : "Total"}</td>
                    <td className="p-3 text-right tabular-nums">
                      {usageData.byModel.reduce((acc, m) => acc + m.inputTokens, 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {usageData.byModel.reduce((acc, m) => acc + m.outputTokens, 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-emerald-400 tabular-nums">
                      ${usageData.byModel.reduce((acc, m) => acc + m.costUsd, 0).toFixed(4)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowModelCostModal(false)}>
              {lang === "ar" ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
