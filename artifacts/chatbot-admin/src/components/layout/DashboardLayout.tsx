import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
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
  PenTool, Menu, Trash2, Mail, Wrench, Calendar as CalendarIcon, FileSpreadsheet, ChevronDown, ChevronRight, UserPlus, type LucideIcon,
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
  children?: NavLink[];
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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// â”€â”€ Admin Bell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/notifications", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 15_000, queryKey: getGetAdminStatsQueryKey() },
  });
  const openTicketCount: number = (stats as any)?.openTicketCount ?? 0;

  const { data: notifications = [] } = useQuery<AppNotification[]>({
    queryKey: ["admin-notifications"],
    queryFn: () => customFetch("/api/admin/notifications"),
    refetchInterval: 10_000,
  });

  const reminders = notifications.filter((n) => n.type.startsWith("renewal_reminder"));
  const securityAlerts = notifications.filter((n) => n.type === "security_alert");
  const malfunctions = notifications.filter((n) => n.type === "malfunction");
  const generalNotifications = notifications.filter(
    (n) =>
      !n.type.startsWith("renewal_reminder") &&
      n.type !== "security_alert" &&
      n.type !== "malfunction"
  );
  const unreadNotifications = notifications.filter((n) => !n.isRead).length;
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

  const { data: tickets = [], isFetching: ticketsFetching } = useQuery<Ticket[]>({
    queryKey: ["admin-tickets-bell"],
    queryFn: () => customFetch("/api/admin/tickets"),
    enabled: open,
    select: (data: Ticket[]) => data.filter((t) => t.status === "open").slice(0, 5),
  });

  useEffect(() => {
    if (open && unreadNotifications > 0) {
      customFetch("/api/admin/notifications/mark-read", { method: "PATCH" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      });
    }
  }, [open, unreadNotifications, queryClient]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`relative p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white transition-all shadow-sm flex items-center justify-center ${open ? "bg-white/25 ring-2 ring-white/30" : ""} ${pulse ? "animate-bounce" : ""}`}
          aria-label="Notifications"
        >
          <Bell className={`w-4 h-4 ${totalBadge > 0 ? "text-amber-300" : "text-white/80"}`} />
          {totalBadge > 0 && (
            <span className={`absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-none transition-all shadow-md ${pulse ? "bg-amber-300 text-slate-900 scale-125" : "bg-rose-500 text-white border border-white/30"}`}>
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 bg-card border-border shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-sm">{t("notif_title")}</span>
            {totalBadge > 0 && (
              <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {totalBadge}
              </span>
            )}
          </div>
          {notifications.length > 0 && (
            <button
              type="button"
              title={lang === "ar" ? "مسح كل الإشعارات" : "Clear all notifications"}
              onClick={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "مسح الكل" : "Clear all"}</span>
            </button>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto divide-y divide-border/40">
          {/* Renewal reminders section */}
          {reminders.length > 0 && (
            <div>
              <div className="px-4 py-1.5 bg-muted/30">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("notif_renewal_reminders")}
                </span>
              </div>
              {reminders.slice(0, 5).map((n) => (
                <div key={n.id} className={`px-4 py-3 flex items-start gap-3 group ${!n.isRead ? "bg-amber-500/5" : ""}`}>
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />}
                  <button
                    type="button"
                    title={lang === "ar" ? "حذف الإشعار" : "Delete notification"}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(n.id);
                    }}
                    className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Security alerts section */}
          {securityAlerts.length > 0 && (
            <div>
              <div className="px-4 py-1.5 bg-red-500/10">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-red-300">
                  Security Alerts
                </span>
              </div>
              {securityAlerts.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  onClick={() => { setOpen(false); setLocation("/admin/attack-monitoring"); }}
                  className={`w-full text-left px-4 py-3 hover:bg-red-500/10 transition-colors flex items-start gap-3 cursor-pointer group ${!n.isRead ? "bg-red-500/5" : ""}`}
                >
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-1.5" />}
                  <button
                    type="button"
                    title={lang === "ar" ? "حذف الإشعار" : "Delete notification"}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(n.id);
                    }}
                    className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Malfunctions section */}
          {malfunctions.length > 0 && (
            <div>
              <div className="px-4 py-1.5 bg-rose-500/10">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                  {lang === "ar" ? "بلاغات الأعطال" : "Reported Malfunctions"}
                </span>
              </div>
              {malfunctions.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  onClick={() => { setOpen(false); setLocation("/admin/malfunctions"); }}
                  className={`w-full text-left px-4 py-3 hover:bg-rose-500/10 transition-colors flex items-start gap-3 cursor-pointer group ${!n.isRead ? "bg-rose-500/5" : ""}`}
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0 mt-1.5" />}
                  <button
                    type="button"
                    title={lang === "ar" ? "حذف الإشعار" : "Delete notification"}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(n.id);
                    }}
                    className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Client & System Updates section */}
          {generalNotifications.length > 0 && (
            <div>
              <div className="px-4 py-1.5 bg-blue-500/10 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                  {t("notif_system_updates")}
                </span>
                <span className="text-[10px] text-muted-foreground">{generalNotifications.length}</span>
              </div>
              {generalNotifications.slice(0, 10).map((n) => {
                const isNewClient = n.type === "new_client" || n.type === "client_registered";
                const isClientUpdate = n.type.includes("client") || n.type.includes("credential");
                const isTicketNotif = n.type.includes("ticket");
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      setOpen(false);
                      if (isNewClient) {
                        setLocation("/admin/clients");
                      } else if (isClientUpdate) {
                        setLocation("/admin/companies");
                      } else if (isTicketNotif) {
                        setLocation("/admin/tickets");
                      }
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3 cursor-pointer group ${!n.isRead ? "bg-blue-500/5" : ""}`}
                  >
                    {isNewClient ? (
                      <UserPlus className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : isClientUpdate ? (
                      <KeyRound className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    ) : isTicketNotif ? (
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <Bell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug break-words">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0 mt-1.5" />}
                    <button
                      type="button"
                      title={lang === "ar" ? "حذف الإشعار" : "Delete notification"}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(n.id);
                      }}
                      className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Open tickets section */}
          {tickets.length > 0 && (
            <div>
              <div className="px-4 py-1.5 bg-muted/30">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("notif_customer_problems")}
                  {openTicketCount > 0 && <span className="ml-1 text-amber-400">· {openTicketCount} {t("notif_open")}</span>}
                </span>
              </div>
              <ul>
                {tickets.map((ticket, i) => (
                  <li key={ticket.id}>
                    <button
                      onClick={() => { setOpen(false); setLocation("/admin/tickets"); }}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3 ${i < tickets.length - 1 ? "border-b border-border/50" : ""}`}
                    >
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight truncate">{ticket.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-muted-foreground truncate">{ticket.clientName}</span>
                          <span className="text-muted-foreground/40 text-xs">·</span>
                          <span className="text-xs text-muted-foreground shrink-0">{timeAgo(ticket.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty state: shown only when there are truly no notifications and no tickets */}
          {notifications.length === 0 && tickets.length === 0 && !ticketsFetching && (
            <div className="flex flex-col items-center justify-center h-28 gap-2 text-muted-foreground">
              <CheckCircle2 className="w-7 h-7 opacity-20" />
              <p className="text-xs">{t("notif_no_notifications")}</p>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5">
          <button
            onClick={() => { setOpen(false); setLocation("/admin/tickets"); }}
            className="w-full text-center text-xs text-primary hover:text-primary/80 font-medium transition-colors py-0.5"
          >
            {t("notif_view_all")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// â”€â”€ Client Bell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ClientNotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t, lang } = useLanguage();

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/client/notifications/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/client/notifications", { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
    },
  });

  const { data: notifications = [], refetch } = useQuery<AppNotification[]>({
    queryKey: ["client-notifications"],
    queryFn: () => customFetch("/api/client/notifications"),
    refetchInterval: 5_000,
  });

  const unread = notifications.filter((n) => !n.isRead).length;
  const hasUnreadRed = notifications.some((n) => !n.isRead && (n.type === "quota_depleted_red" || n.type.includes("depleted")));
  const hasUnreadAmber = notifications.some((n) => !n.isRead && (n.type === "quota_warning_amber" || n.type.includes("amber")));
  const hasUnreadHandoff = notifications.some(
    (n) => !n.isRead && (n.type === "handoff_request" || n.type.includes("handoff") || n.type.includes("customer_service") || n.type === "ticket" || n.type === "problem_alert" || n.type.includes("problem"))
  );

  const prevUnreadRef = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (unread > 0 && prevUnreadRef.current !== null && unread > prevUnreadRef.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }
    prevUnreadRef.current = unread;
  }, [unread]);

  useEffect(() => {
    if (open && unread > 0) {
      customFetch("/api/client/notifications/mark-read", { method: "PATCH" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["client-notifications"] });
      });
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`relative p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-white transition-all shadow-sm flex items-center justify-center ${open ? "bg-white/25 ring-2 ring-white/30" : ""} ${pulse || hasUnreadRed ? "animate-bounce" : ""}`}
          aria-label="Notifications"
        >
          <Bell className={`w-4 h-4 ${
            hasUnreadRed
              ? "text-rose-300 animate-pulse"
              : hasUnreadAmber
              ? "text-amber-300"
              : unread > 0
              ? "text-amber-300"
              : "text-white/80"
          }`} />
          {unread > 0 && (
            <span className={`absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-none transition-all shadow-md ${
              hasUnreadRed
                ? "bg-rose-500 text-white animate-pulse border border-white/30"
                : pulse
                ? "bg-amber-300 text-slate-900 scale-125"
                : "bg-amber-400 text-slate-950 font-bold"
            }`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 bg-card border-border shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-sm">{t("notif_title")}</span>
            {unread > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                hasUnreadRed ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
              }`}>
                {unread} {t("notif_new")}
              </span>
            )}
          </div>
          {notifications.length > 0 && (
            <button
              type="button"
              title={lang === "ar" ? "مسح كل الإشعارات" : "Clear all notifications"}
              onClick={() => clearAllMutation.mutate()}
              disabled={clearAllMutation.isPending}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "مسح الكل" : "Clear all"}</span>
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
              <CheckCircle2 className="w-7 h-7 opacity-20" />
              <p className="text-xs">{t("notif_client_no_notifications")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {notifications.map((n) => {
                const isRedDepleted = n.type === "quota_depleted_red" || n.type.includes("depleted");
                const isAmberWarning = n.type === "quota_warning_amber" || n.type.includes("amber");
                const isProblemAlert = n.type === "problem_alert" || n.type === "ticket" || n.type.includes("problem");
                const isHandoffAlert = isProblemAlert || n.type === "handoff_request" || n.type.includes("handoff") || n.type.includes("customer_service");
                const isQuotaAlert = isRedDepleted || isAmberWarning;

                return (
                  <li 
                    key={n.id} 
                    className={`px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-muted/50 transition-colors group ${
                      isRedDepleted
                        ? "bg-rose-500/10 border-r-2 border-rose-500 dark:bg-rose-950/20"
                        : isAmberWarning
                        ? "bg-amber-500/10 border-r-2 border-amber-500 dark:bg-amber-950/20"
                        : isProblemAlert
                        ? "bg-indigo-500/10 border-r-2 border-indigo-500 dark:bg-indigo-950/20"
                        : isHandoffAlert
                        ? "bg-sky-500/10 border-r-2 border-sky-500 dark:bg-sky-950/20"
                        : !n.isRead
                        ? "bg-amber-500/5"
                        : ""
                    }`}
                    onClick={() => {
                      setOpen(false);
                      if (isQuotaAlert) {
                        setLocation("/client/usage");
                      } else if (isHandoffAlert || isProblemAlert || n.type === "new_message" || n.type === "new_conversation" || n.type.includes("lead")) {
                        setLocation("/client/universal-chat");
                      }
                    }}
                  >
                    {isRedDepleted ? (
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                    ) : isAmberWarning ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    ) : isProblemAlert ? (
                      <LifeBuoy className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
                    ) : isHandoffAlert ? (
                      <LifeBuoy className="w-4 h-4 text-sky-400 shrink-0 mt-0.5 animate-pulse" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold leading-tight">{n.title}</p>
                        {isProblemAlert && (
                          <span className="text-[9px] font-bold bg-indigo-500/20 text-indigo-400 px-1.5 py-0.2 rounded border border-indigo-500/30">
                            {lang === "ar" ? "مشكلة ⚠️" : "Problem ⚠️"}
                          </span>
                        )}
                        {isRedDepleted && (
                          <span className="text-[9px] font-bold bg-rose-500/20 text-rose-500 dark:text-rose-400 px-1.5 py-0.2 rounded border border-rose-500/30">
                            {lang === "ar" ? "نفد الرصيد 🔴" : "Depleted 🔴"}
                          </span>
                        )}
                        {isAmberWarning && (
                          <span className="text-[9px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30">
                            {lang === "ar" ? "أقل من 20% 🟡" : "< 20% 🟡"}
                          </span>
                        )}
                        {isHandoffAlert && (
                          <span className="text-[9px] font-bold bg-sky-500/20 text-sky-500 dark:text-sky-400 px-1.5 py-0.2 rounded border border-sky-500/30">
                            {lang === "ar" ? "خدمة عملاء 🎧" : "Support 🎧"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug break-words">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.isRead && (
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                        isRedDepleted ? "bg-rose-500 animate-ping" : isHandoffAlert ? "bg-sky-400 animate-pulse" : "bg-amber-400"
                      }`} />
                    )}
                    <button
                      type="button"
                      title={lang === "ar" ? "حذف الإشعار" : "Delete notification"}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(n.id);
                      }}
                      className="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-3 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => { setOpen(false); setLocation("/client/usage"); }}
            className="text-xs text-primary hover:underline font-medium"
          >
            {lang === "ar" ? "عرض تفاصيل الحصة ←" : "View Quota Details →"}
          </button>
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-primary hover:underline font-medium transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-red-500" />
            <span>{lang === "ar" ? "فتح بريد Gmail ↗" : "Open Gmail ↗"}</span>
          </a>
          <span className="text-[10px] text-muted-foreground">
            {lang === "ar" ? "إشعارات البريد متزامنة" : "Email alerts synced"}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// â”€â”€ Badge components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    { href: "/admin/clients",            label: "Clients",            icon: Users },
    { href: "/admin/companies",          label: "Companies",          icon: Building2 },
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

  const { data: clientCompany } = useGetClientCompany({
    query: {
      queryKey: getGetClientCompanyQueryKey(),
      enabled: role === "client",
      staleTime: 5_000,
    },
  });

  const isTokensMode = (clientCompany as any)?.aiExecutionMode === "tokens";

  const clientLinks: NavLink[] = [
    { href: "/client/dashboard",        label: t("nav_dashboard") || "Dashboard",  icon: LayoutDashboard },
    { href: "/client/company",          label: t("nav_company"),         icon: Building2 },
    { href: "/client/ai-model",         label: t("nav_ai_model") || "AI Model & Provider", icon: Cpu },
    ...(isTokensMode
      ? [{ href: "/client/api-tokens",  label: lang === "ar" ? "رموز API" : "API Tokens", icon: KeyRound }]
      : [{ href: "/client/usage",       label: lang === "ar" ? "الحصة الشهرية (Quota)" : "Token Quota", icon: Coins }]
    ),
    { href: "/client/prompts",          label: t("nav_prompts") || "Prompts", icon: PenTool },
    { href: "/client/knowledge",        label: t("get_data_title"),      icon: Database },
    { href: "/client/channels",         label: t("nav_channels"),        icon: MessageCircle },
    {
      href: "/client/tools",
      label: t("nav_tools") || (lang === "ar" ? "الأدوات" : "Tools"),
      icon: Wrench,
      children: [
        {
          href: "/client/tools/calendar",
          label: t("nav_google_calendar") || (lang === "ar" ? "تقويم Google" : "Google Calendar"),
          icon: CalendarIcon,
        },
        {
          href: "/client/tools/sheets",
          label: t("nav_google_sheets") || (lang === "ar" ? "جداول Google" : "Google Sheets"),
          icon: FileSpreadsheet,
        },
      ],
    },
    { href: "/client/chat-logs",        label: t("nav_chat_logs"),       icon: MessageSquare, clientChatBadge: true },
    { href: "/client/leads",            label: lang === "ar" ? "العملاء المحتملين" : "Leads CRM", icon: Users },
    { href: "/client/universal-chat",   label: t("nav_universal_chat"),  icon: Sparkles, clientChatBadge: true },
    { href: "/client/widget-preview",   label: t("nav_widget_preview"),  icon: Bot },
    { href: "/client/support",          label: t("nav_support"),         icon: LifeBuoy },
    { href: "/client/malfunctions",     label: t("nav_malfunctions") || "Malfunctions", icon: AlertTriangle },
    { href: "/client/webhook-history",  label: t("nav_webhook_history"), icon: Zap },
    { href: "/client/settings",         label: t("nav_settings"),        icon: Settings },
  ];

  const links = role === "admin" ? adminLinks : clientLinks;
  const allLinks = links.flatMap((l) => (l.children ? [l, ...l.children] : [l]));
  const currentPage = allLinks.find((l) => l.href === location)?.label ?? "";

  const isAdmin = role === "admin";
  const sidebarAsideBg = isAdmin
    ? "bg-[#090b16] text-white"
    : "bg-[#102A6B] text-white";
  const sidebarHeaderBg = isAdmin ? "bg-transparent" : "bg-[#102A6B]";
  const sidebarFooterBg = isAdmin ? "bg-transparent" : "bg-[#102A6B]";
  const navbarBg = isAdmin
    ? "bg-[#28093c] bg-gradient-to-r from-[#28093c] via-[#1f0b32] to-[#140b26]"
    : "bg-[#102A6B]";

  const sidebarContent = (
    <div className="relative flex flex-col h-full w-full overflow-hidden select-none">
      {isAdmin && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {/* Base dark cosmic night sky background */}
          <div className="absolute inset-0 bg-[#090b16]" />

          {/* Top-right vivid violet/magenta nebula glow */}
          <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-gradient-to-br from-purple-600/50 via-fuchsia-600/30 to-transparent blur-3xl pointer-events-none" />

          {/* Upper sweeping curved glass wave */}
          <svg className="absolute top-[18%] -left-10 w-[380px] h-[360px] pointer-events-none" viewBox="0 0 380 360" fill="none">
            <defs>
              <linearGradient id="wave1Grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#1e3a8a" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="stroke1Grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.1" />
                <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#c084fc" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            <path
              d="M-20,180 C80,200 220,110 380,30 L380,360 L-20,360 Z"
              fill="url(#wave1Grad)"
            />
            <path
              d="M-20,180 C80,200 220,110 380,30"
              stroke="url(#stroke1Grad)"
              strokeWidth="1.5"
              filter="drop-shadow(0 0 8px rgba(96,165,250,0.6))"
            />
          </svg>

          {/* Main Lower Sweeping 3D Glass Arc Sphere (as seen from Messages down to bottom) */}
          <svg className="absolute bottom-0 -left-10 w-[380px] h-[480px] pointer-events-none" viewBox="0 0 380 480" fill="none">
            <defs>
              <radialGradient id="sphereGrad" cx="25%" cy="25%" r="75%">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.8" />
                <stop offset="35%" stopColor="#1d4ed8" stopOpacity="0.9" />
                <stop offset="70%" stopColor="#172554" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#090b16" stopOpacity="1" />
              </radialGradient>
              <linearGradient id="arcHighlight" x1="0%" y1="60%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
                <stop offset="40%" stopColor="#60a5fa" stopOpacity="0.85" />
                <stop offset="85%" stopColor="#818cf8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#c084fc" stopOpacity="0.2" />
              </linearGradient>
            </defs>
            <path
              d="M-10,130 Q110,40 380,220 L380,480 L-10,480 Z"
              fill="url(#sphereGrad)"
            />
            <path
              d="M-10,130 Q110,40 380,220"
              stroke="url(#arcHighlight)"
              strokeWidth="2.5"
              filter="drop-shadow(0 0 10px rgba(56,189,248,0.85))"
            />
          </svg>

          {/* Secondary bottom soft glow */}
          <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-blue-600/25 blur-3xl pointer-events-none" />
        </div>
      )}

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
          <span className="text-[10px] font-bold text-blue-200/90 tracking-wider uppercase truncate">
            Operations Center
          </span>
        </div>
      </div>

      {/* Unified User Info & Live Status in One Box */}
      <div className="px-3 pt-2 pb-2 shrink-0 relative z-10">
        <div className={`rounded-2xl ${isAdmin ? "bg-white/[0.08] backdrop-blur-xl border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.3)]" : "bg-white/10 backdrop-blur-md border border-white/15 shadow-sm"} p-2.5 space-y-2`}>
          {/* User profile row */}
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl ${isAdmin ? "bg-white/15 border border-white/20 text-white" : "bg-white/20 text-white border border-white/25"} flex items-center justify-center font-bold text-xs shadow-inner shrink-0`}>
              {user?.name?.charAt(0).toUpperCase() ?? "S"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold leading-tight text-white truncate">{user?.name ?? "softysta.com"}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <p className="text-[10px] font-medium text-slate-300 capitalize">{user?.role === "admin" ? "Super Admin" : user?.role}</p>
              </div>
            </div>
          </div>

          {/* Live status row */}
          <div className="pt-2 border-t border-white/10">
            {role === "admin" ? <LiveStatusBar /> : <ClientLiveStatusBar />}
          </div>
        </div>
      </div>

      {/* Section Header: MENU */}
      {isAdmin && (
        <div className="px-4 pt-2 pb-1 relative z-10">
          <span className="text-[10px] font-extrabold text-slate-400/80 tracking-widest uppercase">
            MENU
          </span>
        </div>
      )}

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
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer select-none ${
                    isParentActive
                      ? "bg-white/15 backdrop-blur-md text-white font-semibold border border-white/20 shadow-md"
                      : "text-slate-300/85 hover:text-white hover:bg-white/[0.08]"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isParentActive ? "text-white" : "text-slate-300/80"}`} />
                  <span className="flex-1 truncate">{link.label}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isExpanded ? "rotate-0 text-white" : "-rotate-90 text-slate-400"
                    }`}
                  />
                </div>

                {isExpanded && (
                  <div className="ps-4 pe-1 space-y-0.5 pt-1 pb-1 bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 my-1">
                    {link.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isSubActive = location === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            isSubActive
                              ? "bg-white/20 text-white font-semibold shadow-sm border border-white/20"
                              : "text-slate-300/75 hover:text-white hover:bg-white/[0.08]"
                          }`}
                        >
                          <ChildIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? "text-white" : "text-slate-400"}`} />
                          <span className="flex-1 truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-white/15 backdrop-blur-md text-white font-semibold border border-white/20 shadow-md shadow-black/25"
                  : "text-slate-300/85 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-300/80"}`} />
              <span className="flex-1 truncate">{link.label}</span>
              {link.badge && role === "admin" && <AdminUnreadChatBadge isActive={isActive} />}
              {link.ticketBadge && role === "admin" && <OpenTicketsBadge />}
              {link.clientChatBadge && role === "client" && <ClientUnreadChatBadge isActive={isActive} />}
            </Link>
          );
        })}
      </nav>

      {/* Sign out — always pinned at the bottom, never scrolls away */}
      <div className={`p-3 border-t border-white/10 ${sidebarFooterBg} shrink-0 relative z-10`}>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-300/85 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all"
          onClick={handleLogout}
          disabled={logout.isPending}
        >
          <LogOut className="w-4 h-4 text-slate-300" />
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
          {isAdmin && (
            <>
              <div className="absolute -top-10 left-10 w-72 h-28 rounded-full bg-purple-600/30 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 right-1/4 w-72 h-28 rounded-full bg-fuchsia-600/20 blur-2xl pointer-events-none" />
            </>
          )}
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
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <p className="text-xs sm:text-sm font-bold tracking-tight text-white drop-shadow-sm truncate">{currentPage}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            <LanguageToggle />
            <ThemeToggle />
            {role === "admin" ? <NotificationBell /> : <ClientNotificationBell />}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full p-4 md:p-8 bg-[#F3F7FF] dark:bg-background">
          <div className={location === "/client/support" ? "w-full" : "max-w-6xl mx-auto"}>
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
      className="flex items-center gap-2 text-xs text-blue-100/90 hover:text-white px-1 py-0.5 transition-colors rounded-lg hover:bg-white/5"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColor} opacity-75`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      <span className={hasMalfunction ? "text-rose-300 font-bold" : "font-medium"}>
        {hasMalfunction ? (lang === "ar" ? "يوجد عطل" : "Issues") : (lang === "ar" ? "النظام يعمل" : "Live")}
      </span>
      {stats?.activeCompanies !== undefined && (
        <span className={`ms-auto flex items-center gap-1 text-blue-200/90 font-semibold ${lang === "ar" ? "flex-row-reverse space-x-reverse" : ""}`} title="Active Companies">
          <Activity className="w-3 h-3" />
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
      className="flex items-center gap-2 text-xs text-blue-100/90 hover:text-white px-1 py-0.5 transition-colors rounded-lg hover:bg-white/5"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColor} opacity-75`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      <span className={hasMalfunction ? "text-rose-300 font-bold" : "font-medium"}>
        {hasMalfunction ? (lang === "ar" ? "يوجد عطل" : "Issues") : (lang === "ar" ? "النظام يعمل" : "Live")}
      </span>
      {usage && (
        <span className={`ms-auto flex items-center gap-1 text-blue-200/90 font-semibold ${lang === "ar" ? "flex-row-reverse space-x-reverse" : ""}`}>
          <Activity className="w-3 h-3" />
          <span>{lang === "ar" ? `اليوم ${usage.totalMessages}` : `${usage.totalMessages} today`}</span>
        </span>
      )}
    </Link>
  );
}







