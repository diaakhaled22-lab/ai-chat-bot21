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
  AlertTriangle,
  LifeBuoy,
  Clock,
  Sparkles,
  ExternalLink,
  Coins,
  Check,
  Mail,
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

export default function ClientNotifications() {
  const { lang, t } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([
        queryClient.invalidateQueries(),
        refetch(),
      ]);
      toast({
        title: lang === "ar" ? "تم تحديث الإشعارات والعدادات بنجاح" : "Notifications & counts updated successfully",
      });
    } catch {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const { data: notifications = [], isLoading, isFetching, refetch } = useQuery<AppNotification[]>({
    queryKey: ["client-notifications"],
    queryFn: () => customFetch("/api/client/notifications?limit=200"),
    refetchInterval: 10_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => customFetch("/api/client/notifications/mark-read", { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
      toast({
        title: lang === "ar" ? "تم تحديد الكل كمقروء" : "Marked all as read",
        description: lang === "ar" ? "تم تحديث الإشعارات بنجاح." : "All notifications have been marked as read.",
      });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/client/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
    },
  });

  const deleteSingleMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/client/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
      toast({
        title: lang === "ar" ? "تم حذف الإشعار" : "Notification deleted",
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => customFetch("/api/client/notifications", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
      toast({
        title: lang === "ar" ? "تم مسح جميع الإشعارات" : "All notifications cleared",
      });
    },
  });

  // Deduplicate plan switch notifications: keep ONLY the latest plan switch request notification,
  // cancel/filter out any preceding ones so only the final request is visible to the client.
  const deduplicatedNotifications = useMemo(() => {
    const sorted = [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    let seenPlan = false;
    return sorted.filter((n) => {
      const titleLower = (n.title || "").toLowerCase();
      const msgLower = (n.message || "").toLowerCase();
      const isPlan =
        n.type === "plan_request" ||
        n.type.includes("plan") ||
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
        if (seenPlan) return false;
        seenPlan = true;
      }
      return true;
    });
  }, [notifications]);

  // Category counts
  const totalCount = deduplicatedNotifications.length;
  const unreadCount = deduplicatedNotifications.filter((n) => !n.isRead).length;
  const quotaAlertsCount = deduplicatedNotifications.filter((n) => n.type.includes("quota") || n.type.includes("depleted") || n.type.includes("amber")).length;
  const problemCount = deduplicatedNotifications.filter((n) => n.type.includes("problem") || n.type.includes("handoff") || n.type.includes("ticket") || n.type === "plan_request").length;

  const filteredNotifications = useMemo(() => {
    return deduplicatedNotifications.filter((n) => {
      // Tab filter
      if (activeTab === "unread" && n.isRead) return false;
      if (activeTab === "quota" && !n.type.includes("quota") && !n.type.includes("depleted") && !n.type.includes("amber")) return false;
      if (activeTab === "support" && !n.type.includes("problem") && !n.type.includes("handoff") && !n.type.includes("ticket") && n.type !== "plan_request") return false;
      if (activeTab === "malfunction" && n.type !== "malfunction") return false;

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        return n.title.toLowerCase().includes(query) || n.message.toLowerCase().includes(query);
      }
      return true;
    });
  }, [deduplicatedNotifications, activeTab, search]);

  const getNotificationTheme = (type: string) => {
    const isRedDepleted = type === "quota_depleted_red" || type.includes("depleted");
    const isAmberWarning = type === "quota_warning_amber" || type.includes("amber");
    const isProblem = type.includes("problem") || type.includes("ticket");
    const isHandoff = type.includes("handoff") || type.includes("support");

    if (isRedDepleted) {
      return {
        icon: AlertTriangle,
        badgeText: lang === "ar" ? "نفاد الرصيد 🔴" : "Quota Depleted 🔴",
        badgeColor: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20",
        iconBg: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50",
        actionLabel: lang === "ar" ? "عرض تفاصيل الحصة" : "View Quota",
        actionHref: "/client/usage",
      };
    }
    if (isAmberWarning) {
      return {
        icon: AlertTriangle,
        badgeText: lang === "ar" ? "تنبيه استهلاك 🟡" : "Quota Low (<20%) 🟡",
        badgeColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
        iconBg: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50",
        actionLabel: lang === "ar" ? "عرض تفاصيل الحصة" : "View Quota",
        actionHref: "/client/usage",
      };
    }
    if (isProblem || isHandoff) {
      return {
        icon: LifeBuoy,
        badgeText: lang === "ar" ? "خدمة العملاء 🎧" : "Support Request 🎧",
        badgeColor: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
        iconBg: "bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/50",
        actionLabel: lang === "ar" ? "المحادثات المباشرة" : "Universal Chat",
        actionHref: "/client/universal-chat",
      };
    }
    if (type === "malfunction") {
      return {
        icon: AlertTriangle,
        badgeText: lang === "ar" ? "عطل بالنظام" : "Malfunction",
        badgeColor: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20",
        iconBg: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50",
        actionLabel: lang === "ar" ? "حالة النظام" : "System Status",
        actionHref: "/client/malfunctions",
      };
    }

    return {
      icon: Bell,
      badgeText: lang === "ar" ? "إشعار عام" : "System Alert",
      badgeColor: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
      iconBg: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50",
      actionLabel: null,
      actionHref: null,
    };
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #102A6B 0%, #1e40af 50%, #2563eb 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <Bell className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                {lang === "ar" ? "مركز التنبيهات اللحظية" : "Live Alert Center"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "مركز الإشعارات والتنبيهات" : "Notifications Center"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "متابعة تنبيهات حصة الاستهلاك، وطلبات تحويل المحادثات، وحالة النظام المباشرة."
                  : "Track token quota limits, customer handoff requests, and system malfunction alerts."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching || isRefreshing}
              className="bg-white/15 hover:bg-white/25 text-white border-white/25 rounded-xl backdrop-blur-md shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching || isRefreshing ? "animate-spin" : ""}`} />
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
            <span className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "غير مقروءة" : "Unread"}</span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <p className="text-2xl font-bold mt-2 text-amber-600 dark:text-amber-400">{unreadCount}</p>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "تنبيهات الحصة" : "Quota Alerts"}</span>
            <Coins className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-rose-600 dark:text-rose-400">{quotaAlertsCount}</p>
        </div>

        <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{lang === "ar" ? "خدمة العملاء" : "Support Alerts"}</span>
            <LifeBuoy className="w-4 h-4 text-sky-500" />
          </div>
          <p className="text-2xl font-bold mt-2 text-sky-600 dark:text-sky-400">{problemCount}</p>
        </div>
      </div>

      {/* ── Filters & Search ── */}
      <div className="bg-card rounded-2xl p-4 border border-[#DCE7FF] dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: "all", label: lang === "ar" ? "الكل" : "All", count: totalCount },
              { id: "unread", label: lang === "ar" ? "غير مقروءة" : "Unread", count: unreadCount },
              { id: "quota", label: lang === "ar" ? "الحصة والاستهلاك" : "Quota", count: quotaAlertsCount },
              { id: "support", label: lang === "ar" ? "خدمة العملاء" : "Support", count: problemCount },
              { id: "malfunction", label: lang === "ar" ? "الأعطال" : "Malfunctions" },
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

          <div className="relative min-w-[240px] sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={lang === "ar" ? "بحث في التنبيهات..." : "Search alerts..."}
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
          Array.from({ length: 3 }).map((_, i) => (
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
                ? (lang === "ar" ? "لا توجد تنبيهات مطابقة لبحثك" : "No matching alerts found")
                : (lang === "ar" ? "لا توجد تنبيهات حالياً" : "No alerts recorded yet")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {lang === "ar"
                ? "سيتم إشعارك تلقائياً عند اقتراب نفاد حصة الاستهلاك أو وصول طلب محادثة جديد من العملاء."
                : "You will receive real-time notifications here when quota thresholds are reached or support handoffs are requested."}
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
