import { checkIsCompanyProfileComplete } from "@/components/client/ClientOnboardingProgress";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { toast } from "@/hooks/use-toast";
import { useGetMe, useLogout, useGetAdminStats, getGetAdminStatsQueryKey, customFetch, useListClientChatLogs, useListAllChatLogs, getListAllChatLogsQueryKey, getListClientChatLogsQueryKey, useGetClientCompany, getGetClientCompanyQueryKey } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Building2,
  MessageSquare,
  Settings,
  LogOut,
  Bot,
  Activity,
  KeyRound,
  LifeBuoy,
  Bell,
  AlertCircle,
  CheckCircle2,
  Clock,
  Moon,
  Sun,
  Globe,
  Megaphone,
  MessageCircle,
  Sparkles,
  Zap,
  Webhook,
  ShieldCheck, ShieldAlert, History,
  AlertTriangle,
  Database,
  Cpu,
  Coins,
  Menu, Trash2, Mail, Wrench, Calendar as CalendarIcon, FileSpreadsheet, ChevronDown, ChevronRight, UserPlus, CheckCheck, ExternalLink, Stethoscope, Package, Lock, type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/hooks/use-language";

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: "admin" | "client";
}

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
  ticketBadge?: boolean;
  clientChatBadge?: boolean;
  notifBadge?: boolean;
  isAction?: boolean;
  onClick?: () => void;
  children?: NavLink[];
  isLocked?: boolean;
}

interface Ticket {
  id: number;
  clientName: string;
  title: string;
  status: "open" | "resolved";
  createdAt: string;
}

interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  companyId: number | null;
  isRead: boolean;
  createdAt: string;
}



// â”€â”€ Admin Bell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function timeAgo(iso: string, lang: string = "ar") {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return lang === "ar" ? "الآن" : "just now";
  if (m < 60) return lang === "ar" ? `منذ ${m} د` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "ar" ? `منذ ${h} س` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === "ar" ? `منذ ${d} ي` : `${d}d ago`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 15_000, queryKey: getGetAdminStatsQueryKey() },
  });
  const openTicketCount: number = (stats as any)?.openTicketCount ?? 0;

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["admin-notifications"],
    queryFn: () => customFetch("/api/admin/notifications?limit=20"),
    refetchInterval: 10_000,
  });

  const displayNotifications = useMemo(() => {
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

  const unreadNotifications = displayNotifications.filter((n) => !n.isRead).length;
  const totalBadge = openTicketCount + unreadNotifications;

  const prevTotalRef = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (totalBadge > 0 && prevTotalRef.current !== null && totalBadge > prevTotalRef.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }
    prevTotalRef.current = totalBadge;
  }, [totalBadge]);

  const markAllReadMutation = useMutation({
    mutationFn: () => customFetch("/api/admin/notifications/mark-read", { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => customFetch("/api/admin/notifications", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const deleteSingleMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/admin/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && unreadNotifications > 0) {
      markAllReadMutation.mutate();
    }
  };

  const getNotifIcon = (type: string) => {
    if (type === "new_client" || type === "client_registered") {
      return <UserPlus className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (type === "security_alert" || type.includes("security") || type.includes("attack")) {
      return <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />;
    }
    if (type === "malfunction" || type.includes("malfunction")) {
      return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    }
    if (type.startsWith("renewal_reminder")) {
      return <Clock className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
    if (type.includes("ticket") || type.includes("problem")) {
      return <LifeBuoy className="w-4 h-4 text-indigo-400 shrink-0" />;
    }
    return <Bell className="w-4 h-4 text-primary shrink-0" />;
  };

  const handleItemClick = (n: AppNotification) => {
    setOpen(false);
    if (n.type === "new_client" || n.type === "client_registered") {
      setLocation("/admin/clients");
    } else if (n.type.includes("security") || n.type === "security_alert") {
      setLocation("/admin/attack-monitoring");
    } else if (n.type.includes("malfunction")) {
      setLocation("/admin/malfunctions");
    } else if (n.type.includes("ticket") || n.type.includes("problem")) {
      setLocation("/admin/tickets");
    } else {
      setLocation("/admin/notifications");
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`relative p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white transition-all shadow-sm flex items-center justify-center cursor-pointer ${
            open ? "bg-white/25 ring-2 ring-white/30" : ""
          } ${pulse ? "animate-bounce" : ""}`}
          aria-label="Notifications"
          title={lang === "ar" ? "الإشعارات" : "Notifications"}
        >
          <Bell className={`w-4 h-4 ${totalBadge > 0 ? "text-amber-300" : "text-white/80"}`} />
          {totalBadge > 0 && (
            <span
              className={`absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-none transition-all shadow-md ${
                pulse ? "bg-amber-300 text-slate-900 scale-125" : "bg-rose-500 text-white border border-white/30"
              }`}
            >
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={lang === "ar" ? "start" : "end"}
        sideOffset={8}
        className="w-80 sm:w-96 p-0 bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl overflow-hidden z-50 text-foreground"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div>
              <span className="font-bold text-xs sm:text-sm">{lang === "ar" ? "الإشعارات" : "Notifications"}</span>
              {totalBadge > 0 && (
                <span className="ms-1.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {totalBadge}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadNotifications > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                className="text-[11px] text-muted-foreground hover:text-primary px-2 py-1 rounded-md hover:bg-muted transition-colors flex items-center gap-1 cursor-pointer"
                title={lang === "ar" ? "تحديد كمقروء" : "Mark as read"}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "مقروء" : "Read"}</span>
              </button>
            )}
            {displayNotifications.length > 0 && (
              <button
                type="button"
                onClick={() => clearAllMutation.mutate()}
                className="text-[11px] text-muted-foreground hover:text-rose-500 px-2 py-1 rounded-md hover:bg-rose-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                title={lang === "ar" ? "مسح الكل" : "Clear all"}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "مسح" : "Clear"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-[340px] overflow-y-auto divide-y divide-border/30">
          {displayNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {lang === "ar" ? "لا توجد إشعارات حالياً" : "No notifications right now"}
              </p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                {lang === "ar" ? "أنت مطلع على كل التحديثات!" : "You're all caught up!"}
              </p>
            </div>
          ) : (
            displayNotifications.slice(0, 8).map((n) => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full px-3.5 py-3 hover:bg-muted/60 transition-colors flex items-start gap-3 cursor-pointer group relative ${
                  !n.isRead ? "bg-amber-500/[0.04] dark:bg-amber-500/[0.07]" : ""
                }`}
              >
                <div className="mt-0.5 p-1.5 rounded-lg bg-muted border border-border/40 shrink-0">
                  {getNotifIcon(n.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs leading-tight truncate ${!n.isRead ? "font-bold text-foreground" : "font-medium text-foreground/85"}`}>
                      {n.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {timeAgo(n.createdAt, lang)}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {n.message}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0 self-center">
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSingleMutation.mutate(n.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-all cursor-pointer"
                    title={lang === "ar" ? "حذف" : "Delete"}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: View all page */}
        <div className="p-2 border-t border-border/50 bg-muted/30 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setLocation("/admin/notifications");
            }}
            className="w-full py-1.5 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{lang === "ar" ? "عرض كل الإشعارات في صفحة مخصصة" : "View All Notifications Page"}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ClientNotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["client-notifications"],
    queryFn: () => customFetch("/api/client/notifications?limit=20"),
    refetchInterval: 10_000,
  });

  const displayNotifications = useMemo(() => {
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

  const unread = displayNotifications.filter((n) => !n.isRead).length;
  const hasUnreadRed = displayNotifications.some(
    (n) => !n.isRead && (n.type === "quota_depleted_red" || n.type.includes("depleted"))
  );
  const hasUnreadAmber = displayNotifications.some(
    (n) => !n.isRead && (n.type === "quota_warning_amber" || n.type.includes("amber"))
  );

  const prevCountRef = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (unread > 0 && prevCountRef.current !== null && unread > prevCountRef.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }
    prevCountRef.current = unread;
  }, [unread]);

  const markAllReadMutation = useMutation({
    mutationFn: () => customFetch("/api/client/notifications/mark-read", { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () => customFetch("/api/client/notifications", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
    },
  });

  const deleteSingleMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/client/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && unread > 0) {
      markAllReadMutation.mutate();
    }
  };

  const getClientNotifIcon = (type: string) => {
    if (type === "quota_depleted_red" || type.includes("depleted")) {
      return <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />;
    }
    if (type === "quota_warning_amber" || type.includes("amber")) {
      return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    if (type === "problem_alert" || type.includes("problem") || type.includes("ticket")) {
      return <LifeBuoy className="w-4 h-4 text-indigo-400 shrink-0" />;
    }
    if (type === "handoff_request" || type.includes("handoff") || type.includes("customer_service")) {
      return <LifeBuoy className="w-4 h-4 text-sky-400 shrink-0" />;
    }
    return <Clock className="w-4 h-4 text-amber-400 shrink-0" />;
  };

  const handleClientItemClick = (n: AppNotification) => {
    setOpen(false);
    const isRedDepleted = n.type === "quota_depleted_red" || n.type.includes("depleted");
    const isAmberWarning = n.type === "quota_warning_amber" || n.type.includes("amber");
    const isQuota = isRedDepleted || isAmberWarning;
    const isProblemOrHandoff = n.type.includes("problem") || n.type.includes("handoff") || n.type.includes("lead") || n.type.includes("message");

    if (isQuota) {
      setLocation("/client/usage");
    } else if (isProblemOrHandoff) {
      setLocation("/client/universal-chat");
    } else {
      setLocation("/client/notifications");
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`relative p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white transition-all shadow-sm flex items-center justify-center cursor-pointer ${
            open ? "bg-white/25 ring-2 ring-white/30" : ""
          } ${pulse || hasUnreadRed ? "animate-bounce" : ""}`}
          aria-label="Notifications"
          title={lang === "ar" ? "الإشعارات" : "Notifications"}
        >
          <Bell
            className={`w-4 h-4 ${
              hasUnreadRed
                ? "text-rose-300 animate-pulse"
                : hasUnreadAmber
                ? "text-amber-300"
                : unread > 0
                ? "text-amber-300"
                : "text-white/80"
            }`}
          />
          {unread > 0 && (
            <span
              className={`absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-none transition-all shadow-md ${
                hasUnreadRed
                  ? "bg-rose-500 text-white animate-pulse border border-white/30"
                  : pulse
                  ? "bg-amber-300 text-slate-900 scale-125"
                  : "bg-amber-400 text-slate-950 font-bold"
              }`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={lang === "ar" ? "start" : "end"}
        sideOffset={8}
        className="w-80 sm:w-96 p-0 bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl overflow-hidden z-50 text-foreground"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div>
              <span className="font-bold text-xs sm:text-sm">{lang === "ar" ? "الإشعارات" : "Notifications"}</span>
              {unread > 0 && (
                <span className={`ms-1.5 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                  hasUnreadRed ? "bg-rose-500/20 text-rose-500" : "bg-amber-500/20 text-amber-500"
                }`}>
                  {unread}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                className="text-[11px] text-muted-foreground hover:text-primary px-2 py-1 rounded-md hover:bg-muted transition-colors flex items-center gap-1 cursor-pointer"
                title={lang === "ar" ? "تحديد كمقروء" : "Mark as read"}
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "مقروء" : "Read"}</span>
              </button>
            )}
            {displayNotifications.length > 0 && (
              <button
                type="button"
                onClick={() => clearAllMutation.mutate()}
                className="text-[11px] text-muted-foreground hover:text-rose-500 px-2 py-1 rounded-md hover:bg-rose-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                title={lang === "ar" ? "مسح الكل" : "Clear all"}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "مسح" : "Clear"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-[340px] overflow-y-auto divide-y divide-border/30">
          {displayNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {lang === "ar" ? "لا توجد إشعارات حالياً" : "No notifications right now"}
              </p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                {lang === "ar" ? "أنت مطلع على كل التحديثات!" : "You're all caught up!"}
              </p>
            </div>
          ) : (
            displayNotifications.slice(0, 8).map((n) => (
              <div
                key={n.id}
                onClick={() => handleClientItemClick(n)}
                className={`w-full px-3.5 py-3 hover:bg-muted/60 transition-colors flex items-start gap-3 cursor-pointer group relative ${
                  !n.isRead ? "bg-amber-500/[0.04] dark:bg-amber-500/[0.07]" : ""
                }`}
              >
                <div className="mt-0.5 p-1.5 rounded-lg bg-muted border border-border/40 shrink-0">
                  {getClientNotifIcon(n.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs leading-tight truncate ${!n.isRead ? "font-bold text-foreground" : "font-medium text-foreground/85"}`}>
                      {n.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {timeAgo(n.createdAt, lang)}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {n.message}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0 self-center">
                  {!n.isRead && (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      n.type.includes("depleted") ? "bg-rose-500 animate-ping" : "bg-amber-500"
                    }`} />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSingleMutation.mutate(n.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-all cursor-pointer"
                    title={lang === "ar" ? "حذف" : "Delete"}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: View all page + Gmail */}
        <div className="p-2 border-t border-border/50 bg-muted/30 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setLocation("/client/notifications");
            }}
            className="flex-1 py-1.5 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{lang === "ar" ? "عرض كل الإشعارات" : "View All"}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="py-1.5 px-2.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
            title="Gmail"
          >
            <Mail className="w-3.5 h-3.5 text-red-500" />
            <span>Gmail</span>
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OpenTicketsBadge() {
  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 15_000, queryKey: getGetAdminStatsQueryKey() },
  });

  const prevCountRef = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const current = (stats as any)?.openTicketCount ?? null;
    if (current !== null && prevCountRef.current !== null && current > prevCountRef.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 1500);
    }
    if (current !== null) prevCountRef.current = current;
  }, [(stats as any)?.openTicketCount]);

  const count = (stats as any)?.openTicketCount ?? 0;
  if (count === 0) return null;

  return (
    <span
      className={`ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none transition-all duration-300 ${pulse ? "bg-amber-300 text-slate-900 scale-110 shadow-md" : "bg-amber-400/25 text-amber-200 border border-amber-400/30"}`}
      title={`${count} open problem${count !== 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function AdminUnreadChatBadge({ isActive }: { isActive?: boolean }) {
  const { data: logs } = useListAllChatLogs(undefined, {
    query: {
      refetchInterval: 10_000,
      queryKey: getListAllChatLogsQueryKey(),
    },
  });

  const unreadCount = useMemo(() => {
    if (!logs || !Array.isArray(logs)) return 0;
    return logs.filter((log) => !log.isRead).length;
  }, [logs]);

  if (unreadCount === 0) return null;

  return (
    <span
      className={`ml-auto inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none transition-colors ${
        isActive
          ? "bg-white text-blue-900 shadow-sm"
          : "bg-white/20 text-white border border-white/20"
      }`}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}

function ClientUnreadChatBadge({ isActive }: { isActive?: boolean }) {
  const { data: logs } = useListClientChatLogs(undefined, {
    query: {
      refetchInterval: 10_000,
      queryKey: getListClientChatLogsQueryKey(),
    },
  });

  const unreadCount = useMemo(() => {
    if (!logs || !Array.isArray(logs)) return 0;
    return logs.filter((log) => !log.isRead).length;
  }, [logs]);

  if (unreadCount === 0) return null;

  return (
    <span
      className={`ml-auto inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none transition-colors ${
        isActive
          ? "bg-white text-blue-900 shadow-sm"
          : "bg-white/20 text-white border border-white/20"
      }`}
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}

function AdminNotificationBadge({ isActive }: { isActive?: boolean }) {
  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 15_000, queryKey: getGetAdminStatsQueryKey() },
  });
  const openTicketCount: number = (stats as any)?.openTicketCount ?? 0;

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["admin-notifications"],
    queryFn: () => customFetch("/api/admin/notifications"),
    refetchInterval: 10_000,
  });

  const unreadNotifications = notifications.filter((n) => !n.isRead).length;
  const totalBadge = openTicketCount + unreadNotifications;

  if (totalBadge === 0) return null;

  return (
    <span
      className={`ms-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none transition-all shadow-sm ${
        isActive
          ? "bg-amber-300 text-slate-900"
          : "bg-rose-500 text-white border border-white/20"
      }`}
    >
      {totalBadge > 99 ? "99+" : totalBadge}
    </span>
  );
}

function ClientNotificationBadge({ isActive }: { isActive?: boolean }) {
  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["client-notifications"],
    queryFn: () => customFetch("/api/client/notifications"),
    refetchInterval: 10_000,
  });

  const unread = notifications.filter((n) => !n.isRead).length;
  const hasUnreadRed = notifications.some((n) => !n.isRead && (n.type === "quota_depleted_red" || n.type.includes("depleted")));

  if (unread === 0) return null;

  return (
    <span
      className={`ms-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none transition-all shadow-sm ${
        hasUnreadRed
          ? "bg-rose-500 text-white animate-pulse border border-white/20"
          : isActive
          ? "bg-amber-300 text-slate-900"
          : "bg-amber-400 text-slate-950 font-bold"
      }`}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

// â”€â”€ Theme Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white transition-all shadow-sm flex items-center justify-center hover:scale-105 active:scale-95"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-blue-200" />}
    </button>
  );
}

// â”€â”€ Language Toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  const next = lang === "en" ? "ar" : "en";
  return (
    <button
      onClick={() => setLang(next)}
      className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white transition-all shadow-sm flex items-center gap-1.5 hover:scale-105 active:scale-95"
      title={lang === "en" ? "Switch to Arabic" : "Switch to English"}
      aria-label={lang === "en" ? "Switch to Arabic" : "Switch to English"}
    >
      <Globe className="w-4 h-4 text-blue-200" />
      <span className="text-xs font-bold leading-none">{lang === "en" ? "AR" : "EN"}</span>
    </button>
  );
}

// â”€â”€ Main layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetMe();
  const { t, lang } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation(role === "admin" ? "/login" : "/client-login");
      },
    });
  };

  const adminLinks: NavLink[] = [
    { href: "/admin/dashboard",          label: "Dashboard",          icon: LayoutDashboard },
    {
      href: "/admin/notifications",
      label: t("notif_title") || (lang === "ar" ? "الإشعارات" : "Notifications"),
      icon: Bell,
      notifBadge: true,
    },
    { href: "/admin/clients",            label: "Clients",            icon: Users },
    { href: "/admin/companies",          label: "Companies",          icon: Building2 },
    { href: "/admin/packages",           label: lang === "ar" ? "إدارة الباقات" : "Packages & Plans", icon: Package },
    { href: "/admin/ai-quota",           label: "AI / Quota",         icon: Cpu },
    { href: "/admin/chat-logs",          label: "Chat Logs",          icon: MessageSquare, badge: true },
    { href: "/admin/tickets",            label: "Customer Problems",  icon: LifeBuoy, ticketBadge: true },
    { href: "/admin/broadcast",          label: "Broadcast",          icon: Megaphone },
    { href: "/admin/webhook-messenger",  label: "Webhook Channels",  icon: Webhook },
    {
      href: "/admin/tools",
      label: t("nav_tools") || (lang === "ar" ? "الأدوات" : "Tools"),
      icon: Wrench,
      children: [
        {
          href: "/admin/tools/calendar",
          label: t("nav_google_calendar") || (lang === "ar" ? "تقويم Google" : "Google Calendar"),
          icon: CalendarIcon,
        },
        {
          href: "/admin/tools/sheets",
          label: t("nav_google_sheets") || (lang === "ar" ? "جداول Google" : "Google Sheets"),
          icon: FileSpreadsheet,
        },
      ],
    },
    { href: "/admin/ai-tester",          label: "AI Tester",          icon: Sparkles },
    { href: "/admin/audit-logs",         label: "Audit Logs",         icon: History },
    { href: "/admin/attack-monitoring",  label: "Attack Monitoring",  icon: ShieldAlert },
    { href: "/admin/security",           label: "Security Settings",  icon: ShieldCheck },
    { href: "/admin/malfunctions",       label: "Malfunctions",       icon: AlertTriangle },
    { href: "/admin/settings",           label: "Settings",           icon: Settings },
  ];

  const { data: clientCompany, isLoading: isCompanyLoading } = useGetClientCompany({
    query: {
      queryKey: getGetClientCompanyQueryKey(),
      enabled: role === "client",
      staleTime: 5_000,
    },
  });

  const isTokensMode = (clientCompany as any)?.aiExecutionMode === "tokens";
  const isClinic = role === "client" && (clientCompany as any)?.businessType === "clinic";
  const isNewClient = role === "client" && (!clientCompany || !(clientCompany as any)?.isActive);
  const isProfileCompleted = checkIsCompanyProfileComplete(clientCompany);

  // Initial navigation for new/inactive client: Company Profile, Packages, Support & Tickets, Settings
  const initialClientLinks: NavLink[] = [
    { href: "/client/company",          label: t("nav_company") || (lang === "ar" ? "ملف الشركة" : "Company Profile"), icon: Building2 },
    {
      href: "/client/packages",
      label: t("nav_packages") || (lang === "ar" ? "الباقات والاشتراكات" : "Packages & Plans"),
      icon: Package,
      isLocked: isNewClient && !isProfileCompleted,
    },
    { href: "/client/support",          label: t("nav_support") || (lang === "ar" ? "الدعم والتذاكر" : "Support & Tickets"), icon: LifeBuoy },
    { href: "/client/settings",         label: t("nav_settings") || (lang === "ar" ? "الإعدادات" : "Settings"), icon: Settings },
  ];

  const fullClientLinks: NavLink[] = [
    { href: "/client/dashboard",        label: t("nav_dashboard") || "Dashboard",  icon: LayoutDashboard },
    {
      href: "/client/notifications",
      label: t("notif_title") || (lang === "ar" ? "الإشعارات" : "Notifications"),
      icon: Bell,
      notifBadge: true,
    },
    { href: "/client/company",          label: t("nav_company"),         icon: Building2 },
    { href: "/client/packages",         label: t("nav_packages") || (lang === "ar" ? "الباقات والاشتراكات" : "Packages & Plans"), icon: Package },
    { href: "/client/ai-model",         label: t("nav_ai_model") || "AI Model & Provider", icon: Cpu },
    ...(isTokensMode
      ? [{ href: "/client/api-tokens",  label: lang === "ar" ? "رموز API" : "API Tokens", icon: KeyRound }]
      : [{ href: "/client/usage",       label: lang === "ar" ? "الحصة الشهرية (Quota)" : "Token Quota", icon: Coins }]
    ),
    { href: "/client/knowledge",        label: t("get_data_title"),      icon: Database },
    { href: "/client/channels",         label: t("nav_channels"),        icon: MessageCircle },
    {
      href: "/client/tools",
      label: t("nav_tools") || (lang === "ar" ? "الأدوات" : "Tools"),
      icon: Wrench,
      children: [
        ...((clientCompany as any)?.googleCalendarEnabled
          ? [{
              href: "/client/tools/calendar",
              label: t("nav_google_calendar") || (lang === "ar" ? "تقويم Google" : "Google Calendar"),
              icon: CalendarIcon,
            }]
          : []),
        ...((clientCompany as any)?.googleSheetsEnabled
          ? [{
              href: "/client/tools/sheets",
              label: t("nav_google_sheets") || (lang === "ar" ? "جداول Google" : "Google Sheets"),
              icon: FileSpreadsheet,
            }]
          : []),
      ],
    },
    { href: "/client/chat-logs",        label: t("nav_chat_logs"),       icon: MessageSquare, clientChatBadge: true },
    {
      href: "/client/leads",
      label: isClinic
        ? (lang === "ar" ? "سجل المرضى والحجوزات" : "Appointments CRM")
        : (lang === "ar" ? "العملاء المحتملين" : "Leads CRM"),
      icon: isClinic ? Stethoscope : Users,
    },
    { href: "/client/universal-chat",   label: t("nav_universal_chat"),  icon: Sparkles, clientChatBadge: true },
    { href: "/client/widget-preview",   label: t("nav_widget_preview"),  icon: Bot },
    { href: "/client/support",          label: t("nav_support"),         icon: LifeBuoy },
    { href: "/client/malfunctions",     label: t("nav_malfunctions") || "Malfunctions", icon: AlertTriangle },
    { href: "/client/webhook-history",  label: t("nav_webhook_history"), icon: Zap },
    { href: "/client/settings",         label: t("nav_settings"),        icon: Settings },
  ];

  const enabledPages: string[] | null = Array.isArray((clientCompany as any)?.enabledClientPages)
    ? (clientCompany as any).enabledClientPages
    : null;

  const getClientPageKey = (href: string): string => {
    if (href.startsWith("/client/dashboard")) return "dashboard";
    if (href.startsWith("/client/notifications")) return "notifications";
    if (href.startsWith("/client/company")) return "company";
    if (href.startsWith("/client/packages")) return "packages";
    if (href.startsWith("/client/ai-model")) return "ai_model";
    if (href.startsWith("/client/usage") || href.startsWith("/client/api-tokens")) return "usage";
    if (href.startsWith("/client/knowledge")) return "knowledge";
    if (href.startsWith("/client/channels")) return "channels";
    if (href.startsWith("/client/tools")) return "tools";
    if (href.startsWith("/client/chat-logs")) return "chat_logs";
    if (href.startsWith("/client/leads")) return "leads";
    if (href.startsWith("/client/universal-chat")) return "universal_chat";
    if (href.startsWith("/client/widget-preview")) return "widget_preview";
    if (href.startsWith("/client/support")) return "support";
    if (href.startsWith("/client/malfunctions")) return "malfunctions";
    if (href.startsWith("/client/webhook-history")) return "webhook_history";
    if (href.startsWith("/client/settings")) return "settings";
    return "";
  };

  const clientLinks = Array.isArray(enabledPages)
    ? fullClientLinks.filter((link) => {
        const pageKey = getClientPageKey(link.href);
        return enabledPages.includes(pageKey);
      })
    : isNewClient
    ? initialClientLinks
    : fullClientLinks;

  useEffect(() => {
    if (role === "client" && !isCompanyLoading) {
      if (Array.isArray(enabledPages)) {
        if (location.startsWith("/client")) {
          const currentPageKey = getClientPageKey(location);
          if (currentPageKey && !enabledPages.includes(currentPageKey)) {
            const firstAvailable = clientLinks[0]?.href || "/client/company";
            setLocation(firstAvailable);
          }
        }
      } else if (isNewClient) {
        if (!isProfileCompleted && (location === "/client/packages" || location.startsWith("/client/packages/"))) {
          toast({
            title: lang === "ar" ? "يرجى إكمال ملف الشركة أولاً" : "Complete Profile First",
            description: lang === "ar"
              ? "يجب إكمال وحفظ بيانات ملف الشركة أولاً للانتقال إلى الباقات والاشتراكات."
              : "Please complete and save your company profile first to unlock Packages & Plans.",
            variant: "destructive",
          });
          setLocation("/client/company");
          return;
        }

        const allowedInitialPaths = [
          "/client/company",
          ...(isProfileCompleted ? ["/client/packages"] : []),
          "/client/support",
          "/client/settings",
          "/client/notifications",
        ];
        if (
          location.startsWith("/client") &&
          !allowedInitialPaths.some((p) => location === p || location.startsWith(p + "/"))
        ) {
          setLocation("/client/company");
        }
      }
    }
  }, [role, isCompanyLoading, isNewClient, enabledPages, clientLinks, location, setLocation]);

  const links = role === "admin" ? adminLinks : clientLinks;
  const allLinks = links.flatMap((l) => (l.children ? [l, ...l.children] : [l]));
  const currentPage = allLinks.find((l) => l.href === location)?.label ?? "";

  const isAdmin = role === "admin";
  const sidebarAsideBg = "bg-[#070b19] text-white";
  const sidebarHeaderBg = "bg-transparent";
  const sidebarFooterBg = "bg-transparent";
  const navbarBg = "bg-[#0e1838] bg-gradient-to-r from-[#0e1838] via-[#102354] to-[#070b19]";

  const sidebarContent = (
    <div className="relative flex flex-col h-full w-full overflow-hidden select-none">
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Base dark midnight-blue cosmic night sky background */}
        <div className="absolute inset-0 bg-[#070b19]" />

        {/* Top-right radiant Royal Blue nebular glow */}
        <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full bg-gradient-to-br from-[#2D5BE3]/80 via-[#1d4ed8]/50 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute -top-6 -right-6 w-44 h-44 rounded-full bg-[#38bdf8]/25 blur-2xl pointer-events-none" />

        {/* Large 3D spherical glass arc spanning the lower third with subtle, harmonious glass styling */}
        <svg className="absolute bottom-0 -left-10 w-[380px] h-[480px] pointer-events-none" viewBox="0 0 380 480" fill="none">
          <defs>
            <radialGradient id="sphereGrad" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.45" />
              <stop offset="40%" stopColor="#172554" stopOpacity="0.65" />
              <stop offset="75%" stopColor="#0f172a" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#070b19" stopOpacity="0.95" />
            </radialGradient>
            <linearGradient id="arcHighlight" x1="0%" y1="60%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2D5BE3" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M-10,130 Q110,40 380,220 L380,480 L-10,480 Z"
            fill="url(#sphereGrad)"
          />
          <path
            d="M-10,130 Q110,40 380,220"
            stroke="url(#arcHighlight)"
            strokeWidth="1.5"
            filter="drop-shadow(0 0 6px rgba(56,189,248,0.3))"
          />
        </svg>

        {/* Secondary bottom soft glow */}
        <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-[#2D5BE3]/30 blur-3xl pointer-events-none" />
      </div>

      {/* Top Header - Bot Manager Logo */}
      <div className={`h-16 flex items-center gap-3 px-4 border-b border-white/10 shrink-0 ${sidebarHeaderBg} relative z-10`}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm text-white border border-white/20 bg-white/10 backdrop-blur-md"
        >
          <i className="fa-solid fa-robot text-lg text-white"></i>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-black text-lg tracking-tight text-white drop-shadow-sm truncate">
            Bot Manager
          </span>
        </div>
      </div>

      {/* Unified User Info & Live Status in One Box */}
      <div className="px-3 pt-2 pb-2 shrink-0 relative z-10">
        <div className="rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.3)] p-2.5 space-y-2">
          {/* User profile row */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 text-white flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
              {user?.name?.charAt(0).toUpperCase() ?? "S"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-black text-lg tracking-tight text-white drop-shadow-sm truncate leading-tight">
                {user?.name ?? "softysta.com"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <p className="text-[11px] font-semibold text-slate-200 capitalize">{user?.role === "admin" ? "Super Admin" : user?.role}</p>
              </div>
            </div>
          </div>

          {/* Live status row */}
          <div className="pt-2 border-t border-white/10">
            {role === "admin" ? <LiveStatusBar /> : <ClientLiveStatusBar />}
          </div>
        </div>
      </div>

      {/* Nav — scrolls if items overflow, fills all remaining height */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-1 space-y-1 relative z-10 scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href;

          if (link.children && link.children.length > 0) {
            const isChildActive = link.children.some((c) => location === c.href);
            const isParentActive = isActive || isChildActive;
            const isExpanded = openSubmenus[link.href] ?? false;

            return (
              <div key={link.href} className="space-y-1">
                <div
                  onClick={() => {
                    setOpenSubmenus((prev) => ({
                      ...prev,
                      [link.href]: !isExpanded,
                    }));
                    setLocation(link.href);
                  }}
                  className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer select-none ${
                    isParentActive
                      ? "bg-white/20 backdrop-blur-md text-white font-bold border border-white/25 shadow-md shadow-black/20"
                      : "text-slate-100 hover:text-white hover:bg-white/12"
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 transition-colors ${isParentActive ? "text-white" : "text-sky-300 group-hover:text-white"}`} />
                  <span className="flex-1 truncate">{link.label}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isExpanded ? "rotate-0 text-white" : "-rotate-90 text-slate-300"
                    }`}
                  />
                </div>

                {isExpanded && (
                  <div className="ps-3.5 pe-1.5 space-y-1 pt-1.5 pb-1.5 bg-black/25 backdrop-blur-sm rounded-xl border border-white/10 my-1">
                    {link.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isSubActive = location === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-[13px] font-medium transition-all ${
                            isSubActive
                              ? "bg-white/20 text-white font-bold shadow-sm border border-white/25"
                              : "text-slate-200 hover:text-white hover:bg-white/12"
                          }`}
                        >
                          <ChildIcon className={`w-4 h-4 shrink-0 transition-colors ${isSubActive ? "text-white" : "text-sky-300/90 group-hover:text-white"}`} />
                          <span className="flex-1 truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          if (link.isAction || link.onClick) {
            const isNotifActive = notifOpen && link.notifBadge;
            return (
              <button
                key={link.href}
                type="button"
                onClick={link.onClick}
                className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all text-start cursor-pointer select-none ${
                  isNotifActive
                    ? "bg-white/20 backdrop-blur-md text-white font-bold border border-white/25 shadow-md shadow-black/25 ring-1 ring-white/30"
                    : "text-slate-100 hover:text-white hover:bg-white/12"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 transition-colors ${isNotifActive ? "text-amber-300" : "text-sky-300 group-hover:text-white"}`} />
                <span className="flex-1 truncate">{link.label}</span>
                {link.notifBadge && role === "admin" && <AdminNotificationBadge isActive={isNotifActive} />}
                {link.notifBadge && role === "client" && <ClientNotificationBadge isActive={isNotifActive} />}
              </button>
            );
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={(e) => {
                if (link.isLocked) {
                  e.preventDefault();
                  toast({
                    title: lang === "ar" ? "الصفحة مقفلة" : "Page Locked",
                    description: lang === "ar"
                      ? "يرجى إكمال ملف الشركة أولاً (الاسم ووصف النشاط) لإلغاء قفل الباقات."
                      : "Please complete your Company Profile first to unlock Packages & Plans.",
                    variant: "destructive",
                  });
                  return;
                }
                setMobileMenuOpen(false);
              }}
              className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                link.isLocked
                  ? "opacity-60 text-slate-400 cursor-not-allowed hover:bg-transparent"
                  : isActive
                  ? "bg-white/20 backdrop-blur-md text-white font-bold border border-white/25 shadow-md shadow-black/25"
                  : "text-slate-100 hover:text-white hover:bg-white/12"
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 transition-colors ${link.isLocked ? "text-slate-400" : isActive ? "text-white" : "text-sky-300 group-hover:text-white"}`} />
              <span className="flex-1 truncate">{link.label}</span>
              {link.isLocked && (
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              {link.badge && role === "admin" && <AdminUnreadChatBadge isActive={isActive} />}
              {link.ticketBadge && role === "admin" && <OpenTicketsBadge />}
              {link.clientChatBadge && role === "client" && <ClientUnreadChatBadge isActive={isActive} />}
              {link.notifBadge && role === "admin" && <AdminNotificationBadge isActive={isActive} />}
              {link.notifBadge && role === "client" && <ClientNotificationBadge isActive={isActive} />}
            </Link>
          );
        })}
      </nav>

      {/* Sign out — always pinned at the bottom, never scrolls away */}
      <div className={`p-3 border-t border-white/10 ${sidebarFooterBg} shrink-0 relative z-10`}>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-100 hover:text-white hover:bg-rose-500/20 font-medium rounded-xl transition-all"
          onClick={handleLogout}
          disabled={logout.isPending}
        >
          <LogOut className="w-5 h-5 text-rose-300 shrink-0" />
          {t("nav_sign_out")}
        </Button>
      </div>
    </div>
  );


  return (
    <div className="flex h-full w-full bg-[#F3F7FF] dark:bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className={`w-64 border-r border-white/10 ${sidebarAsideBg} text-white hidden md:flex flex-col overflow-hidden shrink-0 shadow-2xl relative`}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#F3F7FF] dark:bg-background">
        <header className={`relative z-20 h-16 px-4 md:px-8 ${navbarBg} text-white border-b border-white/10 shadow-sm flex items-center justify-between shrink-0 overflow-hidden`}>
          <div className="absolute -top-10 left-10 w-72 h-28 rounded-full bg-[#2D5BE3]/30 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 right-1/4 w-72 h-28 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-xl h-9 w-9" aria-label="Menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={lang === "ar" ? "right" : "left"} className={`w-64 p-0 flex flex-col ${sidebarAsideBg} text-white border-none shadow-2xl overflow-hidden [&>button]:hidden relative`}>
                {sidebarContent}
              </SheetContent>
            </Sheet>

            {/* Current Page Breadcrumb Pill */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 text-white shadow-sm">
              <p className="text-xs sm:text-sm font-bold tracking-tight text-white drop-shadow-sm truncate">{currentPage}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            <LanguageToggle />
            <ThemeToggle />
            {role === "admin" ? (
              <NotificationBell />
            ) : (
              <ClientNotificationBell />
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full p-4 md:p-8 bg-[#F3F7FF] dark:bg-background">
          <div className={location === "/client/support" || location === "/admin/broadcast" || location === "/admin/ai-tester" || location === "/admin/settings" || location === "/client/settings" || location === "/client/company" || location === "/client/ai-model" ? "w-full max-w-7xl mx-auto" : "max-w-6xl mx-auto"}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function LiveStatusBar() {
  const { lang } = useLanguage();
  const { data: stats, isError: isStatsError } = useGetAdminStats({
    query: { refetchInterval: 10_000, queryKey: getGetAdminStatsQueryKey() },
  });

  const { data: malfunctions, isError: isMalfunctionsError } = useQuery<any[]>({
    queryKey: ["admin-malfunctions-status"],
    queryFn: () => customFetch("/api/admin/malfunctions"),
    refetchInterval: 10_000,
  });

  const hasMalfunction = isStatsError || isMalfunctionsError || (malfunctions && malfunctions.some(m => m.isActive));
  const dotColor = hasMalfunction ? "bg-rose-400" : "bg-emerald-400";
  const pingColor = hasMalfunction ? "bg-rose-400" : "bg-emerald-400";

  return (
    <Link
      href="/admin/malfunctions"
      className="flex items-center gap-2 text-xs text-slate-100 hover:text-white px-1.5 py-1 transition-colors rounded-lg hover:bg-white/10"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColor} opacity-75`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      <span className={hasMalfunction ? "text-rose-300 font-bold" : "font-semibold text-slate-100"}>
        {hasMalfunction ? (lang === "ar" ? "يوجد عطل" : "Issues") : (lang === "ar" ? "النظام يعمل" : "Live")}
      </span>
      {stats?.activeCompanies !== undefined && (
        <span className={`ms-auto flex items-center gap-1.5 text-sky-200 font-bold ${lang === "ar" ? "flex-row-reverse space-x-reverse" : ""}`} title="Active Companies">
          <Activity className="w-3.5 h-3.5 text-sky-300" />
          <span>{stats.activeCompanies} {lang === "ar" ? "نشط" : "active"}</span>
        </span>
      )}
    </Link>
  );
}

function ClientLiveStatusBar() {
  const { lang } = useLanguage();
  const today = new Date().toISOString().split("T")[0];
  const { data: usage, isError: isUsageError } = useQuery<any>({
    queryKey: ["client-usage-today", today],
    queryFn: () => customFetch(`/api/client/usage?from=${today}&to=${today}`),
    refetchInterval: 15_000,
  });

  const { data: malfunctions, isError: isMalfunctionsError } = useQuery<any[]>({
    queryKey: ["client-malfunctions-status"],
    queryFn: () => customFetch("/api/client/malfunctions"),
    refetchInterval: 15_000,
  });

  const hasMalfunction = isUsageError || isMalfunctionsError || (malfunctions && malfunctions.length > 0);
  const dotColor = hasMalfunction ? "bg-rose-400" : "bg-emerald-400";
  const pingColor = hasMalfunction ? "bg-rose-400" : "bg-emerald-400";

  return (
    <Link
      href="/client/malfunctions"
      className="flex items-center gap-2 text-xs text-slate-100 hover:text-white px-1.5 py-1 transition-colors rounded-lg hover:bg-white/10"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColor} opacity-75`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      <span className={hasMalfunction ? "text-rose-300 font-bold" : "font-semibold text-slate-100"}>
        {hasMalfunction ? (lang === "ar" ? "يوجد عطل" : "Issues") : (lang === "ar" ? "النظام يعمل" : "Live")}
      </span>
      {usage && (
        <span className={`ms-auto flex items-center gap-1.5 text-sky-200 font-bold ${lang === "ar" ? "flex-row-reverse space-x-reverse" : ""}`}>
          <Activity className="w-3.5 h-3.5 text-sky-300" />
          <span>{lang === "ar" ? `اليوم ${usage.totalMessages}` : `${usage.totalMessages} today`}</span>
        </span>
      )}
    </Link>
  );
}







