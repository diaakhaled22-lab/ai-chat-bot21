import { useState, useMemo } from "react";
import {
  useListCompanies,
  useToggleCompanyStatus,
  useDeleteCompany,
  useGetCompanyActivityLogs,
  getListCompaniesQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Search, MoreVertical, Trash2, Eye, Building2,
  CalendarClock, CheckCircle2, XCircle, Clock, Settings2,
  Gauge, AlertTriangle, Zap, FlaskConical, Loader2, CheckCircle, Bot,
  MessageSquare, Globe, Send, Phone, Sheet, Activity,
  TrendingUp, Users, ShieldCheck, Timer, X, ChevronRight,
  Power, RefreshCw, Sparkles,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// ── Types ──────────────────────────────────────────────────────────────────────
type Company = {
  id: number;
  name: string;
  clientName?: string | null;
  clientId: number;
  isActive: boolean;
  activationStart?: string | null;
  activationEnd?: string | null;
  generalInfo?: string | null;
  systemPrompt?: string | null;
  googleSheetsEnabled?: boolean;
  aiAgentApiKey?: string | null;
  telegramBotApiKey?: string | null;
  whatsappApiKey?: string | null;
  websiteChatbotKey?: string | null;
  monthlyTokenQuota?: number | null;
  createdAt: string;
};

type Filter = "all" | "active" | "inactive" | "expiring";

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatQuota(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function toDateInputValue(iso?: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function toIsoFromInput(dateStr: string) {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toISOString();
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function getDaysRemaining(endDate: string | null | undefined): number | null {
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getSubscriptionProgress(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-indigo-500 to-blue-600",
];

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

const QUOTA_PRESETS = [
  { label: "100K", value: 100_000 },
  { label: "500K", value: 500_000 },
  { label: "1M", value: 1_000_000 },
  { label: "5M", value: 5_000_000 },
  { label: "10M", value: 10_000_000 },
];

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  activated:   { label: "Activated",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-emerald-500" },
  deactivated: { label: "Deactivated",     icon: <XCircle className="w-3.5 h-3.5" />,      color: "text-amber-500"  },
  expired:     { label: "Auto-expired",    icon: <Clock className="w-3.5 h-3.5" />,         color: "text-red-500"    },
  dates_set:   { label: "Window updated",  icon: <CalendarClock className="w-3.5 h-3.5" />, color: "text-blue-500"   },
};

// ── ActivityLog ────────────────────────────────────────────────────────────────
function ActivityLog({ companyId }: { companyId: number }) {
  const { data: logs, isLoading } = useGetCompanyActivityLogs(companyId);

  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3 items-start">
          <Skeleton className="h-6 w-6 rounded-full shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ))}
    </div>
  );

  if (!logs || logs.length === 0) return (
    <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
      <Activity className="w-8 h-8 opacity-20" />
      <p className="text-sm">No activity recorded yet.</p>
    </div>
  );

  return (
    <ol className="relative border-l border-border ml-2 space-y-4">
      {logs.map((log) => {
        const meta = ACTION_META[log.action] ?? {
          label: log.action,
          icon: <Settings2 className="w-3.5 h-3.5" />,
          color: "text-muted-foreground",
        };
        return (
          <li key={log.id} className="ml-4">
            <div className={`absolute -left-[9px] w-[18px] h-[18px] rounded-full flex items-center justify-center bg-background border border-border ${meta.color}`}>
              {meta.icon}
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                <span className="text-xs text-muted-foreground">by {log.performedBy}</span>
              </div>
              {log.note && <p className="text-xs text-muted-foreground">{log.note}</p>}
              <p className="text-xs text-muted-foreground/60">{new Date(log.createdAt).toLocaleString()}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Channel badges ─────────────────────────────────────────────────────────────
function ChannelBadges({ company }: { company: Company }) {
  const channels = [
    { key: "web",      active: !!company.websiteChatbotKey,  icon: <Globe className="w-3 h-3" />,        label: "Website"  },
    { key: "telegram", active: !!company.telegramBotApiKey,  icon: <Send className="w-3 h-3" />,         label: "Telegram" },
    { key: "whatsapp", active: !!company.whatsappApiKey,     icon: <Phone className="w-3 h-3" />,        label: "WhatsApp" },
    { key: "sheets",   active: !!company.googleSheetsEnabled,icon: <Sheet className="w-3 h-3" />,        label: "Sheets"   },
    { key: "ai",       active: !!company.aiAgentApiKey,      icon: <Sparkles className="w-3 h-3" />,     label: "AI Agent" },
  ];
  const active = channels.filter((c) => c.active);
  if (active.length === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
  return (
    <div className="flex items-center gap-1">
      {active.map((c) => (
        <span
          key={c.key}
          title={c.label}
          className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary/80 hover:bg-primary/20 transition-colors"
        >
          {c.icon}
        </span>
      ))}
    </div>
  );
}

// ── Subscription cell ──────────────────────────────────────────────────────────
function SubscriptionCell({ company }: { company: Company }) {
  const daysLeft = getDaysRemaining(company.activationEnd);
  const progress = getSubscriptionProgress(company.activationStart, company.activationEnd);
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
  const hasWindow = company.activationStart || company.activationEnd;

  if (!hasWindow) {
    return (
      <span className="text-xs text-muted-foreground/50 italic">No window set</span>
    );
  }

  return (
    <div className="space-y-1.5 min-w-[140px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {company.activationStart ? new Date(company.activationStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
          {" – "}
          {company.activationEnd ? new Date(company.activationEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
        </span>
      </div>

      {company.activationStart && company.activationEnd && (
        <div className="space-y-0.5">
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isExpired ? "bg-red-500" :
                isExpiringSoon ? "bg-amber-500" :
                "bg-emerald-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {isExpired ? (
            <p className="text-[10px] text-red-500 font-medium">Expired {Math.abs(daysLeft!)}d ago</p>
          ) : isExpiringSoon ? (
            <p className="text-[10px] text-amber-500 font-medium">{daysLeft}d remaining</p>
          ) : daysLeft !== null ? (
            <p className="text-[10px] text-muted-foreground">{daysLeft}d remaining</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminCompanies() {
  const { data: companies, isLoading } = useListCompanies();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [viewCompany, setViewCompany] = useState<Company | null>(null);
  const [activationTarget, setActivationTarget] = useState<Company | null>(null);
  const [activationForm, setActivationForm] = useState({ isActive: false, start: "", end: "" });
  const [quotaTarget, setQuotaTarget] = useState<Company | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [tgRegistering, setTgRegistering] = useState(false);
  const [tgStatus, setTgStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [tgWebhookTarget, setTgWebhookTarget] = useState<Company | null>(null);
  const [aiTestTarget, setAiTestTarget] = useState<Company | null>(null);
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    status: string; provider?: string; model?: string; reply?: string; message?: string;
  } | null>(null);

  const toggleStatus = useToggleCompanyStatus();
  const deleteCompany = useDeleteCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Derived stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = (companies ?? []) as Company[];
    const active = all.filter((c) => c.isActive);
    const expiring = all.filter((c) => {
      const d = getDaysRemaining(c.activationEnd);
      return d !== null && d >= 0 && d <= 7;
    });
    const totalQuota = all.reduce((sum, c) => sum + (c.monthlyTokenQuota ?? 0), 0);
    return { total: all.length, active: active.length, inactive: all.length - active.length, expiring: expiring.length, totalQuota };
  }, [companies]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((companies ?? []) as Company[]).filter((c) => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.clientName ?? "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filter === "active") return c.isActive;
      if (filter === "inactive") return !c.isActive;
      if (filter === "expiring") {
        const d = getDaysRemaining(c.activationEnd);
        return d !== null && d >= 0 && d <= 7;
      }
      return true;
    });
  }, [companies, search, filter]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const registerTelegramWebhook = async (company: Company) => {
    if (!company.telegramBotApiKey) return;
    setTgRegistering(true);
    setTgStatus(null);
    const webhookUrl = `${window.location.origin}/api/telegram/webhook/${company.telegramBotApiKey}`;
    try {
      const res = await fetch(`/api/telegram/register-webhook/${company.telegramBotApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl }),
      });
      const data = await res.json();
      setTgStatus(res.ok
        ? { ok: true, message: "✅ Webhook registered! Telegram will now forward messages to this bot." }
        : { ok: false, message: `❌ ${data.error}` });
    } catch {
      setTgStatus({ ok: false, message: "❌ Connection error. Check the bot token and try again." });
    } finally {
      setTgRegistering(false);
    }
  };

  const runAiTest = async (company: Company) => {
    setAiTestLoading(true);
    setAiTestResult(null);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/test-ai`, { method: "POST" });
      setAiTestResult(await res.json());
    } catch {
      setAiTestResult({ status: "error", message: "Connection error. Could not reach the server." });
    } finally {
      setAiTestLoading(false);
    }
  };

  const setQuotaMutation = useMutation({
    mutationFn: ({ id, quota }: { id: number; quota: number | null }) =>
      customFetch(`/api/admin/companies/${id}/quota`, {
        method: "PUT",
        body: JSON.stringify({ monthlyTokenQuota: quota }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      setQuotaTarget(null);
      toast({ title: "Token quota saved" });
    },
    onError: () => toast({ title: "Failed to save quota", variant: "destructive" }),
  });

  const openQuotaDialog = (company: Company) => {
    setQuotaTarget(company);
    setQuotaInput(company.monthlyTokenQuota ? String(company.monthlyTokenQuota) : "");
  };

  const handleSaveQuota = () => {
    if (!quotaTarget) return;
    const val = quotaInput.trim();
    const quota = val === "" ? null : parseInt(val.replace(/[^0-9]/g, ""), 10);
    if (val !== "" && (isNaN(quota!) || quota! <= 0)) {
      toast({ title: "Enter a valid number or leave blank to remove quota", variant: "destructive" });
      return;
    }
    setQuotaMutation.mutate({ id: quotaTarget.id, quota });
  };

  const openActivationDialog = (company: Company) => {
    setActivationTarget(company);
    setActivationForm({
      isActive: company.isActive,
      start: toDateInputValue(company.activationStart),
      end: toDateInputValue(company.activationEnd),
    });
  };

  const handleSaveActivation = () => {
    if (!activationTarget) return;
    if (activationForm.end && activationForm.start && activationForm.end < activationForm.start) {
      toast({ title: "End date must be after start date", variant: "destructive" });
      return;
    }
    toggleStatus.mutate(
      {
        id: activationTarget.id,
        data: {
          isActive: activationForm.isActive,
          activationStart: toIsoFromInput(activationForm.start),
          activationEnd: toIsoFromInput(activationForm.end),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
          setActivationTarget(null);
          toast({ title: "Activation settings saved" });
        },
        onError: () => toast({ title: "Failed to save activation settings", variant: "destructive" }),
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteCompany.mutate({ id: deleteTarget.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
        setDeleteTarget(null);
        toast({ title: "Company deleted" });
      },
      onError: () => toast({ title: "Failed to delete company", variant: "destructive" }),
    });
  };

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all",      label: "All",           count: stats.total    },
    { key: "active",   label: "Active",         count: stats.active   },
    { key: "inactive", label: "Inactive",       count: stats.inactive },
    { key: "expiring", label: "Expiring Soon",  count: stats.expiring },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor subscriptions, channels, and AI agent health across all client companies.
          </p>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Companies"
          value={isLoading ? "—" : stats.total}
          icon={<Building2 className="w-5 h-5 text-primary" />}
          accent="bg-primary/10"
        />
        <StatCard
          label="Active"
          value={isLoading ? "—" : stats.active}
          sub={stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}% of total` : undefined}
          icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />}
          accent="bg-emerald-500/10"
        />
        <StatCard
          label="Inactive"
          value={isLoading ? "—" : stats.inactive}
          icon={<XCircle className="w-5 h-5 text-muted-foreground" />}
          accent="bg-muted"
        />
        <StatCard
          label="Expiring Soon"
          value={isLoading ? "—" : stats.expiring}
          sub="Within 7 days"
          icon={<Timer className="w-5 h-5 text-amber-500" />}
          accent="bg-amber-500/10"
        />
      </div>

      {/* ── Search + Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by company or client name…"
            className="pl-9 pr-8 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 shrink-0 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                filter === f.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              {f.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${
                filter === f.key ? "bg-white/20" : "bg-muted"
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        {/* Table header */}
        <div className="grid grid-cols-[70px_minmax(180px,2fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_100px_110px_110px_120px_80px_44px] gap-0 border-b border-border bg-muted/30 px-4 py-3 min-w-[1060px]">
          {["My ID", "Company", "Company Name", "Client", "Status", "Start Date", "End Date", "Channels", "Quota", ""].map((h, i, arr) => (
            <div key={i} className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 ${i === arr.length - 1 ? "sticky right-0 bg-muted/30" : ""}`}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="divide-y divide-border min-w-[1060px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[70px_minmax(180px,2fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_100px_110px_110px_120px_80px_44px] gap-0 px-4 py-4 items-center">
                <div className="px-2"><Skeleton className="h-4 w-10" /></div>
                <div className="flex items-center px-2">
                  <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                </div>
                <div className="px-2"><Skeleton className="h-4 w-24" /></div>
                <div className="px-2"><Skeleton className="h-4 w-20" /></div>
                <div className="px-2"><Skeleton className="h-6 w-16 rounded-full" /></div>
                <div className="px-2"><Skeleton className="h-3 w-20" /></div>
                <div className="px-2"><Skeleton className="h-3 w-20" /></div>
                <div className="px-2"><Skeleton className="h-4 w-20" /></div>
                <div className="px-2"><Skeleton className="h-4 w-14" /></div>
                <div className="sticky right-0 bg-card px-2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Building2 className="w-10 h-10 opacity-15" />
            <p className="text-sm font-medium">No companies found</p>
            {search && <p className="text-xs">Try a different search term</p>}
          </div>
        ) : (
          <div className="divide-y divide-border min-w-[1060px]">
            {filtered.map((company) => {
              const daysLeft = getDaysRemaining(company.activationEnd);
              const isExpired = daysLeft !== null && daysLeft < 0;
              const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

              return (
                <div
                  key={company.id}
                  className="group grid grid-cols-[70px_minmax(180px,2fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_100px_110px_110px_120px_80px_44px] gap-0 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors"
                >
                  {/* My ID */}
                  <div className="px-2">
                    <span className="text-sm font-mono text-muted-foreground">#{company.id}</span>
                  </div>

                  {/* Company */}
                  <div className="flex items-center px-2">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(company.id)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
                      {getInitials(company.name)}
                    </div>
                  </div>

                  {/* Company Name */}
                  <div className="px-2 min-w-0">
                    <span className="text-sm truncate block">{company.name}</span>
                  </div>

                  {/* Client */}
                  <div className="px-2 flex items-center gap-1.5 min-w-0">
                    <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{company.clientName ?? <span className="text-muted-foreground">—</span>}</span>
                  </div>

                  {/* Status */}
                  <div className="px-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      company.isActive
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${company.isActive ? "bg-emerald-500 shadow-[0_0_4px_1px_rgba(16,185,129,0.6)]" : "bg-muted-foreground/40"}`} />
                      {company.isActive ? "Active" : "Inactive"}
                    </span>
                    {isExpired && (
                      <p className="text-[10px] text-red-500 mt-1 font-medium">Subscription expired</p>
                    )}
                    {isExpiringSoon && !isExpired && (
                      <p className="text-[10px] text-amber-500 mt-1 font-medium">Expires soon</p>
                    )}
                  </div>

                  {/* Start Date */}
                  <div className="px-2">
                    {company.activationStart ? (
                      <span className="text-xs tabular-nums">
                        {new Date(company.activationStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic">—</span>
                    )}
                  </div>

                  {/* End Date */}
                  <div className="px-2">
                    {company.activationEnd ? (
                      <div className="space-y-0.5">
                        <span className={`text-xs tabular-nums ${
                          getDaysRemaining(company.activationEnd) !== null && getDaysRemaining(company.activationEnd)! < 0
                            ? "text-red-500"
                            : getDaysRemaining(company.activationEnd) !== null && getDaysRemaining(company.activationEnd)! <= 7
                            ? "text-amber-500"
                            : ""
                        }`}>
                          {new Date(company.activationEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        {getDaysRemaining(company.activationEnd) !== null && getDaysRemaining(company.activationEnd)! < 0 && (
                          <p className="text-[10px] text-red-500 font-medium">Expired</p>
                        )}
                        {getDaysRemaining(company.activationEnd) !== null && getDaysRemaining(company.activationEnd)! >= 0 && getDaysRemaining(company.activationEnd)! <= 7 && (
                          <p className="text-[10px] text-amber-500 font-medium">{getDaysRemaining(company.activationEnd)}d left</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic">—</span>
                    )}
                  </div>

                  {/* Channels */}
                  <div className="px-2">
                    <ChannelBadges company={company} />
                  </div>

                  {/* Quota */}
                  <div className="px-2">
                    {company.monthlyTokenQuota ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-400 font-medium bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                        <TrendingUp className="w-3 h-3" />
                        {formatQuota(company.monthlyTokenQuota)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Unlimited</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="sticky right-0 bg-card group-hover:bg-muted/20 transition-colors px-1 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 transition-opacity data-[state=open]:opacity-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                          {company.name}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => setViewCompany(company)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                          <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground" />
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => openActivationDialog(company)}>
                          <Power className="w-4 h-4 mr-2" />
                          Subscription Settings
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => openQuotaDialog(company)}>
                          <Gauge className="w-4 h-4 mr-2" />
                          Set Token Quota
                        </DropdownMenuItem>

                        {company.aiAgentApiKey && (
                          <DropdownMenuItem onClick={() => { setAiTestTarget(company); setAiTestResult(null); runAiTest(company); }}>
                            <FlaskConical className="w-4 h-4 mr-2 text-violet-400" />
                            <span className="text-violet-400">Test AI Connection</span>
                          </DropdownMenuItem>
                        )}

                        {company.telegramBotApiKey && (
                          <DropdownMenuItem onClick={() => { setTgWebhookTarget(company); setTgStatus(null); }}>
                            <Zap className="w-4 h-4 mr-2 text-sky-400" />
                            <span className="text-sky-400">Register Telegram Webhook</span>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(company)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Company
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>{/* end overflow-x-auto */}

        {/* Footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{filtered.length}</span> of{" "}
              <span className="font-medium text-foreground">{stats.total}</span> companies
            </p>
            {stats.totalQuota > 0 && (
              <p className="text-xs text-muted-foreground">
                Total quota allocated:{" "}
                <span className="font-medium text-foreground">{formatQuota(stats.totalQuota)}</span> tokens/mo
              </p>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════ DIALOGS ══════════════════════════ */}

      {/* ── Delete confirmation ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Company
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and all associated
              data including conversations, tickets, and configuration. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg bg-destructive/5 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>All chatbot data, history, and integrations for this company will be permanently removed.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteCompany.isPending}
            >
              {deleteCompany.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Deleting…</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5 mr-2" />Delete Permanently</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Token Quota ── */}
      <Dialog open={!!quotaTarget} onOpenChange={(open) => !open && setQuotaTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-blue-500" />
              Monthly Token Quota
            </DialogTitle>
            <DialogDescription>
              Limit monthly AI token usage for <strong>{quotaTarget?.name}</strong>. Leave blank for unlimited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="quota-input">Token Limit per Month</Label>
              <Input
                id="quota-input"
                placeholder="e.g. 1000000"
                value={quotaInput}
                onChange={(e) => setQuotaInput(e.target.value.replace(/[^0-9]/g, ""))}
                className="bg-background font-mono"
              />
              {quotaInput && !isNaN(parseInt(quotaInput)) && (
                <p className="text-xs text-muted-foreground">
                  = <span className="text-foreground font-semibold">{formatQuota(parseInt(quotaInput))}</span> tokens per calendar month
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Presets</Label>
              <div className="grid grid-cols-5 gap-2">
                {QUOTA_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant={quotaInput === String(p.value) ? "default" : "outline"}
                    onClick={() => setQuotaInput(String(p.value))}
                    className="text-xs"
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground text-xs"
                onClick={() => setQuotaInput("")}
              >
                <X className="w-3 h-3 mr-1" /> Clear — set to Unlimited
              </Button>
            </div>

            {quotaTarget?.monthlyTokenQuota && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2.5 rounded-lg">
                <TrendingUp className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                Current quota: <span className="font-semibold text-foreground">{formatQuota(quotaTarget.monthlyTokenQuota)}</span> tokens/month
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotaTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveQuota} disabled={setQuotaMutation.isPending}>
              {setQuotaMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Saving…</> : "Save Quota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Subscription / Activation settings ── */}
      <Dialog open={!!activationTarget} onOpenChange={(open) => !open && setActivationTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              Subscription Settings
            </DialogTitle>
            <DialogDescription>
              Manage the subscription window for <strong>{activationTarget?.name}</strong>.
              The company will automatically deactivate when the end date is reached.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Active toggle */}
            <div className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${
              activationForm.isActive
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border bg-muted/30"
            }`}>
              <div>
                <p className="text-sm font-semibold flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${activationForm.isActive ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-muted-foreground/40"}`} />
                  {activationForm.isActive ? "Active — chatbot is running" : "Inactive — chatbot is paused"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 pl-4">Toggle to enable or disable this company's chatbot</p>
              </div>
              <Switch
                checked={activationForm.isActive}
                onCheckedChange={(v) => setActivationForm((f) => ({ ...f, isActive: v }))}
              />
            </div>

            {/* Date window */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Subscription Window</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="act-start" className="text-xs text-muted-foreground">Start Date</Label>
                  <Input
                    id="act-start"
                    type="date"
                    value={activationForm.start}
                    onChange={(e) => setActivationForm((f) => ({ ...f, start: e.target.value }))}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="act-end" className="text-xs text-muted-foreground">End Date</Label>
                  <Input
                    id="act-end"
                    type="date"
                    value={activationForm.end}
                    onChange={(e) => setActivationForm((f) => ({ ...f, end: e.target.value }))}
                    className="bg-background"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Both dates are optional. Leave blank to keep the subscription open-ended.</p>
            </div>

            {activationForm.end && (
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
                <Timer className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                The system checks every minute and will automatically deactivate this company when the end date passes.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActivationTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveActivation} disabled={toggleStatus.isPending}>
              {toggleStatus.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Saving…</> : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Company Details ── */}
      <Dialog open={!!viewCompany} onOpenChange={(open) => !open && setViewCompany(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            {viewCompany && (
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarColor(viewCompany.id)} flex items-center justify-center text-white font-bold shrink-0 shadow`}>
                  {getInitials(viewCompany.name)}
                </div>
                <div>
                  <DialogTitle className="text-lg">{viewCompany.name}</DialogTitle>
                  <DialogDescription className="mt-0">
                    Client: {viewCompany.clientName ?? "—"} · Joined {new Date(viewCompany.createdAt).toLocaleDateString()}
                  </DialogDescription>
                </div>
              </div>
            )}
          </DialogHeader>

          {viewCompany && (
            <div className="space-y-5 pt-2">

              {/* Status + Subscription */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/30 rounded-xl p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1.5">Status</p>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    viewCompany.isActive
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${viewCompany.isActive ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                    {viewCompany.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="bg-muted/30 rounded-xl p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                  <p className="text-sm font-medium">
                    {viewCompany.activationStart
                      ? new Date(viewCompany.activationStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                      : <span className="text-muted-foreground font-normal">Not set</span>}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-xl p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">End Date</p>
                  <p className="text-sm font-medium">
                    {viewCompany.activationEnd
                      ? new Date(viewCompany.activationEnd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                      : <span className="text-muted-foreground font-normal">Not set</span>}
                  </p>
                </div>
              </div>

              {/* Subscription progress bar */}
              {viewCompany.activationStart && viewCompany.activationEnd && (() => {
                const progress = getSubscriptionProgress(viewCompany.activationStart, viewCompany.activationEnd);
                const daysLeft = getDaysRemaining(viewCompany.activationEnd);
                const expired = daysLeft !== null && daysLeft < 0;
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium">Subscription progress</p>
                      <p className={`text-xs font-semibold ${expired ? "text-red-500" : daysLeft !== null && daysLeft <= 7 ? "text-amber-500" : "text-emerald-500"}`}>
                        {expired ? `Expired ${Math.abs(daysLeft!)}d ago` : daysLeft !== null ? `${daysLeft}d remaining` : ""}
                      </p>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${expired ? "bg-red-500" : daysLeft !== null && daysLeft <= 7 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{progress}% of subscription period elapsed</p>
                  </div>
                );
              })()}

              {/* Token Quota */}
              <div className="bg-muted/30 rounded-xl p-4 border border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly Token Quota</p>
                    <p className="text-sm font-semibold">
                      {viewCompany.monthlyTokenQuota
                        ? <span className="text-blue-400">{formatQuota(viewCompany.monthlyTokenQuota)} tokens / month</span>
                        : <span className="text-muted-foreground">Unlimited</span>}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setViewCompany(null); openQuotaDialog(viewCompany); }}
                  className="text-xs gap-1"
                >
                  <Gauge className="w-3 h-3" /> Adjust
                </Button>
              </div>

              {/* Active integrations */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Integrations</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {[
                    { label: "Website",   active: !!viewCompany.websiteChatbotKey,    icon: <Globe className="w-4 h-4" />,      color: "text-blue-400 bg-blue-500/10 border-blue-500/20"     },
                    { label: "Telegram",  active: !!viewCompany.telegramBotApiKey,    icon: <Send className="w-4 h-4" />,       color: "text-sky-400 bg-sky-500/10 border-sky-500/20"        },
                    { label: "WhatsApp",  active: !!viewCompany.whatsappApiKey,       icon: <Phone className="w-4 h-4" />,      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                    { label: "Sheets",    active: !!viewCompany.googleSheetsEnabled,  icon: <Sheet className="w-4 h-4" />,      color: "text-green-400 bg-green-500/10 border-green-500/20"  },
                    { label: "AI Agent",  active: !!viewCompany.aiAgentApiKey,        icon: <Sparkles className="w-4 h-4" />,   color: "text-violet-400 bg-violet-500/10 border-violet-500/20"},
                  ].map((ch) => (
                    <div
                      key={ch.label}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                        ch.active ? ch.color : "text-muted-foreground/30 bg-muted/20 border-border/50"
                      }`}
                    >
                      {ch.icon}
                      <span className="text-[10px] font-medium">{ch.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Telegram Webhook */}
              {viewCompany.telegramBotApiKey && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-sky-400" />
                      <p className="text-sm font-semibold">Telegram Webhook</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Webhook URL</p>
                    <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto break-all whitespace-pre-wrap">
                      {`${window.location.origin}/api/telegram/webhook/${viewCompany.telegramBotApiKey}`}
                    </pre>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={() => registerTelegramWebhook(viewCompany)}
                      disabled={tgRegistering}
                      className="bg-sky-500 hover:bg-sky-600 text-white gap-1.5"
                    >
                      {tgRegistering
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Registering…</>
                        : <><Zap className="w-3.5 h-3.5" /> Register Webhook</>}
                    </Button>
                    <p className="text-xs text-muted-foreground">Re-register if the bot stops responding</p>
                  </div>
                  {tgStatus && (
                    <div className={`rounded-lg px-3 py-2 text-xs ${tgStatus.ok ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                      {tgStatus.message}
                    </div>
                  )}
                </div>
              )}

              {/* General Info + System Prompt */}
              {(viewCompany.generalInfo || viewCompany.systemPrompt) && (
                <div className="space-y-3">
                  {viewCompany.generalInfo && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">General Info</p>
                      <div className="bg-muted/30 border border-border p-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed">
                        {viewCompany.generalInfo}
                      </div>
                    </div>
                  )}
                  {viewCompany.systemPrompt && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">System Prompt</p>
                      <div className="bg-muted/30 border border-border p-3 rounded-xl text-sm font-mono whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
                        {viewCompany.systemPrompt}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Activity log */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Activity Log</p>
                <ActivityLog companyId={viewCompany.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AI Test dialog ── */}
      <Dialog open={!!aiTestTarget} onOpenChange={(open) => { if (!open) { setAiTestTarget(null); setAiTestResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet-500" />
              Test AI Connection
            </DialogTitle>
            <DialogDescription>
              Sending a test message to <strong>{aiTestTarget?.name}</strong>'s AI agent.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4">
            {aiTestLoading && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-violet-500" />
                <span>Connecting to AI provider and sending test message…</span>
              </div>
            )}

            {!aiTestLoading && aiTestResult && (
              <>
                <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                  aiTestResult.status === "ok"     ? "border-emerald-500/30 bg-emerald-500/10" :
                  aiTestResult.status === "no_key" ? "border-amber-500/30 bg-amber-500/10" :
                                                     "border-red-500/30 bg-red-500/10"
                }`}>
                  {aiTestResult.status === "ok"     ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> :
                   aiTestResult.status === "no_key" ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> :
                                                      <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                  <div className="space-y-0.5">
                    <p className={`font-medium ${
                      aiTestResult.status === "ok"     ? "text-emerald-400" :
                      aiTestResult.status === "no_key" ? "text-amber-400" : "text-red-400"
                    }`}>
                      {aiTestResult.status === "ok"             ? "AI is working correctly" :
                       aiTestResult.status === "no_key"         ? "No API key configured" :
                       aiTestResult.status === "quota_exceeded" ? "Quota / rate limit exceeded" :
                       aiTestResult.status === "invalid_key"    ? "Invalid API key" :
                                                                  "Connection failed"}
                    </p>
                    {aiTestResult.provider && (
                      <p className="text-xs text-muted-foreground font-mono">{aiTestResult.provider} / {aiTestResult.model}</p>
                    )}
                  </div>
                </div>

                {aiTestResult.status === "ok" && aiTestResult.reply && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" /> AI Response
                    </p>
                    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm italic">
                      "{aiTestResult.reply}"
                    </div>
                  </div>
                )}

                {aiTestResult.status !== "ok" && aiTestResult.status !== "no_key" && aiTestResult.message && (
                  <pre className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre-wrap break-all">
                    {aiTestResult.message}
                  </pre>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAiTestTarget(null); setAiTestResult(null); }}>Close</Button>
            {aiTestTarget && !aiTestLoading && (
              <Button onClick={() => runAiTest(aiTestTarget)} className="bg-violet-500 hover:bg-violet-600 text-white gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> Run Again
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Telegram Webhook dialog ── */}
      <Dialog open={!!tgWebhookTarget} onOpenChange={(open) => { if (!open) { setTgWebhookTarget(null); setTgStatus(null); setTgRegistering(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-500" />
              Register Telegram Webhook
            </DialogTitle>
            <DialogDescription>
              Tell Telegram to forward all messages from <strong>{tgWebhookTarget?.name}</strong>'s bot to this server.
            </DialogDescription>
          </DialogHeader>

          {tgWebhookTarget && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Webhook URL</p>
                <pre className="bg-muted/40 border border-border rounded-lg px-3 py-2.5 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {`${window.location.origin}/api/telegram/webhook/${tgWebhookTarget.telegramBotApiKey}`}
                </pre>
              </div>
              {!tgWebhookTarget.isActive && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  This company is inactive. The webhook will register but the bot won't reply until activated.
                </div>
              )}
              {tgStatus && (
                <div className={`rounded-lg border px-3 py-2.5 text-sm ${tgStatus.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                  {tgStatus.message}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setTgWebhookTarget(null); setTgStatus(null); }}>Cancel</Button>
            <Button
              onClick={() => tgWebhookTarget && registerTelegramWebhook(tgWebhookTarget)}
              disabled={tgRegistering}
              className="bg-sky-500 hover:bg-sky-600 text-white gap-2"
            >
              {tgRegistering
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Registering…</>
                : <><Zap className="w-3.5 h-3.5" /> Register Webhook</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
