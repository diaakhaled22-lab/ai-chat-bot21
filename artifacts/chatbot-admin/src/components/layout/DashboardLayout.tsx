import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useGetMe, useLogout, useGetAdminStats, getGetAdminStatsQueryKey, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

// ── Admin Bell ───────────────────────────────────────────────────────────────
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 15_000, queryKey: getGetAdminStatsQueryKey() },
  });
  const openTicketCount: number = (stats as any)?.openTicketCount ?? 0;

  const { data: reminders = [], refetch: refetchReminders } = useQuery<AppNotification[]>({
    queryKey: ["admin-notifications"],
    queryFn: () => customFetch("/api/admin/notifications"),
    refetchInterval: 60_000,
    select: (data: AppNotification[]) => data.filter((n) => n.type === "renewal_reminder"),
  });

  const unreadReminders = reminders.filter((n) => !n.isRead).length;
  const totalBadge = openTicketCount + unreadReminders;

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
    if (open && unreadReminders > 0) {
      customFetch("/api/admin/notifications/mark-read", { method: "PATCH" }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      });
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`relative p-2 rounded-lg transition-colors ${open ? "bg-muted" : "hover:bg-muted"} ${pulse ? "animate-bounce" : ""}`}
          aria-label="Notifications"
        >
          <Bell className={`w-5 h-5 ${totalBadge > 0 ? "text-amber-400" : "text-muted-foreground"}`} />
          {totalBadge > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none transition-all ${pulse ? "bg-amber-400 text-black scale-125" : "bg-amber-500 text-black"}`}>
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
                <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${!n.isRead ? "bg-amber-500/5" : ""}`}>
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />}
                </div>
              ))}
            </div>
          )}

          {/* Open tickets section */}
          <div>
            <div className="px-4 py-1.5 bg-muted/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("notif_customer_problems")}
                {openTicketCount > 0 && <span className="ml-1 text-amber-400">· {openTicketCount} {t("notif_open")}</span>}
              </span>
            </div>
            {ticketsFetching && tickets.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-muted-foreground text-xs">{t("notif_loading")}</div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-16 gap-1.5 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 opacity-20" />
                <p className="text-xs">{t("notif_no_problems")}</p>
              </div>
            ) : (
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
            )}
          </div>

          {reminders.length === 0 && tickets.length === 0 && !ticketsFetching && (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
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

// ── Client Bell ──────────────────────────────────────────────────────────────
function ClientNotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const { data: notifications = [], refetch } = useQuery<AppNotification[]>({
    queryKey: ["client-notifications"],
    queryFn: () => customFetch("/api/client/notifications"),
    refetchInterval: 60_000,
  });

  const unread = notifications.filter((n) => !n.isRead).length;

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
          className={`relative p-2 rounded-lg transition-colors ${open ? "bg-muted" : "hover:bg-muted"} ${pulse ? "animate-bounce" : ""}`}
          aria-label="Notifications"
        >
          <Bell className={`w-5 h-5 ${unread > 0 ? "text-amber-400" : "text-muted-foreground"}`} />
          {unread > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none transition-all ${pulse ? "bg-amber-400 text-black scale-125" : "bg-amber-500 text-black"}`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 bg-card border-border shadow-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Bell className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-sm">{t("notif_title")}</span>
          {unread > 0 && (
            <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto">
              {unread} {t("notif_new")}
            </span>
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
              {notifications.map((n) => (
                <li key={n.id} className={`px-4 py-3 flex items-start gap-3 ${!n.isRead ? "bg-amber-500/5" : ""}`}>
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Badge components ─────────────────────────────────────────────────────────
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
      className={`ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none transition-all duration-300 ${pulse ? "bg-amber-400 text-black scale-110" : "bg-amber-500/20 text-amber-400"}`}
      title={`${count} open problem${count !== 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function LiveChatBadge() {
  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 10_000, queryKey: getGetAdminStatsQueryKey() },
  });

  const prevCountRef = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const current = stats?.totalChatLogs ?? null;
    if (current !== null && prevCountRef.current !== null && current > prevCountRef.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 1500);
    }
    if (current !== null) prevCountRef.current = current;
  }, [stats?.totalChatLogs]);

  if (!stats) return null;
  const today = stats.todayChatLogs ?? 0;

  return (
    <span
      className={`ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none transition-all duration-300 ${today > 0 ? pulse ? "bg-emerald-400 text-black scale-110" : "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
      title={`${today} today · ${stats.totalChatLogs} total`}
    >
      {today > 99 ? "99+" : today}
    </span>
  );
}

// ── Theme Toggle ─────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

// ── Language Toggle ───────────────────────────────────────────────────────────
function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  const next = lang === "en" ? "ar" : "en";
  return (
    <button
      onClick={() => setLang(next)}
      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex items-center gap-1"
      title={lang === "en" ? "Switch to Arabic" : "Switch to English"}
      aria-label={lang === "en" ? "Switch to Arabic" : "Switch to English"}
    >
      <Globe className="w-5 h-5" />
      <span className="text-xs font-semibold leading-none">{lang === "en" ? "AR" : "EN"}</span>
    </button>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────
export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetMe();
  const { t } = useLanguage();
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
    { href: "/admin/dashboard",  label: t("nav_dashboard"),          icon: LayoutDashboard },
    { href: "/admin/clients",    label: t("nav_clients"),            icon: Users },
    { href: "/admin/companies",  label: t("nav_companies"),          icon: Building2 },
    { href: "/admin/chat-logs",  label: t("nav_chat_logs"),          icon: MessageSquare, badge: true },
    { href: "/admin/tickets",    label: t("nav_customer_problems"),  icon: LifeBuoy, ticketBadge: true },
    { href: "/admin/broadcast",          label: "Broadcast",          icon: Megaphone },
    { href: "/admin/webhook-messenger",  label: "Webhook Channels",  icon: Webhook },
    { href: "/admin/ai-tester",          label: "AI Tester",          icon: Sparkles },
    { href: "/admin/security",   label: "Security Settings",         icon: ShieldCheck },
    { href: "/admin/settings",   label: t("nav_settings"),           icon: Settings },
  ];

  const clientLinks: NavLink[] = [
    { href: "/client/company",          label: t("nav_company"),         icon: Building2 },
    { href: "/client/channels",         label: "Channels",               icon: MessageCircle },
    { href: "/client/wordpress",        label: "WordPress Integration",  icon: Globe },
    { href: "/client/webhook-history",  label: "Webhook History",        icon: Zap },
    { href: "/client/widget-preview",   label: "Live Widget Preview",    icon: Bot },
    { href: "/client/universal-chat",   label: "AI Chat",                icon: Sparkles },
    { href: "/client/chat-logs",        label: t("nav_chat_logs"),       icon: MessageSquare },
    { href: "/client/support",          label: t("nav_support"),         icon: LifeBuoy },
    { href: "/client/usage",            label: t("nav_api_tokens"),      icon: KeyRound },
    { href: "/client/settings",         label: t("nav_settings"),        icon: Settings },
  ];

  const links = role === "admin" ? adminLinks : clientLinks;
  const currentPage = links.find((l) => l.href === location)?.label ?? "";

  return (
    <div className="flex h-full w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col overflow-hidden">
        {/* Logo */}
        <div className="py-[15px] flex items-center px-5 border-b border-border shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mr-3 shrink-0">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <span className="font-bold text-xl tracking-tight whitespace-nowrap">Mission Control</span>
        </div>

        {/* User info */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {role === "admin" ? t("nav_admin_portal") : t("nav_client_portal")}
          </div>
          <div className="flex items-center px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold mr-3 shrink-0">
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        {role === "admin" && (
          <div className="px-6 pb-3 shrink-0">
            <LiveStatusBar />
          </div>
        )}

        {/* Nav — scrolls if items overflow, fills all remaining height */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-4 py-0.5 space-y-0.5">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <Icon className={`w-4 h-4 mr-3 shrink-0 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                <span className="flex-1">{link.label}</span>
                {link.badge && role === "admin" && <LiveChatBadge />}
                {link.ticketBadge && role === "admin" && <OpenTicketsBadge />}
              </Link>
            );
          })}
        </nav>

        {/* Sign out — always pinned at the bottom, never scrolls away */}
        <div className="p-4 border-t border-border bg-card shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            <LogOut className="w-4 h-4 mr-3" />
            {t("nav_sign_out")}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="py-[15px] border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-8 shrink-0">
          <p className="text-sm font-medium text-foreground">{currentPage}</p>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            {role === "admin" ? <NotificationBell /> : <ClientNotificationBell />}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function LiveStatusBar() {
  const { data: stats } = useGetAdminStats({
    query: { refetchInterval: 10_000, queryKey: getGetAdminStatsQueryKey() },
  });

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span>Live</span>
      {stats && (
        <span className="ml-auto tabular-nums">
          <Activity className="w-3 h-3 inline mr-1 opacity-60" />
          {stats.todayChatLogs} today
        </span>
      )}
    </div>
  );
}
