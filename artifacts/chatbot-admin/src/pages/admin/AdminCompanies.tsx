import { useState, useMemo } from "react";
import {
  useListCompanies,
  useToggleCompanyStatus,
  useDeleteCompany,
  useGetCompanyActivityLogs,
  getListCompaniesQueryKey,
  getGetClientCompanyQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import {
  Search, MoreVertical, Trash2, Eye, Building2,
  CalendarClock, CheckCircle2, XCircle, Clock, Settings2,
  Gauge, AlertTriangle, Zap, FlaskConical, Loader2, CheckCircle, Bot,
  MessageSquare, Globe, Send, Phone, Sheet, Activity,
  TrendingUp, Users, ShieldCheck, Timer, X, ChevronRight,
  Power, RefreshCw, Sparkles, RotateCcw, Database, FileText, Plug, Code2, ShoppingBag, Stethoscope,
  LayoutDashboard, Bell, Package, Cpu, Coins, MessageCircle, Wrench, Calendar as CalendarIcon, FileSpreadsheet, LifeBuoy, Settings, KeyRound, SlidersHorizontal, Layers,
} from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
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
  myId?: string | null;
  notificationEmail?: string | null;
  resendApiKey?: string | null;
  isActive: boolean;
  activationStart?: string | null;
  activationEnd?: string | null;
  generalInfo?: string | null;
  systemPrompt?: string | null;
  securityPrompt?: string | null;
  googleSheetsEnabled?: boolean;
  googleSheetsLink?: string | null;
  googleSheetsName?: string | null;
  googleSheetsPage?: string | null;
  serviceAccountKey?: string | null;
  googleCalendarEnabled?: boolean;
  googleCalendarId?: string | null;
  googleCalendarTimezone?: string | null;
  googleCalendarDuration?: number | null;
  googleCalendarBookingRules?: string | null;
  googleCalendarServiceAccountKey?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiExecutionMode?: string | null;
  aiAgentApiKey?: string | null;
  aiAgentUrl?: string | null;
  telegramBotApiKey?: string | null;
  telegramBotUsername?: string | null;
  telegramEnabled?: boolean | null;
  whatsappApiToken?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessAccountId?: string | null;
  whatsappNumber?: string | null;
  whatsappEnabled?: boolean | null;
  messengerApiKey?: string | null;
  messengerPageId?: string | null;
  messengerEnabled?: boolean | null;
  websiteChatbotKey?: string | null;
  widgetAllowedDomains?: string | null;
  widgetEnabled?: boolean | null;
  websiteDataUrl?: string | null;
  websiteAutoSync?: boolean;
  websiteLastSynced?: string | null;
  monthlyTokenQuota?: number | null;
  chatLogRetentionDays?: number | null;
  allowSourceWebsite?: boolean | null;
  allowSourceFiles?: boolean | null;
  allowSourceWordpress?: boolean | null;
  allowSourceRestApi?: boolean | null;
  allowSourceShopify?: boolean | null;
  businessType?: string | null;
  enabledClientPages?: string[] | null;
  createdAt: string;
};

export const CLIENT_PAGES_META = [
  { id: "dashboard",       titleAr: "لوحة التحكم",                     titleEn: "Dashboard",                   icon: LayoutDashboard, category: "main" },
  { id: "notifications",   titleAr: "الإشعارات",                       titleEn: "Notifications",               icon: Bell,            category: "main" },
  { id: "company",         titleAr: "ملف الشركة",                     titleEn: "Company Profile",             icon: Building2,       category: "main" },
  { id: "packages",        titleAr: "الباقات والاشتراكات",             titleEn: "Packages & Plans",            icon: Package,         category: "main" },
  { id: "ai_model",        titleAr: "نموذج الذكاء الاصطناعي",          titleEn: "AI Model & Provider",         icon: Cpu,             category: "ai" },
  { id: "usage",           titleAr: "الحصة الشهرية والاستهلاك",         titleEn: "Token Quota / Usage",         icon: Coins,           category: "ai" },
  { id: "knowledge",       titleAr: "قاعدة المعرفة ومصادر البيانات",    titleEn: "Knowledge & Data Sources",    icon: Database,        category: "data" },
  { id: "channels",        titleAr: "قنوات التواصل (تيليجرام، واتساب)", titleEn: "Channels (TG, WA, Messenger)", icon: MessageCircle,   category: "channels" },
  { id: "tools",           titleAr: "الأدوات (تقويم وجداول Google)",   titleEn: "Tools (Calendar & Sheets)",   icon: Wrench,          category: "tools" },
  { id: "chat_logs",       titleAr: "سجل المحادثات",                   titleEn: "Chat Logs",                   icon: MessageSquare,   category: "crm" },
  { id: "leads",           titleAr: "العملاء المحتملين والحجوزات",     titleEn: "Leads & Bookings CRM",        icon: Users,           category: "crm" },
  { id: "universal_chat",  titleAr: "الشات الموحد",                   titleEn: "Universal Chat",              icon: Sparkles,        category: "crm" },
  { id: "widget_preview",  titleAr: "معاينة الشات بوت (Widget)",       titleEn: "Widget Preview",              icon: Bot,             category: "channels" },
  { id: "support",         titleAr: "الدعم والتذاكر",                 titleEn: "Support & Tickets",           icon: LifeBuoy,        category: "support" },
  { id: "malfunctions",    titleAr: "سجل الأعطال",                     titleEn: "Malfunctions",                icon: AlertTriangle,   category: "support" },
  { id: "webhook_history", titleAr: "سجل الويب هوك",                  titleEn: "Webhook History",             icon: Zap,             category: "support" },
  { id: "settings",        titleAr: "الإعدادات",                       titleEn: "Settings",                    icon: Settings,        category: "main" },
];

type Filter = "all" | "active" | "inactive" | "expiring" | "clinic" | "general";

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

const RETENTION_PRESETS = [
  { label: "1 Day", value: 1 },
  { label: "3 Days", value: 3 },
  { label: "7 Days", value: 7 },
  { label: "14 Days", value: 14 },
  { label: "30 Days", value: 30 },
  { label: "60 Days", value: 60 },
  { label: "90 Days", value: 90 },
  { label: "180 Days", value: 180 },
  { label: "365 Days", value: 365 },
];

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  activated:            { label: "Activated",             icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-emerald-500" },
  deactivated:          { label: "Deactivated",           icon: <XCircle className="w-3.5 h-3.5" />,      color: "text-amber-500"  },
  expired:              { label: "Auto-expired",          icon: <Clock className="w-3.5 h-3.5" />,         color: "text-red-500"    },
  dates_set:            { label: "Window updated",        icon: <CalendarClock className="w-3.5 h-3.5" />, color: "text-blue-500"   },
  retention_policy_set: { label: "Auto-Delete Policy",    icon: <Clock className="w-3.5 h-3.5" />,         color: "text-amber-500"  },
};

// ── Knowledge Data Sources ──────────────────────────────────────────────────
function KnowledgeDataSources({ company }: { company: Company }) {
  const { data, isLoading } = useQuery({
    queryKey: ["company-data-sources", company.id],
    queryFn: async () => {
      const res = await customFetch(`/api/admin/companies/${company.id}/data-sources`);
      return res as {
        knowledgeFiles: { count: number; totalSize: number };
        wordpress: { apiUrl: string; status: string; lastSynced: string | null; totalItems: number } | null;
      };
    },
  });

  return (
    <div className="space-y-4">
      {/* Uploaded Files */}
      <div className="flex items-center justify-between bg-muted/20 border border-border p-3 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Sheet className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Uploaded Files</p>
            <p className="text-xs text-muted-foreground">CSVs, and Excel sheets</p>
          </div>
        </div>
        <div className="text-right">
          {isLoading ? (
            <Skeleton className="w-16 h-5" />
          ) : (
            <p className="text-sm font-medium">{data?.knowledgeFiles.count ?? 0} files</p>
          )}
        </div>
      </div>

      {/* Website Sync */}
      <div className="flex items-start justify-between bg-muted/20 border border-border p-3 rounded-xl">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0 mt-0.5">
            <Globe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Website Sync</p>
            {company.websiteDataUrl ? (
              <div className="flex flex-col gap-1 mt-1">
                {company.websiteDataUrl
                  .split(/[\n,;]+/)
                  .map((url) => url.trim())
                  .filter(Boolean)
                  .map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 truncate max-w-sm sm:max-w-md group"
                      title={url}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="truncate underline-offset-2 group-hover:underline">{url}</span>
                    </a>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not configured</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          {company.websiteDataUrl ? (
            company.websiteAutoSync ? (
              <Badge variant="outline" className="text-emerald-500 bg-emerald-500/10 border-emerald-500/20">Auto-sync ON</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Manual</Badge>
            )
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
          )}
        </div>
      </div>

      {/* WordPress */}
      <div className="flex items-center justify-between bg-muted/20 border border-border p-3 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium">WordPress Integration</p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Loading..." : data?.wordpress?.apiUrl ?? "Not configured"}
            </p>
          </div>
        </div>
        <div className="text-right">
          {isLoading ? (
            <Skeleton className="w-16 h-5" />
          ) : data?.wordpress ? (
            <Badge variant="outline" className="text-indigo-500 bg-indigo-500/10 border-indigo-500/20">
              {data.wordpress.totalItems} items
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
          )}
        </div>
      </div>
      
      {/* Google Sheets */}
      <div className="flex items-center justify-between bg-muted/20 border border-border p-3 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
            <Sheet className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Google Sheets</p>
            <p className="text-xs text-muted-foreground">
              {company.googleSheetsEnabled ? "Enabled" : "Not configured"}
            </p>
          </div>
        </div>
        <div className="text-right">
          {company.googleSheetsEnabled ? (
            <Badge variant="outline" className="text-green-500 bg-green-500/10 border-green-500/20">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

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
    { key: "web",      active: !!company.widgetEnabled,    icon: <Globe className="w-3 h-3" />,  label: "Website"  },
    { key: "telegram", active: !!company.telegramEnabled && !!company.telegramBotApiKey,  icon: <Send className="w-3 h-3" />,   label: "Telegram" },
    { key: "whatsapp", active: !!company.whatsappEnabled && !!company.whatsappApiToken,  icon: <Phone className="w-3 h-3" />,   label: "WhatsApp" },
    { key: "messenger",active: !!company.messengerEnabled && !!company.messengerApiKey, icon: <MessageSquare className="w-3 h-3" />, label: "Messenger" },
    { key: "sheets",   active: !!company.googleSheetsEnabled && !!company.serviceAccountKey, icon: <Sheet className="w-3 h-3" />, label: "Sheets" },
    { key: "ai",       active: !!company.aiAgentApiKey,      icon: <Sparkles className="w-3 h-3" />, label: "AI Agent" },
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
    <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-xl p-4 flex items-center gap-4 border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
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
  const { t, lang } = useLanguage();
  const { data: companies, isLoading } = useListCompanies();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [manageCompanyTarget, setManageCompanyTarget] = useState<Company | null>(null);
  const [manageActiveTab, setManageActiveTab] = useState<"pages" | "profile" | "ai" | "channels" | "tools" | "subscription">("pages");
  const [manageForm, setManageForm] = useState<any>({});
  const [isSavingContent, setIsSavingContent] = useState(false);

  const openManageCompanyDialog = (company: Company) => {
    const freshCompany = companies?.find((c) => c.id === company.id) || company;
    setManageCompanyTarget(freshCompany);
    setManageActiveTab("pages");
    setManageForm({
      enabledClientPages: Array.isArray(freshCompany.enabledClientPages)
        ? [...freshCompany.enabledClientPages]
        : (freshCompany.isActive === false
            ? ["company", "packages", "support", "settings", "notifications"]
            : CLIENT_PAGES_META.map((p) => p.id)),
      name: freshCompany.name || "",
      myId: freshCompany.myId || "",
      generalInfo: freshCompany.generalInfo || "",
      notificationEmail: freshCompany.notificationEmail || "",
      resendApiKey: freshCompany.resendApiKey || "",
      businessType: freshCompany.businessType || "general",
      systemPrompt: freshCompany.systemPrompt || "",
      securityPrompt: freshCompany.securityPrompt || "",
      aiProvider: freshCompany.aiProvider || "openai",
      aiModel: freshCompany.aiModel || "gpt-4o-mini",
      aiExecutionMode: freshCompany.aiExecutionMode || "quota",
      aiAgentApiKey: freshCompany.aiAgentApiKey || "",
      aiAgentUrl: freshCompany.aiAgentUrl || "",
      telegramEnabled: freshCompany.telegramEnabled ?? false,
      telegramBotApiKey: freshCompany.telegramBotApiKey || "",
      telegramBotUsername: freshCompany.telegramBotUsername || "",
      whatsappEnabled: freshCompany.whatsappEnabled ?? false,
      whatsappApiToken: freshCompany.whatsappApiToken || "",
      whatsappPhoneNumberId: freshCompany.whatsappPhoneNumberId || "",
      whatsappBusinessAccountId: freshCompany.whatsappBusinessAccountId || "",
      whatsappNumber: freshCompany.whatsappNumber || "",
      messengerEnabled: freshCompany.messengerEnabled ?? false,
      messengerApiKey: freshCompany.messengerApiKey || "",
      messengerPageId: freshCompany.messengerPageId || "",
      widgetEnabled: freshCompany.widgetEnabled ?? false,
      websiteChatbotKey: freshCompany.websiteChatbotKey || "",
      widgetAllowedDomains: freshCompany.widgetAllowedDomains || "",
      googleSheetsEnabled: freshCompany.googleSheetsEnabled ?? false,
      googleSheetsLink: freshCompany.googleSheetsLink || "",
      googleSheetsName: freshCompany.googleSheetsName || "",
      googleSheetsPage: freshCompany.googleSheetsPage || "",
      serviceAccountKey: freshCompany.serviceAccountKey || "",
      googleCalendarEnabled: freshCompany.googleCalendarEnabled ?? false,
      googleCalendarId: freshCompany.googleCalendarId || "",
      googleCalendarTimezone: freshCompany.googleCalendarTimezone || "UTC",
      googleCalendarDuration: freshCompany.googleCalendarDuration || 30,
      googleCalendarBookingRules: freshCompany.googleCalendarBookingRules || "",
      googleCalendarServiceAccountKey: freshCompany.googleCalendarServiceAccountKey || "",
      isActive: freshCompany.isActive ?? false,
      monthlyTokenQuota: freshCompany.monthlyTokenQuota !== undefined && freshCompany.monthlyTokenQuota !== null ? String(freshCompany.monthlyTokenQuota) : "",
      activationStart: toDateInputValue(freshCompany.activationStart),
      activationEnd: toDateInputValue(freshCompany.activationEnd),
      chatLogRetentionDays: freshCompany.chatLogRetentionDays !== undefined && freshCompany.chatLogRetentionDays !== null ? String(freshCompany.chatLogRetentionDays) : "7",
    });
  };

  const togglePage = async (pageId: string) => {
    if (!manageCompanyTarget) return;

    const current: string[] = Array.isArray(manageForm.enabledClientPages)
      ? manageForm.enabledClientPages
      : (manageCompanyTarget.isActive === false
          ? ["company", "packages", "support", "settings", "notifications"]
          : CLIENT_PAGES_META.map((p) => p.id));

    const exists = current.includes(pageId);
    const updatedPages = exists
      ? current.filter((id: string) => id !== pageId)
      : [...current, pageId];

    // 1. Update form state immediately for instant UI response
    setManageForm((prev: any) => ({
      ...prev,
      enabledClientPages: updatedPages,
    }));

    // 2. Update target company state so if reopened/navigated it never reverts
    setManageCompanyTarget((prev: any) => (prev ? { ...prev, enabledClientPages: updatedPages } : prev));

    // 3. Optimistically update React Query cache for list of companies
    queryClient.setQueryData(getListCompaniesQueryKey(), (old: Company[] | undefined) => {
      if (!old) return old;
      return old.map((c) => (c.id === manageCompanyTarget.id ? { ...c, enabledClientPages: updatedPages } : c));
    });

    // 4. Auto-save in background to backend
    try {
      await customFetch(`/api/admin/companies/${manageCompanyTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledClientPages: updatedPages }),
      });
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
    } catch (err: any) {
      console.error("Auto-save page toggle error:", err);
    }
  };

  const setPresetPages = async (preset: "all" | "onboarding" | "core" | "none") => {
    if (!manageCompanyTarget) return;
    let pages: string[] = [];
    if (preset === "all") {
      pages = CLIENT_PAGES_META.map((p) => p.id);
    } else if (preset === "onboarding") {
      pages = ["company", "packages", "support", "settings", "notifications"];
    } else if (preset === "core") {
      pages = ["dashboard", "notifications", "company", "packages", "ai_model", "usage", "channels", "tools", "chat_logs", "leads", "support", "settings"];
    } else if (preset === "none") {
      pages = [];
    }

    setManageForm((prev: any) => ({ ...prev, enabledClientPages: pages }));
    setManageCompanyTarget((prev: any) => (prev ? { ...prev, enabledClientPages: pages } : prev));

    queryClient.setQueryData(getListCompaniesQueryKey(), (old: Company[] | undefined) => {
      if (!old) return old;
      return old.map((c) => (c.id === manageCompanyTarget.id ? { ...c, enabledClientPages: pages } : c));
    });

    try {
      await customFetch(`/api/admin/companies/${manageCompanyTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledClientPages: pages }),
      });
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      toast({
        title: lang === "ar" ? "تم الحفظ تلقائياً" : "Auto-saved",
        description: lang === "ar" ? "تم تحديث صفحات القائمة الجانبية بنجاح" : "Sidebar pages updated successfully",
      });
    } catch (err: any) {
      console.error("Auto-save preset error:", err);
    }
  };

  const handleSaveCompanyHub = async () => {
    if (!manageCompanyTarget) return;
    setIsSavingContent(true);
    try {
      const payload: Record<string, any> = {
        name: manageForm.name,
        myId: manageForm.myId,
        generalInfo: manageForm.generalInfo,
        notificationEmail: manageForm.notificationEmail,
        resendApiKey: manageForm.resendApiKey,
        businessType: manageForm.businessType,
        systemPrompt: manageForm.systemPrompt,
        securityPrompt: manageForm.securityPrompt,
        aiProvider: manageForm.aiProvider,
        aiModel: manageForm.aiModel,
        aiExecutionMode: manageForm.aiExecutionMode,
        aiAgentApiKey: manageForm.aiAgentApiKey,
        aiAgentUrl: manageForm.aiAgentUrl,
        isActive: manageForm.isActive,
        monthlyTokenQuota: manageForm.monthlyTokenQuota ? Number(manageForm.monthlyTokenQuota) : null,
        activationStart: toIsoFromInput(manageForm.activationStart),
        activationEnd: toIsoFromInput(manageForm.activationEnd),
        chatLogRetentionDays: manageForm.chatLogRetentionDays ? Number(manageForm.chatLogRetentionDays) : null,
        telegramEnabled: manageForm.telegramEnabled,
        telegramBotApiKey: manageForm.telegramBotApiKey,
        telegramBotUsername: manageForm.telegramBotUsername,
        whatsappEnabled: manageForm.whatsappEnabled,
        whatsappApiToken: manageForm.whatsappApiToken,
        whatsappPhoneNumberId: manageForm.whatsappPhoneNumberId,
        whatsappBusinessAccountId: manageForm.whatsappBusinessAccountId,
        whatsappNumber: manageForm.whatsappNumber,
        messengerEnabled: manageForm.messengerEnabled,
        messengerApiKey: manageForm.messengerApiKey,
        messengerPageId: manageForm.messengerPageId,
        widgetEnabled: manageForm.widgetEnabled,
        websiteChatbotKey: manageForm.websiteChatbotKey,
        widgetAllowedDomains: manageForm.widgetAllowedDomains,
        googleSheetsEnabled: manageForm.googleSheetsEnabled,
        googleSheetsLink: manageForm.googleSheetsLink,
        googleSheetsName: manageForm.googleSheetsName,
        googleSheetsPage: manageForm.googleSheetsPage,
        serviceAccountKey: manageForm.serviceAccountKey,
        googleCalendarEnabled: manageForm.googleCalendarEnabled,
        googleCalendarId: manageForm.googleCalendarId,
        googleCalendarTimezone: manageForm.googleCalendarTimezone,
        googleCalendarDuration: manageForm.googleCalendarDuration ? Number(manageForm.googleCalendarDuration) : 30,
        googleCalendarBookingRules: manageForm.googleCalendarBookingRules,
        googleCalendarServiceAccountKey: manageForm.googleCalendarServiceAccountKey,
        enabledClientPages: manageForm.enabledClientPages,
      };

      const updated = await customFetch<Company>(`/api/admin/companies/${manageCompanyTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      queryClient.setQueryData(getListCompaniesQueryKey(), (old: Company[] | undefined) => {
        if (!old) return old;
        return old.map((c) => (c.id === manageCompanyTarget.id ? { ...c, ...updated, enabledClientPages: payload.enabledClientPages } : c));
      });

      toast({
        title: lang === "ar" ? "تم الحفظ بنجاح" : "Saved successfully",
        description: lang === "ar" ? "تم تحديث إعدادات ومحتوى صفحات الشركة بنجاح" : "Company pages and content updated successfully",
      });

      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      setManageCompanyTarget(null);
    } catch (err: any) {
      const errorMsg = err?.data?.error || err?.message || (lang === "ar" ? "فشل حفظ التعديلات" : "Failed to update company");
      toast({
        title: lang === "ar" ? "خطأ في الحفظ" : "Save Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsSavingContent(false);
    }
  };
  const [viewCompany, setViewCompany] = useState<Company | null>(null);
  const [editPromptsTarget, setEditPromptsTarget] = useState<Company | null>(null);
  const [editPromptsValue, setEditPromptsValue] = useState({ systemPrompt: "", securityPrompt: "" });
  const [activationTarget, setActivationTarget] = useState<Company | null>(null);
  const [activationForm, setActivationForm] = useState({ isActive: false, start: "", end: "" });
  const [quotaTarget, setQuotaTarget] = useState<Company | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [retentionTarget, setRetentionTarget] = useState<Company | null>(null);
  const [retentionInput, setRetentionInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [tgRegistering, setTgRegistering] = useState(false);
  const [tgStatus, setTgStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [tgWebhookTarget, setTgWebhookTarget] = useState<Company | null>(null);
  const [aiTestTarget, setAiTestTarget] = useState<Company | null>(null);
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    status: string; provider?: string; model?: string; reply?: string; message?: string;
  } | null>(null);
  const [businessTypeTarget, setBusinessTypeTarget] = useState<Company | null>(null);
  const [businessTypeInput, setBusinessTypeInput] = useState<"general" | "clinic">("general");
  const [permissionsTarget, setPermissionsTarget] = useState<Company | null>(null);
  const [permissionsForm, setPermissionsForm] = useState({
    allowSourceWebsite: true,
    allowSourceFiles: true,
    allowSourceWordpress: true,
    allowSourceRestApi: true,
    allowSourceShopify: true,
  });

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
    const clinics = all.filter((c) => c.businessType === "clinic").length;
    const general = all.filter((c) => c.businessType !== "clinic").length;
    return { total: all.length, active: active.length, inactive: all.length - active.length, expiring: expiring.length, clinics, general, totalQuota };
  }, [companies]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((companies ?? []) as Company[]).filter((c) => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.clientName ?? "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filter === "active") return c.isActive;
      if (filter === "inactive") return !c.isActive;
      if (filter === "clinic") return c.businessType === "clinic";
      if (filter === "general") return c.businessType !== "clinic";
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
    try {
      const res = await fetch(`/api/telegram/register-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
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

  const setRetentionMutation = useMutation({
    mutationFn: ({ id, retentionDays }: { id: number; retentionDays: number | null }) =>
      customFetch(`/api/admin/companies/${id}/retention`, {
        method: "PUT",
        body: JSON.stringify({ retentionDays }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      setRetentionTarget(null);
      toast({ title: t("admin_companies_retention_saved") });
    },
    onError: (err: any) => toast({ title: "Failed to save retention policy", description: err.message, variant: "destructive" }),
  });

  const openRetentionDialog = (company: Company) => {
    setRetentionTarget(company);
    setRetentionInput(company.chatLogRetentionDays ? String(company.chatLogRetentionDays) : "");
  };

  const handleSaveRetention = () => {
    if (!retentionTarget) return;
    const val = retentionInput.trim();
    const days = val === "" ? null : parseInt(val.replace(/[^0-9]/g, ""), 10);
    if (val !== "" && (isNaN(days!) || days! < 1 || days! > 365)) {
      toast({ title: "Please enter a valid number of days between 1 and 365, or leave blank for default", variant: "destructive" });
      return;
    }
    setRetentionMutation.mutate({ id: retentionTarget.id, retentionDays: days });
  };

  const setPermissionsMutation = useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: typeof permissionsForm }) =>
      customFetch(`/api/admin/companies/${id}/data-source-permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permissions),
      }),
    onSuccess: (data: any, variables) => {
      const savedPerms = data?.permissions || variables.permissions;
      queryClient.setQueryData(getListCompaniesQueryKey(), (old: Company[] | undefined) => {
        if (!old) return old;
        return old.map((c) =>
          c.id === variables.id ? { ...c, ...savedPerms } : c
        );
      });
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/client/company"] });
      queryClient.invalidateQueries({ queryKey: ["wp-status"] });
      queryClient.invalidateQueries({ queryKey: ["rest-api-status"] });
      queryClient.invalidateQueries({ queryKey: ["shopify-status"] });
      setPermissionsTarget(null);
      toast({ title: t("admin_data_source_permissions_saved") });
    },
    onError: (err: any) =>
      toast({ title: "Failed to save permissions", description: err.message, variant: "destructive" }),
  });

  const updateBusinessTypeMutation = useMutation({
    mutationFn: async ({ id, businessType }: { id: number; businessType: string }) => {
      return customFetch(`/api/admin/companies/${id}/business-type`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/client/company"] });
      setBusinessTypeTarget(null);
      toast({
        title: lang === "ar" ? "تم تحديد نوع النشاط بنجاح" : "Business type updated successfully",
      });
    },
    onError: (err: any) =>
      toast({ title: "Failed to update business type", description: err.message, variant: "destructive" }),
  });

  const openPermissionsDialog = (company: Company) => {
    setPermissionsTarget(company);
    setPermissionsForm({
      allowSourceWebsite: company.allowSourceWebsite === false ? false : true,
      allowSourceFiles: company.allowSourceFiles === false ? false : true,
      allowSourceWordpress: company.allowSourceWordpress === false ? false : true,
      allowSourceRestApi: company.allowSourceRestApi === false ? false : true,
      allowSourceShopify: company.allowSourceShopify === false ? false : true,
    });
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
    { key: "clinic",   label: lang === "ar" ? "عيادات طبية" : "Clinics", count: stats.clinics },
    { key: "general",  label: lang === "ar" ? "شركات عامة" : "General", count: stats.general },
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
      <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 overflow-hidden border-l-4 border-l-[#2D5BE3]">
        <div className="overflow-x-auto">
        {/* Table header */}
        <div className="grid grid-cols-[70px_minmax(110px,2fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_100px_110px_110px_120px_80px_110px_44px] gap-0 border-b border-border bg-muted/30 px-4 py-3 min-w-[1160px]">
          {["My ID", "Company", "Company Name", "Client", "Status", "Start Date", "End Date", "Channels", "Quota", "Auto-Delete", ""].map((h, i, arr) => (
            <div key={i} className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider ${i === 2 ? "px-2 text-center relative -left-[35px]" : "px-2"} ${i === arr.length - 1 ? "sticky right-0 bg-muted/30" : ""}`}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="divide-y divide-border min-w-[1160px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[70px_minmax(110px,2fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_100px_110px_110px_120px_80px_110px_44px] gap-0 px-4 py-4 items-center">
                <div className="px-2"><Skeleton className="h-4 w-10" /></div>
                <div className="flex items-center px-2">
                  <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
                </div>
                <div className="px-2 flex justify-center"><Skeleton className="h-4 w-24" /></div>
                <div className="px-2"><Skeleton className="h-4 w-20" /></div>
                <div className="px-2"><Skeleton className="h-6 w-16 rounded-full" /></div>
                <div className="px-2"><Skeleton className="h-3 w-20" /></div>
                <div className="px-2"><Skeleton className="h-3 w-20" /></div>
                <div className="px-2"><Skeleton className="h-4 w-20" /></div>
                <div className="px-2"><Skeleton className="h-4 w-14" /></div>
                <div className="px-2"><Skeleton className="h-4 w-16" /></div>
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
          <div className="divide-y divide-border min-w-[1160px]">
            {filtered.map((company) => {
              const daysLeft = getDaysRemaining(company.activationEnd);
              const isExpired = daysLeft !== null && daysLeft < 0;
              const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

              return (
                <div
                  key={company.id}
                  className="group grid grid-cols-[70px_minmax(110px,2fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_100px_110px_110px_120px_80px_110px_44px] gap-0 px-4 py-3.5 items-center hover:bg-muted/20 transition-colors"
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
                  <div className="px-2 min-w-0 flex justify-center relative -left-[35px]">
                      <div className="flex flex-col items-center">
                        <span className="text-sm truncate font-medium">{company.name}</span>
                        <div className="mt-1">
                          {company.businessType === "clinic" ? (
                            <Badge variant="outline" className="bg-teal-500/10 text-teal-600 border-teal-500/30 gap-1 text-[10px] px-1.5 py-0 h-4">
                              <Stethoscope className="w-2.5 h-2.5" />
                              {lang === "ar" ? "عيادة طبية" : "Clinic"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 gap-1 text-[10px] px-1.5 py-0 h-4">
                              <Building2 className="w-2.5 h-2.5" />
                              {lang === "ar" ? "شركة عامة" : "General"}
                            </Badge>
                          )}
                        </div>
                      </div>
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
                      <span className="text-xs text-muted-foreground/50">No Quota</span>
                    )}
                  </div>

                  {/* Auto-Delete Policy */}
                  <div className="px-2">
                    <button
                      onClick={() => openRetentionDialog(company)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 border border-border px-2 py-1 rounded-md transition-colors"
                      title="Configure auto-delete policy"
                    >
                      <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="font-medium truncate">
                        {company.chatLogRetentionDays ? `${company.chatLogRetentionDays}d` : "Default (7d)"}
                      </span>
                    </button>
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
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                          {company.name}
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => openManageCompanyDialog(company)}
                          className="font-semibold text-primary focus:text-primary bg-primary/10 focus:bg-primary/15 mb-1 cursor-pointer"
                        >
                          <Settings2 className="w-4 h-4 mr-2 text-primary" />
                          {lang === "ar" ? "إدارة صفحات ومحتوى الشركة" : "Manage Pages & Content"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setBusinessTypeTarget(company);
                          setBusinessTypeInput((company.businessType as "general" | "clinic") || "general");
                        }}>
                          <Stethoscope className="w-4 h-4 mr-2 text-teal-500" />
                          {lang === "ar" ? "تحديد نوع النشاط (عيادة / عام)" : "Set Business Type"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        <DropdownMenuItem onClick={() => setViewCompany(company)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                          <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground" />
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setEditPromptsTarget(company);
                          setEditPromptsValue({
                            systemPrompt: company.systemPrompt || "",
                            securityPrompt: company.securityPrompt || ""
                          });
                        }}>
                          <Shield className="w-4 h-4 mr-2" />
                          Edit System & Security Prompts
                        </DropdownMenuItem>


                        <DropdownMenuItem onClick={() => openActivationDialog(company)}>
                          <Power className="w-4 h-4 mr-2" />
                          Subscription Settings
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => openPermissionsDialog(company)}>
                          <Database className="w-4 h-4 mr-2 text-indigo-500" />
                          {t("admin_data_source_permissions")}
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => openQuotaDialog(company)}>
                          <Gauge className="w-4 h-4 mr-2" />
                          Set Token Quota
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => openRetentionDialog(company)}>
                          <Clock className="w-4 h-4 mr-2 text-amber-500" />
                          {t("admin_companies_retention_menu")}
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

      {/* ── Manage Company Hub & Content Editor (Sidebar Pages + Page Content) ── */}
      <Dialog open={!!manageCompanyTarget} onOpenChange={(open) => !open && setManageCompanyTarget(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="p-5 pb-3 border-b border-border bg-muted/20">
            {manageCompanyTarget && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(manageCompanyTarget.id)} flex items-center justify-center text-white font-bold shrink-0 shadow`}>
                    {getInitials(manageCompanyTarget.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-lg font-bold">
                        {manageCompanyTarget.name}
                      </DialogTitle>
                      <Badge variant="outline" className="font-mono text-xs">
                        #{manageCompanyTarget.id}
                      </Badge>
                      {manageCompanyTarget.isActive ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                          {lang === "ar" ? "مفعل" : "Active"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {lang === "ar" ? "معطل" : "Inactive"}
                        </Badge>
                      )}
                    </div>
                    <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                      {lang === "ar"
                        ? "التحكم في صفحات القائمة الجانبية للعميل وإدارة المحتوى الكامل لكل صفحة"
                        : "Control client sidebar menu pages & manage content for each page"}
                    </DialogDescription>
                  </div>
                </div>

                {/* Tabs Selector Bar */}
                <div className="flex items-center gap-1 overflow-x-auto bg-muted/60 p-1 rounded-xl border border-border/60 self-start sm:self-auto">
                  {[
                    { id: "pages",        labelAr: "صفحات القائمة",     labelEn: "Sidebar Pages",  icon: Settings2 },
                    { id: "profile",      labelAr: "ملف الشركة",        labelEn: "Profile",        icon: Building2 },
                    { id: "ai",           labelAr: "الذكاء الاصطناعي",  labelEn: "AI & Prompts",   icon: Sparkles },
                    { id: "channels",     labelAr: "قنوات التواصل",      labelEn: "Channels",       icon: MessageCircle },
                    { id: "tools",        labelAr: "الأدوات والربط",    labelEn: "Tools",          icon: Wrench },
                    { id: "subscription", labelAr: "الاشتراك والحصة",   labelEn: "Subscription",   icon: Gauge },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = manageActiveTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setManageActiveTab(tab.id as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{lang === "ar" ? tab.labelAr : tab.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </DialogHeader>

          {/* Scrollable Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {manageCompanyTarget && (
              <>
                {/* ── TAB 1: SIDEBAR PAGES CONTROL ── */}
                {manageActiveTab === "pages" && (
                  <div className="space-y-5">
                    {/* Header bar with counter & presets */}
                    <div className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal className="w-4 h-4 text-primary" />
                          <h4 className="text-sm font-bold">
                            {lang === "ar" ? "الصفحات المتاحة في قائمة العميل" : "Pages in Client Menu"}
                          </h4>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold px-2">
                            {Array.isArray(manageForm.enabledClientPages) ? manageForm.enabledClientPages.length : 17} / {CLIENT_PAGES_META.length}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {lang === "ar"
                            ? "حدد الصفحات التي تود ظهورها في القائمة الجانبية للعميل. الصفحات المعطلة سيتم إخفاؤها وحظر زيارتها."
                            : "Select pages that will appear in the client's sidebar. Disabled pages will be hidden and blocked."}
                        </p>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPresetPages("all")}
                          className="text-xs h-7 px-2.5"
                        >
                          {lang === "ar" ? "تفعيل الكل" : "Enable All"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPresetPages("core")}
                          className="text-xs h-7 px-2.5"
                        >
                          {lang === "ar" ? "الوضع الأساسي" : "Core"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPresetPages("onboarding")}
                          className="text-xs h-7 px-2.5 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        >
                          {lang === "ar" ? "الوضع المبدئي (Onboarding)" : "Onboarding"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPresetPages("none")}
                          className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                        >
                          {lang === "ar" ? "إلغاء الكل" : "None"}
                        </Button>
                      </div>
                    </div>

                    {/* Pages Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {CLIENT_PAGES_META.map((page) => {
                        const Icon = page.icon;
                        const isEnabled = Array.isArray(manageForm.enabledClientPages)
                          ? manageForm.enabledClientPages.includes(page.id)
                          : true;

                        return (
                          <div
                            key={page.id}
                            onClick={() => togglePage(page.id)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isEnabled
                                ? "bg-primary/5 border-primary/30 shadow-sm"
                                : "bg-card border-border/70 opacity-60 hover:opacity-90"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                              }`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold truncate">
                                  {lang === "ar" ? page.titleAr : page.titleEn}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {lang === "ar" ? page.titleEn : page.titleAr}
                                </p>
                              </div>
                            </div>
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={() => togglePage(page.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 scale-90"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── TAB 2: COMPANY PROFILE CONTENT ── */}
                {manageActiveTab === "profile" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "اسم الشركة" : "Company Name"}</Label>
                        <Input
                          value={manageForm.name || ""}
                          onChange={(e) => setManageForm({ ...manageForm, name: e.target.value })}
                          className="mt-1"
                          placeholder="e.g. Acme Corp"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "المعرف المخصص (My ID)" : "Custom ID (My ID)"}</Label>
                        <Input
                          value={manageForm.myId || ""}
                          onChange={(e) => setManageForm({ ...manageForm, myId: e.target.value })}
                          className="mt-1 font-mono text-xs"
                          placeholder="e.g. ACME-001"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">{lang === "ar" ? "نوع النشاط التجاري لنظام CRM" : "CRM Business Type"}</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
                        <div
                          onClick={() => setManageForm({ ...manageForm, businessType: "general" })}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            manageForm.businessType !== "clinic"
                              ? "bg-blue-500/10 border-blue-500/40 shadow-sm"
                              : "bg-card border-border opacity-70 hover:opacity-100"
                          }`}
                        >
                          <Building2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-foreground">
                              {lang === "ar" ? "شركة عامة (General Leads CRM)" : "General Leads CRM"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                              {lang === "ar" ? "تتبع العملاء المحتملين والتواصل التجاري العام." : "Standard customer leads tracking."}
                            </p>
                          </div>
                        </div>

                        <div
                          onClick={() => setManageForm({ ...manageForm, businessType: "clinic" })}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            manageForm.businessType === "clinic"
                              ? "bg-teal-500/10 border-teal-500/40 shadow-sm"
                              : "bg-card border-border opacity-70 hover:opacity-100"
                          }`}
                        >
                          <Stethoscope className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-foreground">
                              {lang === "ar" ? "عيادة طبية (Clinic & Appointments CRM)" : "Clinic Appointments CRM"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                              {lang === "ar" ? "تتبع المرضى وحجوزات الكشف والعيادات التخصصية." : "Patients records, doctors & clinic bookings."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "البريد الإلكتروني للإشعارات" : "Notification Email"}</Label>
                        <Input
                          value={manageForm.notificationEmail || ""}
                          onChange={(e) => setManageForm({ ...manageForm, notificationEmail: e.target.value })}
                          className="mt-1"
                          placeholder="alerts@company.com"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {lang === "ar" ? "يستقبل تنبيهات نفاد الحصة، محاولات الاختراق، والأعطال." : "Receives quota, malfunction & security alerts."}
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "مفتاح Resend API الخاص بالشركة" : "Resend API Key"}</Label>
                        <Input
                          type="password"
                          value={manageForm.resendApiKey || ""}
                          onChange={(e) => setManageForm({ ...manageForm, resendApiKey: e.target.value })}
                          className="mt-1 font-mono text-xs"
                          placeholder="re_••••••••••••••••"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {lang === "ar" ? "اتركه فارغاً لاستخدام المفتاح العام للمنصة." : "Leave unchanged to keep existing key."}
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">{lang === "ar" ? "نبذة ومعلومات النشاط التجاري (General Info)" : "General Business Info"}</Label>
                      <Textarea
                        value={manageForm.generalInfo || ""}
                        onChange={(e) => setManageForm({ ...manageForm, generalInfo: e.target.value })}
                        className="mt-1 min-h-[90px] text-xs leading-relaxed"
                        placeholder={lang === "ar" ? "نبذة عن خدمات ومنتجات الشركة، مواعيد العمل، الأسعار، الفروع..." : "Business description, services, operating hours, prices..."}
                      />
                    </div>
                  </div>
                )}

                {/* ── TAB 3: AI MODEL & PROMPTS CONTENT ── */}
                {manageActiveTab === "ai" && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold flex items-center justify-between">
                        <span>{lang === "ar" ? "البرومبت التوجيهي للنظام (System Prompt)" : "System Prompt"}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {manageForm.systemPrompt?.length || 0} {lang === "ar" ? "حرف" : "chars"}
                        </span>
                      </Label>
                      <Textarea
                        value={manageForm.systemPrompt || ""}
                        onChange={(e) => setManageForm({ ...manageForm, systemPrompt: e.target.value })}
                        className="mt-1 min-h-[140px] font-mono text-xs leading-relaxed"
                        placeholder="You are a helpful AI customer service assistant for..."
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold flex items-center justify-between">
                        <span>{lang === "ar" ? "برومبت الأمان والحماية (Security Prompt)" : "Security Prompt"}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {manageForm.securityPrompt?.length || 0} {lang === "ar" ? "حرف" : "chars"}
                        </span>
                      </Label>
                      <Textarea
                        value={manageForm.securityPrompt || ""}
                        onChange={(e) => setManageForm({ ...manageForm, securityPrompt: e.target.value })}
                        className="mt-1 min-h-[90px] font-mono text-xs leading-relaxed"
                        placeholder="Security instructions, anti-jailbreak rules..."
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "مزود الذكاء الاصطناعي" : "AI Provider"}</Label>
                        <select
                          value={manageForm.aiProvider || "openai"}
                          onChange={(e) => setManageForm({ ...manageForm, aiProvider: e.target.value })}
                          className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-xs font-medium"
                        >
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic Claude</option>
                          <option value="google">Google Gemini</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                      </div>

                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "اسم الموديل (Model)" : "AI Model"}</Label>
                        <Input
                          value={manageForm.aiModel || ""}
                          onChange={(e) => setManageForm({ ...manageForm, aiModel: e.target.value })}
                          className="mt-1 text-xs"
                          placeholder="e.g. gpt-4o-mini, claude-3-5-sonnet"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "طريقة التنفيذ" : "Execution Mode"}</Label>
                        <select
                          value={manageForm.aiExecutionMode || "quota"}
                          onChange={(e) => setManageForm({ ...manageForm, aiExecutionMode: e.target.value })}
                          className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-xs font-medium"
                        >
                          <option value="quota">{lang === "ar" ? "الحصة الشهرية (Platform Quota)" : "Platform Quota"}</option>
                          <option value="tokens">{lang === "ar" ? "رموز API مخصصة (API Tokens)" : "Custom API Tokens"}</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "مفتاح API الخاص بالشركة (Custom Key)" : "Custom Agent API Key"}</Label>
                        <Input
                          type="password"
                          value={manageForm.aiAgentApiKey || ""}
                          onChange={(e) => setManageForm({ ...manageForm, aiAgentApiKey: e.target.value })}
                          className="mt-1 font-mono text-xs"
                          placeholder="sk-••••••••••••••••"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "رابط سيرفر الذكاء المخصص (Agent URL)" : "Custom Agent URL"}</Label>
                        <Input
                          value={manageForm.aiAgentUrl || ""}
                          onChange={(e) => setManageForm({ ...manageForm, aiAgentUrl: e.target.value })}
                          className="mt-1 text-xs"
                          placeholder="https://api.openai.com/v1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 4: CHANNELS CONTENT ── */}
                {manageActiveTab === "channels" && (
                  <div className="space-y-4">
                    {/* Telegram */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-sky-500" />
                          <h5 className="text-xs font-bold">Telegram Bot</h5>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{lang === "ar" ? "تفعيل تيليجرام" : "Enable Telegram"}</Label>
                          <Switch
                            checked={!!manageForm.telegramEnabled}
                            onCheckedChange={(val) => setManageForm({ ...manageForm, telegramEnabled: val })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Bot Token (API Key)</Label>
                          <Input
                            type="password"
                            value={manageForm.telegramBotApiKey || ""}
                            onChange={(e) => setManageForm({ ...manageForm, telegramBotApiKey: e.target.value })}
                            className="mt-1 font-mono text-xs"
                            placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Bot Username</Label>
                          <Input
                            value={manageForm.telegramBotUsername || ""}
                            onChange={(e) => setManageForm({ ...manageForm, telegramBotUsername: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="@my_company_bot"
                          />
                        </div>
                      </div>
                    </div>

                    {/* WhatsApp */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-emerald-500" />
                          <h5 className="text-xs font-bold">WhatsApp Cloud API</h5>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{lang === "ar" ? "تفعيل واتساب" : "Enable WhatsApp"}</Label>
                          <Switch
                            checked={!!manageForm.whatsappEnabled}
                            onCheckedChange={(val) => setManageForm({ ...manageForm, whatsappEnabled: val })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">API Token</Label>
                          <Input
                            type="password"
                            value={manageForm.whatsappApiToken || ""}
                            onChange={(e) => setManageForm({ ...manageForm, whatsappApiToken: e.target.value })}
                            className="mt-1 font-mono text-xs"
                            placeholder="EAAB••••••••"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Phone Number ID</Label>
                          <Input
                            value={manageForm.whatsappPhoneNumberId || ""}
                            onChange={(e) => setManageForm({ ...manageForm, whatsappPhoneNumberId: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="1029384756..."
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Business Account ID</Label>
                          <Input
                            value={manageForm.whatsappBusinessAccountId || ""}
                            onChange={(e) => setManageForm({ ...manageForm, whatsappBusinessAccountId: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="987654321..."
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">WhatsApp Number</Label>
                          <Input
                            value={manageForm.whatsappNumber || ""}
                            onChange={(e) => setManageForm({ ...manageForm, whatsappNumber: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="+1234567890"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Messenger */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-blue-500" />
                          <h5 className="text-xs font-bold">Facebook Messenger</h5>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{lang === "ar" ? "تفعيل ماسنجر" : "Enable Messenger"}</Label>
                          <Switch
                            checked={!!manageForm.messengerEnabled}
                            onCheckedChange={(val) => setManageForm({ ...manageForm, messengerEnabled: val })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Page Access Token</Label>
                          <Input
                            type="password"
                            value={manageForm.messengerApiKey || ""}
                            onChange={(e) => setManageForm({ ...manageForm, messengerApiKey: e.target.value })}
                            className="mt-1 font-mono text-xs"
                            placeholder="EAAK••••••••"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Page ID</Label>
                          <Input
                            value={manageForm.messengerPageId || ""}
                            onChange={(e) => setManageForm({ ...manageForm, messengerPageId: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="1234567890"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Website Widget */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-violet-500" />
                          <h5 className="text-xs font-bold">Website Chat Widget</h5>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{lang === "ar" ? "تفعيل الويدجت" : "Enable Widget"}</Label>
                          <Switch
                            checked={!!manageForm.widgetEnabled}
                            onCheckedChange={(val) => setManageForm({ ...manageForm, widgetEnabled: val })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Website Chatbot Key</Label>
                          <Input
                            value={manageForm.websiteChatbotKey || ""}
                            onChange={(e) => setManageForm({ ...manageForm, websiteChatbotKey: e.target.value })}
                            className="mt-1 font-mono text-xs"
                            placeholder="wcb_••••••••"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Allowed Domains (comma-separated)</Label>
                          <Input
                            value={manageForm.widgetAllowedDomains || ""}
                            onChange={(e) => setManageForm({ ...manageForm, widgetAllowedDomains: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="https://example.com, https://sub.example.com"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 5: TOOLS & INTEGRATIONS CONTENT ── */}
                {manageActiveTab === "tools" && (
                  <div className="space-y-4">
                    {/* Google Calendar */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-blue-500" />
                          <h5 className="text-xs font-bold">Google Calendar</h5>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{lang === "ar" ? "تفعيل التقويم" : "Enable Calendar"}</Label>
                          <Switch
                            checked={!!manageForm.googleCalendarEnabled}
                            onCheckedChange={(val) => setManageForm({ ...manageForm, googleCalendarEnabled: val })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Calendar ID</Label>
                          <Input
                            value={manageForm.googleCalendarId || ""}
                            onChange={(e) => setManageForm({ ...manageForm, googleCalendarId: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="primary or xxxx@group.calendar.google.com"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Timezone</Label>
                          <Input
                            value={manageForm.googleCalendarTimezone || "UTC"}
                            onChange={(e) => setManageForm({ ...manageForm, googleCalendarTimezone: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="UTC, Asia/Riyadh, Africa/Cairo"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">{lang === "ar" ? "مدة الموعد (بالدقائق)" : "Slot Duration (min)"}</Label>
                          <Input
                            type="number"
                            value={manageForm.googleCalendarDuration || 30}
                            onChange={(e) => setManageForm({ ...manageForm, googleCalendarDuration: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="30"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">{lang === "ar" ? "قواعد وضوابط الحجز (Booking Rules Prompt)" : "Booking Rules Prompt"}</Label>
                        <Textarea
                          value={manageForm.googleCalendarBookingRules || ""}
                          onChange={(e) => setManageForm({ ...manageForm, googleCalendarBookingRules: e.target.value })}
                          className="mt-1 min-h-[60px] text-xs leading-relaxed"
                          placeholder={lang === "ar" ? "مواعيد العمل المتاحة للحجز، إجازات الأسبوع، سياسة الحجز..." : "Available working hours, weekend rules, booking constraints..."}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Google Calendar Service Account JSON</Label>
                        <Textarea
                          value={manageForm.googleCalendarServiceAccountKey || ""}
                          onChange={(e) => setManageForm({ ...manageForm, googleCalendarServiceAccountKey: e.target.value })}
                          className="mt-1 min-h-[60px] font-mono text-xs"
                          placeholder='{"type": "service_account", ...}'
                        />
                      </div>
                    </div>

                    {/* Google Sheets */}
                    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                          <h5 className="text-xs font-bold">Google Sheets</h5>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{lang === "ar" ? "تفعيل جداول جوجل" : "Enable Sheets"}</Label>
                          <Switch
                            checked={!!manageForm.googleSheetsEnabled}
                            onCheckedChange={(val) => setManageForm({ ...manageForm, googleSheetsEnabled: val })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div className="sm:col-span-2">
                          <Label className="text-[11px] text-muted-foreground">Spreadsheet URL</Label>
                          <Input
                            value={manageForm.googleSheetsLink || ""}
                            onChange={(e) => setManageForm({ ...manageForm, googleSheetsLink: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Tab / Page Name</Label>
                          <Input
                            value={manageForm.googleSheetsPage || ""}
                            onChange={(e) => setManageForm({ ...manageForm, googleSheetsPage: e.target.value })}
                            className="mt-1 text-xs"
                            placeholder="Sheet1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Google Sheets Service Account JSON</Label>
                        <Textarea
                          value={manageForm.serviceAccountKey || ""}
                          onChange={(e) => setManageForm({ ...manageForm, serviceAccountKey: e.target.value })}
                          className="mt-1 min-h-[60px] font-mono text-xs"
                          placeholder='{"type": "service_account", ...}'
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 6: SUBSCRIPTION & QUOTA CONTENT ── */}
                {manageActiveTab === "subscription" && (
                  <div className="space-y-4">
                    <div className="bg-muted/30 border border-border p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold">{lang === "ar" ? "حالة اشتراك وتفعيل الشركة" : "Company Active Status"}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {lang === "ar" ? "عند تعطيل الشركة، لن يستجيب الشات بوت للمحادثات الخارجية." : "When disabled, chatbot will not answer incoming messages."}
                        </p>
                      </div>
                      <Switch
                        checked={!!manageForm.isActive}
                        onCheckedChange={(val) => setManageForm({ ...manageForm, isActive: val })}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "الحصة الشهرية من التوكنز (Monthly Quota)" : "Monthly Token Quota"}</Label>
                        <Input
                          type="number"
                          value={manageForm.monthlyTokenQuota || ""}
                          onChange={(e) => setManageForm({ ...manageForm, monthlyTokenQuota: e.target.value })}
                          className="mt-1 text-xs font-mono"
                          placeholder="e.g. 500000 (leave empty for unlimited)"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {lang === "ar" ? "اترك الحقل فارغاً لجعل الحصة غير محدودة." : "Leave empty for unlimited tokens."}
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "سياسة الحذف التلقائي للمحادثات (بالأيام)" : "Chat Log Retention (Days)"}</Label>
                        <Input
                          type="number"
                          value={manageForm.chatLogRetentionDays || ""}
                          onChange={(e) => setManageForm({ ...manageForm, chatLogRetentionDays: e.target.value })}
                          className="mt-1 text-xs font-mono"
                          placeholder="7"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "تاريخ بدء الاشتراك" : "Start Date"}</Label>
                        <Input
                          type="date"
                          value={manageForm.activationStart || ""}
                          onChange={(e) => setManageForm({ ...manageForm, activationStart: e.target.value })}
                          className="mt-1 text-xs"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold">{lang === "ar" ? "تاريخ انتهاء الاشتراك" : "End Date"}</Label>
                        <Input
                          type="date"
                          value={manageForm.activationEnd || ""}
                          onChange={(e) => setManageForm({ ...manageForm, activationEnd: e.target.value })}
                          className="mt-1 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Dialog Footer Actions */}
          <DialogFooter className="p-4 border-t border-border bg-muted/20 flex flex-row items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setManageCompanyTarget(null)}
              disabled={isSavingContent}
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSaveCompanyHub}
              disabled={isSavingContent}
              className="gap-2 bg-primary text-primary-foreground font-semibold shadow-sm"
            >
              {isSavingContent ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              Assign a monthly token quota for <strong>{quotaTarget?.name}</strong> to draw from the Support AI Agent. If no quota is set, Support AI is disabled for this company.
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
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
                <X className="w-3 h-3 mr-1" /> Clear — disable Support AI Quota
              </Button>
            </div>

            <div className="flex items-start gap-2 text-xs bg-violet-500/10 border border-violet-500/20 text-violet-300 dark:text-violet-300 p-2.5 rounded-lg">
              <Zap className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                <strong>Linked to Support AI Agent:</strong> Assigning a quota links this company to the Support AI Agent (configured in <strong>AI / Quota</strong>). The company's bot will use the agent's model & credentials up to this quota limit.
              </span>
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

      {/* ── Auto-Delete Retention Policy Dialog ── */}
      <Dialog open={!!retentionTarget} onOpenChange={(open) => !open && setRetentionTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              {t("admin_companies_retention_dialog_title")}
            </DialogTitle>
            <DialogDescription>
              {t("admin_companies_retention_dialog_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="retention-input">{t("admin_companies_retention_days_label")}</Label>
              <div className="relative">
                <Input
                  id="retention-input"
                  placeholder={t("admin_companies_retention_days_placeholder")}
                  value={retentionInput}
                  onChange={(e) => setRetentionInput(e.target.value.replace(/[^0-9]/g, ""))}
                  className="bg-background font-mono pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {t("admin_companies_retention_custom")}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("admin_companies_retention_presets")}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {RETENTION_PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    type="button"
                    size="sm"
                    variant={retentionInput === String(p.value) ? "default" : "outline"}
                    onClick={() => setRetentionInput(String(p.value))}
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
                className="text-muted-foreground text-xs w-full mt-1"
                onClick={() => setRetentionInput("")}
              >
                <RotateCcw className="w-3 h-3 mr-1" /> {t("admin_companies_retention_reset")}
              </Button>
            </div>

            {retentionTarget && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2.5 rounded-lg">
                <Clock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                <span>
                  {retentionTarget.chatLogRetentionDays
                    ? `${t("admin_companies_retention_badge_custom")}: ${retentionTarget.chatLogRetentionDays} ${t("admin_companies_retention_custom")}`
                    : `${t("admin_companies_retention_badge_default")}: 7 ${t("admin_companies_retention_custom")}`}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetentionTarget(null)}>{t("btn_cancel")}</Button>
            <Button onClick={handleSaveRetention} disabled={setRetentionMutation.isPending}>
              {setRetentionMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />{t("btn_saving")}</> : t("btn_save")}
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
      
      {/* Edit Prompts Dialog */}
      <Dialog open={!!editPromptsTarget} onOpenChange={(open) => !open && setEditPromptsTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-500" />
              Edit Prompts - {editPromptsTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Configure the AI agent's system behavior and security constraints.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>System Prompt (Personality & Instructions)</Label>
              <Textarea 
                value={editPromptsValue.systemPrompt}
                onChange={(e) => setEditPromptsValue(p => ({ ...p, systemPrompt: e.target.value }))}
                className="font-mono text-sm min-h-[120px]"
                placeholder="Enter system prompt..."
              />
            </div>
            <div className="space-y-2">
              <Label>Security Prompt (Constraints & Boundaries)</Label>
              <Textarea 
                value={editPromptsValue.securityPrompt}
                onChange={(e) => setEditPromptsValue(p => ({ ...p, securityPrompt: e.target.value }))}
                className="font-mono text-sm min-h-[120px] bg-red-500/5 border-red-500/20"
                placeholder="Enter security prompt..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPromptsTarget(null)}>Cancel</Button>
            <Button 
              onClick={() => {
                const target = editPromptsTarget;
                if (!target) return;
                fetch(`/api/admin/companies/${target.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                  body: JSON.stringify({ 
                    systemPrompt: editPromptsValue.systemPrompt || null, 
                    securityPrompt: editPromptsValue.securityPrompt || null 
                  })
                }).then(() => {
                  setEditPromptsTarget(null);
                  window.location.reload();
                });
              }}
            >
              Save Prompts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Data Source Permissions Dialog */}
      <Dialog open={!!permissionsTarget} onOpenChange={(open) => !open && setPermissionsTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-500" />
              <DialogTitle>{t("admin_data_source_permissions")}</DialogTitle>
            </div>
            <DialogDescription>
              {permissionsTarget?.name} · {t("admin_data_source_permissions_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            {/* Source 1: Website */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("data_source_website")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("data_source_website_desc")}</p>
                </div>
              </div>
              <Switch
                checked={permissionsForm.allowSourceWebsite}
                onCheckedChange={(checked) => setPermissionsForm((p) => ({ ...p, allowSourceWebsite: checked }))}
              />
            </div>

            {/* Source 2: Files */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("data_source_files")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("data_source_files_desc")}</p>
                </div>
              </div>
              <Switch
                checked={permissionsForm.allowSourceFiles}
                onCheckedChange={(checked) => setPermissionsForm((p) => ({ ...p, allowSourceFiles: checked }))}
              />
            </div>

            {/* Source 3: WordPress */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                  <Plug className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("data_source_wordpress")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("data_source_wordpress_desc")}</p>
                </div>
              </div>
              <Switch
                checked={permissionsForm.allowSourceWordpress}
                onCheckedChange={(checked) => setPermissionsForm((p) => ({ ...p, allowSourceWordpress: checked }))}
              />
            </div>

            {/* Source 4: REST API */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("data_source_rest_api")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("data_source_rest_api_desc")}</p>
                </div>
              </div>
              <Switch
                checked={permissionsForm.allowSourceRestApi}
                onCheckedChange={(checked) => setPermissionsForm((p) => ({ ...p, allowSourceRestApi: checked }))}
              />
            </div>

            {/* Source 5: Shopify */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t("data_source_shopify")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("data_source_shopify_desc")}</p>
                </div>
              </div>
              <Switch
                checked={permissionsForm.allowSourceShopify}
                onCheckedChange={(checked) => setPermissionsForm((p) => ({ ...p, allowSourceShopify: checked }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setPermissionsTarget(null)}>
              {t("btn_cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (permissionsTarget) {
                  setPermissionsMutation.mutate({ id: permissionsTarget.id, permissions: permissionsForm });
                }
              }}
              disabled={setPermissionsMutation.isPending}
            >
              {setPermissionsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("btn_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Business Type Dialog (Admin determines Clinic vs General) ── */}
      <Dialog open={!!businessTypeTarget} onOpenChange={(open) => !open && setBusinessTypeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-teal-600">
              <Stethoscope className="w-5 h-5" />
              <DialogTitle>
                {lang === "ar" ? "تحديد نوع نشاط الشركة" : "Set Business Activity Type"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {businessTypeTarget?.name} · {lang === "ar" ? "حدد كمدير نوع النظام المناسب لهذه الشركة للتحكم في واجهة الـ CRM والقنوات." : "Configure whether this client operates as a Medical Clinic or a General Business."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Option 1: Clinic */}
            <div
              onClick={() => setBusinessTypeInput("clinic")}
              className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                businessTypeInput === "clinic"
                  ? "border-teal-600 bg-teal-500/10 shadow-sm"
                  : "border-border/60 hover:border-teal-600/40 bg-card"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">
                    {lang === "ar" ? "🩺 عيادة طبية / مركز صحي (Clinic CRM)" : "Medical Clinic / Healthcare"}
                  </p>
                  {businessTypeInput === "clinic" && (
                    <Badge className="bg-teal-600 text-white text-[10px]">
                      {lang === "ar" ? "المحدد" : "Selected"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {lang === "ar"
                    ? "تفعيل سجل حجوزات المرضى، الأطباء المعالجين، ومواعيد الكشف التلقائية عبر كافة القنوات (واتساب، تليجرام، ماسنجر، الموقع، والويب هوك)."
                    : "Enables Patient Appointments CRM, Doctors registry, booking types, and clinic statuses across all channels."}
                </p>
              </div>
            </div>

            {/* Option 2: General */}
            <div
              onClick={() => setBusinessTypeInput("general")}
              className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                businessTypeInput === "general"
                  ? "border-blue-600 bg-blue-500/10 shadow-sm"
                  : "border-border/60 hover:border-blue-600/40 bg-card"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">
                    {lang === "ar" ? "💼 شركة عامة / متجر إلكتروني (General Leads CRM)" : "General Business / E-commerce"}
                  </p>
                  {businessTypeInput === "general" && (
                    <Badge className="bg-blue-600 text-white text-[10px]">
                      {lang === "ar" ? "المحدد" : "Selected"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {lang === "ar"
                    ? "تفعيل سجل العملاء المحتملين العام لتتبع بيانات التواصل والاهتمامات والطلبات التجارية التقليدية."
                    : "Standard Leads CRM tracking contact info, interest, channels, and general customer inquiries."}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setBusinessTypeTarget(null)}>
              {t("btn_cancel")}
            </Button>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              onClick={() => {
                if (businessTypeTarget) {
                  updateBusinessTypeMutation.mutate({
                    id: businessTypeTarget.id,
                    businessType: businessTypeInput,
                  });
                }
              }}
              disabled={updateBusinessTypeMutation.isPending}
            >
              {updateBusinessTypeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {lang === "ar" ? "حفظ التغييرات" : "Save Business Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Button
                  size="sm"
                  onClick={() => {
                    const target = viewCompany;
                    setViewCompany(null);
                    openManageCompanyDialog(target);
                  }}
                  className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground ml-auto shrink-0 shadow-sm"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  {lang === "ar" ? "إدارة الصفحات والمحتوى" : "Manage Pages & Content"}
                </Button>
              </div>
            )}
          </DialogHeader>

          {viewCompany && (
            <div className="space-y-5 pt-2">

              {/* Status + Subscription */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-muted/30 rounded-xl p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1.5">{lang === "ar" ? "نوع النشاط" : "Business Type"}</p>
                  {viewCompany.businessType === "clinic" ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-600 border border-teal-500/20">
                      <Stethoscope className="w-3 h-3 text-teal-600" />
                      {lang === "ar" ? "عيادة طبية" : "Clinic CRM"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                      <Building2 className="w-3 h-3 text-blue-600" />
                      {lang === "ar" ? "شركة عامة" : "General CRM"}
                    </span>
                  )}
                </div>
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
                  onClick={() => { const target = viewCompany; setViewCompany(null); openQuotaDialog(target); }}
                  className="text-xs gap-1"
                >
                  <Gauge className="w-3 h-3" /> Adjust
                </Button>
              </div>

              {/* Auto-Delete Retention Policy */}
              <div className="bg-muted/30 rounded-xl p-4 border border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("admin_companies_retention_menu")}</p>
                    <p className="text-sm font-semibold">
                      {viewCompany.chatLogRetentionDays
                        ? <span className="text-amber-500">{viewCompany.chatLogRetentionDays} {t("admin_companies_retention_custom")}</span>
                        : <span className="text-muted-foreground">{t("admin_companies_retention_badge_default")} (7 {t("admin_companies_retention_custom")})</span>}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { const target = viewCompany; setViewCompany(null); openRetentionDialog(target); }}
                  className="text-xs gap-1"
                >
                  <Clock className="w-3 h-3 text-amber-500" /> Adjust
                </Button>
              </div>

              {/* Company Notification Email & Secret Resend Key */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-muted/30 rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground mb-0.5">Notification Email (Client Alerts)</p>
                  <p className="text-sm font-semibold">
                    {viewCompany.notificationEmail ? (
                      <span className="text-primary font-mono">{viewCompany.notificationEmail}</span>
                    ) : (
                      <span className="text-muted-foreground italic font-normal">Not configured</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Receives all 13 critical client event alerts.
                  </p>
                </div>
                <div className="bg-muted/30 rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted-foreground mb-0.5">Secret Resend API Key</p>
                  <p className="text-sm font-semibold">
                    {viewCompany.resendApiKey ? (
                      <span className="text-emerald-500 font-mono">Configured (Encrypted)</span>
                    ) : (
                      <span className="text-muted-foreground italic font-normal">Using Platform Default</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Dedicated API key for company emails.
                  </p>
                </div>
              </div>

              {/* Active integrations */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Integrations</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {[
                    { label: "Website",   active: !!viewCompany.widgetEnabled,    icon: <Globe className="w-4 h-4" />,          color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                    { label: "Telegram",  active: !!viewCompany.telegramEnabled && !!viewCompany.telegramBotApiKey,  icon: <Send className="w-4 h-4" />,           color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
                    { label: "WhatsApp",  active: !!viewCompany.whatsappEnabled && !!viewCompany.whatsappApiToken,  icon: <Phone className="w-4 h-4" />,          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                    { label: "Messenger", active: !!viewCompany.messengerEnabled && !!viewCompany.messengerApiKey, icon: <MessageSquare className="w-4 h-4" />, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
                    { label: "Sheets",    active: !!viewCompany.googleSheetsEnabled && !!viewCompany.serviceAccountKey, icon: <Sheet className="w-4 h-4" />,       color: "text-green-400 bg-green-500/10 border-green-500/20" },
                    { label: "AI Agent",  active: !!viewCompany.aiAgentApiKey,     icon: <Sparkles className="w-4 h-4" />,      color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
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
              {(viewCompany.generalInfo || viewCompany.systemPrompt || viewCompany.securityPrompt) && (
                <div className="space-y-3">
                  {viewCompany.generalInfo && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">General Info</p>
                      <div className="bg-muted/30 border border-border p-3 rounded-xl text-sm whitespace-pre-wrap leading-relaxed">
                        {viewCompany.generalInfo}
                      </div>
                    </div>
                  )}
                  {viewCompany.securityPrompt && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Security Prompt</p>
                      <div className="bg-muted/30 border border-border p-3 rounded-xl text-sm font-mono whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
                        {viewCompany.securityPrompt}
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

              {/* Knowledge & Data Sources */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Knowledge & Data Sources</p>
                <KnowledgeDataSources company={viewCompany} />
              </div>

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
