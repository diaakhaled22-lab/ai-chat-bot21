import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Bell,
  CheckCheck,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  UserCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Sparkles,
  LifeBuoy,
  ChevronRight,
  ChevronLeft,
  Check,
  CheckCircle2,
  ExternalLink,
  Laptop,
  Mail,
  Network,
  PackageCheck,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  companyId: number | null;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string, lang: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return lang === "ar" ? "الآن" : "just now";
  if (m < 60) return lang === "ar" ? `منذ ${m} دقيقة` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "ar" ? `منذ ${h} ساعة` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === "ar" ? `منذ ${d} يوم` : `${d}d ago`;
}

export default function AdminNotifications() {
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: notifications = [], isLoading, isFetching, refetch } = useQuery<AppNotification[]>({
    queryKey: ["admin-notifications"],
    queryFn: () => customFetch("/api/admin/notifications?limit=200"),
    refetchInterval: 10_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => customFetch("/api/admin/notifications/mark-read", { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      toast({
        title: lang === "ar" ? "تم تحديد الكل كمقروء" : "Marked all as read",
        description: lang === "ar" ? "تم تحديث جميع الإشعارات بنجاح." : "All notifications have been marked as read.",
      });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const deleteSingleMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      toast({
        title: lang === "ar" ? "تم حذف الإشعار" : "Notification deleted",
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => customFetch("/api/admin/notifications", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      toast({
        title: lang === "ar" ? "تم مسح جميع الإشعارات" : "All notifications cleared",
      });
    },
  });

  // Deduplicate plan switch notifications: keep only the latest plan request per company/client
  const deduplicatedNotifications = useMemo(() => {
    const sorted = [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const seenPlanKeys = new Set<string>();
    return sorted.filter((n) => {
      const titleLower = (n.title || "").toLowerCase();
      const msgLower = (n.message || "").toLowerCase();
      const isPlan =
        n.type === "plan_request" ||
        n.type.includes("plan") ||
        titleLower.includes("طلب تغيير / ترقية باقة") ||
        titleLower.includes("طلب تغيير باقة") ||
        titleLower.includes("طلب اشتراك") ||
        titleLower.includes("طلب باقة") ||
        titleLower.includes("باقة") ||
        titleLower.includes("plan") ||
        titleLower.includes("upgrade") ||
        titleLower.includes("starter") ||
        titleLower.includes("enterprise") ||
        titleLower.includes("professional") ||
        msgLower.includes("باقة") ||
        msgLower.includes("plan");

      if (isPlan) {
        const key = n.companyId ? `comp_${n.companyId}` : n.title.replace(/#\d+/, "").trim();
        if (seenPlanKeys.has(key)) return false;
        seenPlanKeys.add(key);
      }
      return true;
    });
  }, [notifications]);

  // Category counts
  const totalCount = deduplicatedNotifications.length;
  const unreadCount = deduplicatedNotifications.filter((n) => !n.isRead).length;
  const planCount = deduplicatedNotifications.filter((n) => n.type === "plan_request" || n.type.includes("plan") || n.title.includes("باقة")).length;
  const ticketCount = deduplicatedNotifications.filter((n) => n.type === "ticket" || n.type.includes("problem")).length;
  const clientCount = deduplicatedNotifications.filter((n) => n.type === "new_client" || n.type.includes("client")).length;
  const securityCount = deduplicatedNotifications.filter((n) => n.type === "security_alert" || n.type === "malfunction").length;

  const filteredNotifications = useMemo(() => {
    return deduplicatedNotifications.filter((n) => {
      // Tab filter
      if (activeTab === "unread" && n.isRead) return false;
      if (activeTab === "plans" && n.type !== "plan_request" && !n.title.includes("باقة") && !n.type.includes("plan")) return false;
      if (activeTab === "tickets" && n.type !== "ticket" && !n.type.includes("problem")) return false;
      if (activeTab === "new_client" && n.type !== "new_client" && !n.type.includes("client")) return false;
      if (activeTab === "security" && n.type !== "security_alert") return false;
      if (activeTab === "malfunction" && n.type !== "malfunction") return false;
      if (activeTab === "renewal" && !n.type.startsWith("renewal_reminder")) return false;

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = n.title.toLowerCase().includes(query);
        const matchesMessage = n.message.toLowerCase().includes(query);
        const matchesType = n.type.toLowerCase().includes(query);
        return matchesTitle || matchesMessage || matchesType;
      }
      return true;
    });
  }, [deduplicatedNotifications, activeTab, search]);

  const getNotificationTheme = (type: string) => {
    if (type === "plan_request" || type.includes("plan") || type.includes("upgrade")) {
      return {
        icon: PackageCheck,
        badgeText: lang === "ar" ? "طلب باقة / ترقية" : "Plan Request",
        badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        iconBg: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50",
        actionLabel: lang === "ar" ? "تفعيل الباقة والاشتراك" : "Activate & Manage Plan",
        actionHref: "/admin/companies",
      };
    }
    if (type === "new_client" || type.includes("client")) {
      return {
        icon: UserCheck,
        badgeText: lang === "ar" ? "عميل جديد" : "New Client",
        badgeColor: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
        iconBg: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50",
        actionLabel: lang === "ar" ? "عرض دليل العملاء" : "View Clients",
        actionHref: "/admin/clients",
      };
    }
    if (type === "security_alert") {
      return {
        icon: ShieldAlert,
        badgeText: lang === "ar" ? "تنبيه أمان" : "Security Alert",
        badgeColor: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
        iconBg: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50",
        actionLabel: lang === "ar" ? "مراقبة الهجمات" : "Attack Monitoring",
        actionHref: "/admin/attack-monitoring",
      };
    }
    if (type === "malfunction") {
      return {
        icon: AlertTriangle,
        badgeText: lang === "ar" ? "عطل بالنظام" : "Malfunction",
        badgeColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
        iconBg: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50",
        actionLabel: lang === "ar" ? "سجل الأعطال" : "Malfunctions",
        actionHref: "/admin/malfunctions",
      };
    }
    if (type.startsWith("renewal_reminder")) {
      return {
        icon: Clock,
        badgeText: lang === "ar" ? "تجديد الحصة" : "Renewal Reminder",
        badgeColor: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20",
        iconBg: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50",
        actionLabel: lang === "ar" ? "إدارة الشركات" : "Companies",
        actionHref: "/admin/companies",
      };
    }
    if (type.includes("problem") || type.includes("ticket")) {
      return {
        icon: LifeBuoy,
        badgeText: lang === "ar" ? "مشاكل العملاء" : "Customer Problem",
        badgeColor: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
        iconBg: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50",
        actionLabel: lang === "ar" ? "حل المشكلات" : "View Tickets",
        actionHref: "/admin/tickets",
      };
    }
    return {
      icon: Bell,
      badgeText: lang === "ar" ? "إشعار عام" : "Notification",
      badgeColor: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
      iconBg: "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
      actionLabel: null,
      actionHref: null,
    };
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Operations Banner matching Bot Manager aesthetic ── */}
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
              <Bell className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                {lang === "ar" ? "مركز الإشعارات والعمليات" : "Notifications & Operations Hub"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "مركز الإشعارات والتنبيهات" : "Notifications Center"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "متابعة شاملة لجميع تسجيلات العملاء الجدد، وتنبيهات الأمان، والأعطال، وتجديدات الحصص في مكان واحد."
                  : "Comprehensive activity feed for new client registrations, security events, malfunctions, and quota renewals."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="bg-white/15 hover:bg-white/25 text-white border-white/25 rounded-xl backdrop-blur-md shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>{lang === "ar" ? "تحديث" : "Refresh"}</span>
            </Button>

            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="bg-white/15 hover:bg-white/25 text-white border-white/25 rounded-xl backdrop-blur-md shadow-sm cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-300" />
                <span>{lang === "ar" ? "تحديد الكل كمقروء" : "Mark All Read"}</span>
              </Button>
            )}

            {notifications.length > 0 && (
              <ConfirmDeleteDialog onConfirm={() => clearAllMutation.mutate()}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={clearAllMutation.isPending}
                  className="bg-red-500/20 hover:bg-red-500/30 text-white border-red-300/30 rounded-xl backdrop-blur-md shadow-sm cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5 text-red-200" />
                  <span>{lang === "ar" ? "مسح الكل" : "Clear All"}</span>
                </Button>
              </ConfirmDeleteDialog>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "إجمالي الإشعارات" : "Total Alerts"}</span>
            <Bell className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold mt-2 text-foreground">{totalCount}</p>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "غير مقروءة" : "Unread Alerts"}</span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <p className="text-2xl font-bold mt-2 text-amber-600 dark:text-amber-400">{unreadCount}</p>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "عملاء جدد" : "New Clients"}</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold mt-2 text-emerald-600 dark:text-emerald-400">{clientCount}</p>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "أمان وأعطال" : "Security & Issues"}</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-rose-600 dark:text-rose-400">{securityCount}</p>
        </div>
      </div>

      {/* ── Filter Tabs & Search Bar ── */}
      <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: "all", label: lang === "ar" ? "الكل" : "All", count: totalCount },
              { id: "unread", label: lang === "ar" ? "غير مقروءة" : "Unread", count: unreadCount },
              { id: "plans", label: lang === "ar" ? "طلبات الباقات" : "Plan Requests", count: planCount },
              { id: "tickets", label: lang === "ar" ? "تذاكر المشاكل" : "Support Tickets", count: ticketCount },
              { id: "new_client", label: lang === "ar" ? "العملاء الجدد" : "New Clients", count: clientCount },
              { id: "security", label: lang === "ar" ? "الأمان" : "Security" },
              { id: "malfunction", label: lang === "ar" ? "الأعطال" : "Malfunctions" },
              { id: "renewal", label: lang === "ar" ? "التجديدات" : "Renewals" },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected ? "bg-white/20 text-white" : "bg-muted-foreground/20 text-muted-foreground"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search box */}
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={lang === "ar" ? "بحث في الإشعارات..." : "Search notifications..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs rounded-xl h-9 bg-muted/40 border-border"
            />
          </div>
        </div>
      </div>

      {/* ── Notifications Feed ── */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl bg-card border border-border flex items-start gap-4">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-3xl border border-dashed border-border p-8">
            <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <Bell className="w-8 h-8 opacity-40" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              {search.trim() || activeTab !== "all"
                ? (lang === "ar" ? "لا توجد إشعارات مطابقة لمعايير البحث" : "No matching notifications found")
                : (lang === "ar" ? "لا توجد إشعارات حالياً" : "No notifications yet")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {lang === "ar"
                ? "سيتم تسجيل وإشعارك تلقائياً بأي أحداث أمان أو تسجيل عملاء جدد أو أعطال في النظام فور حدوثها."
                : "You will receive real-time notifications here whenever new clients register, security events occur, or quota alerts are triggered."}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const theme = getNotificationTheme(notif.type);
            const IconComponent = theme.icon;

            return (
              <div
                key={notif.id}
                className={`relative rounded-2xl p-4 sm:p-5 bg-card border transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  !notif.isRead
                    ? "border-blue-500/40 bg-blue-500/[0.02] dark:bg-blue-950/10 shadow-blue-500/5 ring-1 ring-blue-500/20"
                    : "border-border hover:border-border/80"
                }`}
              >
                {/* Left side: Icon + content */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${theme.iconBg}`}
                  >
                    <IconComponent className="w-5 h-5" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${theme.badgeColor}`}>
                        {theme.badgeText}
                      </span>

                      {!notif.isRead && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-ping" />
                          {lang === "ar" ? "جديد" : "New"}
                        </span>
                      )}

                      <span className="text-[11px] text-muted-foreground/70">
                        {timeAgo(notif.createdAt, lang)} • {new Date(notif.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-foreground leading-snug">
                      {notif.title}
                    </h4>

                    <p className="text-xs text-muted-foreground leading-relaxed break-words font-mono sm:font-sans">
                      {notif.message}
                    </p>
                  </div>
                </div>

                {/* Right side: Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {theme.actionHref && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(theme.actionHref!)}
                      className="text-xs rounded-xl h-8 px-3 gap-1.5 hover:bg-muted font-medium cursor-pointer"
                    >
                      <span>{theme.actionLabel}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}

                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markSingleReadMutation.mutate(notif.id)}
                      title={lang === "ar" ? "تحديد كمقروء" : "Mark as read"}
                      className="text-xs rounded-xl h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </Button>
                  )}

                  <ConfirmDeleteDialog onConfirm={() => deleteSingleMutation.mutate(notif.id)}>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={lang === "ar" ? "حذف الإشعار" : "Delete notification"}
                      className="text-xs rounded-xl h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </ConfirmDeleteDialog>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
