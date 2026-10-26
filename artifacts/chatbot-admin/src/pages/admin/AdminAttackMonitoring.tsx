import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Ban, Bell, Clock3, Loader2, ShieldAlert, TrendingUp, UserRound, ShieldOff, Trash2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

type AttackEvent = "failed_attempt" | "warning_triggered" | "account_locked" | "blocked_attempt" | "ip_blocked" | "manual_ip_blocked" | "ip_unblocked";

interface AttackLogEntry {
  id: number;
  ip: string;
  time: string;
  username: string;
  failedAttempts: number;
  event: AttackEvent;
}

interface AttackMonitoringSnapshot {
  logs: AttackLogEntry[];
  blockedIps: Array<{ ip: string; blockedAt: string }>;
  analytics: {
    totalFailedAttempts: number;
    recentFailedAttempts: number;
    activeIps: Array<{ value: string; count: number }>;
    targetedAccounts: Array<{ value: string; count: number }>;
    spikeAlert: {
      active: boolean;
      threshold: number;
      recentFailedAttempts: number;
      windowMinutes: number;
      message: string | null;
    };
  };
  policy: {
    warningThreshold?: number;
    maxFailedAttempts: number;
    failureWindowMinutes: number;
    accountLockoutMinutes: number;
    additionalAttemptsBeforeIpBlock: number;
  };
}

const eventLabels: Record<AttackEvent, string> = {
  failed_attempt: "Failed attempt",
  warning_triggered: "Warning alert sent",
  account_locked: "Account locked",
  blocked_attempt: "Blocked attempt",
  ip_blocked: "IP blocked",
  manual_ip_blocked: "Manually blocked",
  ip_unblocked: "Unblocked",
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function eventStyle(event: AttackEvent): string {
  if (event === "ip_blocked" || event === "manual_ip_blocked") return "text-red-400 border-red-500/30 bg-red-500/10";
  if (event === "ip_unblocked") return "text-green-400 border-green-500/30 bg-green-500/10";
  if (event === "account_locked") return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  if (event === "warning_triggered") return "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
  if (event === "blocked_attempt") return "text-orange-400 border-orange-500/30 bg-orange-500/10";
  return "text-muted-foreground border-border bg-muted/40";
}

export default function AdminAttackMonitoring() {
  const { toast } = useToast();
  const { lang } = useLanguage();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AttackMonitoringSnapshot>({
    queryKey: ["admin-attack-monitoring"],
    queryFn: () => customFetch("/api/admin/attack-monitoring"),
    refetchInterval: 10_000,
  });

  const blockIpMutation = useMutation({
    mutationFn: (ip: string) =>
      customFetch("/api/admin/attack-monitoring/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      }),
    onSuccess: () => {
      toast({ title: "IP Blocked successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-attack-monitoring"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to block IP", description: err.message, variant: "destructive" });
    },
  });

  const unblockIpMutation = useMutation({
    mutationFn: (ip: string) =>
      customFetch("/api/admin/attack-monitoring/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      }),
    onSuccess: () => {
      toast({ title: "IP Unblocked successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-attack-monitoring"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to unblock IP", description: err.message, variant: "destructive" });
    },
  });

  const testAlertMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/attack-monitoring/test-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast({
        title: "Test Alert Sent",
        description: "Warning message sent to notification bell icon and admin recipient email.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-attack-monitoring"] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send alert",
        description: err.message || "Failed to trigger test security alert",
        variant: "destructive",
      });
    },
  });

  const clearLogsMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/attack-monitoring/logs", {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast({ title: "Attack logs cleared successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-attack-monitoring"] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to clear logs",
        description: err.message || "Failed to clear attack logs",
        variant: "destructive",
      });
    },
  });

  const policy = data?.policy ?? {
    warningThreshold: 3,
    maxFailedAttempts: 5,
    failureWindowMinutes: 5,
    accountLockoutMinutes: 15,
    additionalAttemptsBeforeIpBlock: 5,
  };
  const analytics = data?.analytics;

  return (
    <div className="space-y-6">
      {/* ── Hero Operations Banner matching Bot Manager Login aesthetic ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-shield-halved text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {lang === "ar" ? "درع الحماية ومراقبة الهجمات" : "Security & Intrusion Telemetry"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "مراقبة الهجمات والأمان" : "Attack & Threat Monitoring"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "رصد محاولات تسجيل الدخول الفاشلة، وحظر العناوين المشبوهة، وحماية الحسابات تلقائياً."
                  : "Monitor failed login attempts, account lockouts, and suspicious IP activity in real time."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto shrink-0">
            {data?.logs && data.logs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-white/15 hover:bg-red-500/30 text-white border-white/20 rounded-xl cursor-pointer"
                onClick={() => {
                  if (window.confirm(lang === "ar" ? "هل أنت متأكد من مسح جميع سجلات الهجمات؟" : "Are you sure you want to clear all recorded attack logs?")) {
                    clearLogsMutation.mutate();
                  }
                }}
                disabled={clearLogsMutation.isPending}
              >
                <Trash2 className="w-4 h-4 text-red-300" />
                <span>{lang === "ar" ? "مسح السجلات" : "Clear Logs"}</span>
              </Button>
            )}
            <Button
              size="sm"
              className="gap-2 bg-white hover:bg-blue-50 text-blue-700 font-bold shadow-lg shadow-black/10 rounded-xl px-4 py-2 text-xs cursor-pointer"
              onClick={() => testAlertMutation.mutate()}
              disabled={testAlertMutation.isPending}
            >
              {testAlertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4 text-amber-500" />}
              <span>{lang === "ar" ? "إرسال تنبيه أمني تجريبي" : "Send Test Security Alert"}</span>
            </Button>
          </div>
        </div>
      </div>

      {analytics?.spikeAlert.active && (
        <Card className="border-red-500/40 bg-red-500/10 border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15" role="alert" aria-live="assertive">
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 flex items-center gap-3 h-full">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold text-red-300">Sudden failed-login spike detected</p>
              <p className="text-sm text-red-200/80 mt-1">{analytics.spikeAlert.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

            {/* ── Security KPI Cards ── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10 text-red-600 dark:text-red-400 shadow-inner">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400 leading-tight">
              {analytics?.recentFailedAttempts ?? 0}
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1 truncate">
              {lang === "ar" ? "فشل خلال 5 دقائق" : "Failed in last 5m"}
            </p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-inner">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums leading-tight">
              {policy.warningThreshold ?? 3} <span className="text-xs font-normal text-muted-foreground">{lang === "ar" ? "مرات" : "fails"}</span>
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1 truncate">
              {lang === "ar" ? "حد إرسال التحذير" : "Warning trigger"}
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{lang === "ar" ? "تنبيه إشعارات وبريد" : "Bell & email"}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-inner">
            <Clock3 className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums leading-tight">
              {policy.maxFailedAttempts} <span className="text-xs font-normal text-muted-foreground">{lang === "ar" ? "مرات" : "fails"}</span>
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1 truncate">
              {lang === "ar" ? "قفل الحساب" : "Account lockout"}
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{lang === "ar" ? `قفل لمدة ${policy.accountLockoutMinutes} دقيقة` : `Locks for ${policy.accountLockoutMinutes}m`}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-inner">
            <Ban className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400 leading-tight">
              {lang === "ar" ? "حظر الـ IP" : "IP Block"}
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1 truncate">
              {lang === "ar" ? "نشاط مشبوه" : "Suspicious activity"}
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{lang === "ar" ? `بعد ${policy.additionalAttemptsBeforeIpBlock} محاولات` : `+${policy.additionalAttemptsBeforeIpBlock} attempts`}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-inner">
            <Activity className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums text-foreground leading-tight">
              {analytics?.totalFailedAttempts ?? 0}
            </p>
            <p className="text-xs text-muted-foreground font-medium mt-1 truncate">
              {lang === "ar" ? "إجمالي المحاولات الفاشلة" : "Total Failed"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Most active IP addresses</CardTitle>
            <CardDescription>Failed attempts during the last 5 minutes.</CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics?.activeIps.length ? (
              <p className="text-sm text-muted-foreground">No recent failed attempts.</p>
            ) : (
              <div className="space-y-2">
                {analytics.activeIps.map((item) => {
                  const isBlocked = data?.blockedIps.some(b => b.ip === item.value);
                  return (
                    <div key={item.value} className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-mono truncate">{item.value}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="tabular-nums shrink-0">{item.count} fails</Badge>
                        {isBlocked ? (
                          <Badge variant="destructive" className="h-6 text-[10px]">Blocked</Badge>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 text-xs px-2"
                            onClick={() => blockIpMutation.mutate(item.value)}
                            disabled={blockIpMutation.isPending}
                          >
                            Block IP
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Targeted accounts</CardTitle>
            <CardDescription>Accounts named in recent failed attempts.</CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics?.targetedAccounts.length ? (
              <p className="text-sm text-muted-foreground">No recent targeted accounts.</p>
            ) : (
              <div className="space-y-2">
                {analytics.targetedAccounts.map((item) => (
                  <div key={item.value} className="flex items-center justify-between gap-4 text-sm">
                    <span className="truncate">{item.value}</span>
                    <Badge variant="outline" className="tabular-nums shrink-0">{item.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data?.blockedIps && data.blockedIps.length > 0 && (
        <Card className="bg-red-500/5 border border-red-500/30 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-300">
              <Ban className="w-4 h-4" />
              Blocked IP addresses
            </CardTitle>
            <CardDescription>These addresses were blocked after suspicious activity.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 scrollbar-hide w-full max-w-full">
            {data.blockedIps.map((blocked) => (
              <div key={blocked.ip} className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-full pl-3 pr-1 py-1">
                <span className="font-mono text-xs text-red-300">{blocked.ip}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-5 h-5 rounded-full hover:bg-red-500/20 text-red-400 hover:text-red-300 ml-1"
                  onClick={() => unblockIpMutation.mutate(blocked.ip)}
                  disabled={unblockIpMutation.isPending}
                  title="Unblock IP"
                >
                  &times;
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Security Log
          </CardTitle>
          <CardDescription>
            Every failed attempt and automatic protection event, saved securely in the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-destructive">Failed to load attack monitoring logs.</div>
          ) : !data?.logs.length ? (
            <div className="flex flex-col items-center gap-2 text-center p-10 text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <UserRound className="w-7 h-7 opacity-30" />
              <p className="text-sm">No failed login attempts recorded.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Failed attempts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => {
                    const isBlocked = data?.blockedIps.some((b) => b.ip === log.ip);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{log.ip}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(log.time)}</TableCell>
                        <TableCell className="font-medium">{log.username}</TableCell>
                        <TableCell className="tabular-nums">{log.failedAttempts}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={eventStyle(log.event)}>
                            {eventLabels[log.event] || log.event}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isBlocked ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] px-3 text-red-400 hover:text-red-500 border-red-500/30 bg-red-500/10"
                              onClick={() => unblockIpMutation.mutate(log.ip)}
                              disabled={unblockIpMutation.isPending}
                            >
                              Unblock
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-6 text-[11px] px-4"
                              onClick={() => blockIpMutation.mutate(log.ip)}
                              disabled={blockIpMutation.isPending}
                            >
                              Block
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}