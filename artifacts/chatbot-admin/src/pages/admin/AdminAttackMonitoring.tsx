import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Ban, Clock3, Loader2, ShieldAlert, TrendingUp, UserRound, ShieldOff } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type AttackEvent = "failed_attempt" | "account_locked" | "blocked_attempt" | "ip_blocked" | "manual_ip_blocked" | "ip_unblocked";

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
    maxFailedAttempts: number;
    failureWindowMinutes: number;
    accountLockoutMinutes: number;
    additionalAttemptsBeforeIpBlock: number;
  };
}

const eventLabels: Record<AttackEvent, string> = {
  failed_attempt: "Failed attempt",
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
  if (event === "blocked_attempt") return "text-orange-400 border-orange-500/30 bg-orange-500/10";
  return "text-muted-foreground border-border bg-muted/40";
}

export default function AdminAttackMonitoring() {
  const { toast } = useToast();
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

  const policy = data?.policy ?? {
    maxFailedAttempts: 5,
    failureWindowMinutes: 5,
    accountLockoutMinutes: 15,
    additionalAttemptsBeforeIpBlock: 5,
  };
  const analytics = data?.analytics;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attack Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor failed login attempts, account lockouts, and suspicious IP activity.
          </p>
        </div>
      </div>

      {analytics?.spikeAlert.active && (
        <Card className="border-red-500/40 bg-red-500/10" role="alert" aria-live="assertive">
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 flex items-center gap-3 h-full">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold text-red-300">Sudden failed-login spike detected</p>
              <p className="text-sm text-red-200/80 mt-1">{analytics.spikeAlert.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="bg-card">
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 flex items-center gap-3 h-full">
            <TrendingUp className="w-4 h-4 text-red-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Failed in last 5 minutes</p>
              <p className="text-lg font-semibold mt-1.5">{analytics?.recentFailedAttempts ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 flex items-center gap-3 h-full">
            <Activity className="w-4 h-4 text-" />
            <div>
              <p className="text-xs text-muted-foreground">Recorded failed attempts</p>
              <p className="text-lg font-semibold mt-1.5">{analytics?.totalFailedAttempts ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 flex items-center gap-3 h-full">
            <Activity className="w-4 h-4 text-amber-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Failed attempts</p>
              <p className="text-lg font-semibold mt-1.5">
                {policy.maxFailedAttempts} within {policy.failureWindowMinutes} minutes
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 flex items-center gap-3 h-full">
            <Clock3 className="w-4 h-4 text-orange-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Account lockout</p>
              <p className="text-lg font-semibold mt-1.5">{policy.accountLockoutMinutes} minutes</p>
              <p className="text-xs text-muted-foreground mt-0.5">Subsequent attempts are blocked.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 pt-4 sm:p-4 sm:pt-4 flex items-center gap-3 h-full">
            <Ban className="w-4 h-4 text-red-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Suspicious activity</p>
              <p className="text-lg font-semibold mt-1.5">IP block after {policy.additionalAttemptsBeforeIpBlock} more</p>
              <p className="text-xs text-muted-foreground mt-0.5">Repeated attempts during lockout.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card">
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
        <Card className="bg-card">
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
        <Card className="bg-red-500/5 border-red-500/20">
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

      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Security Log
          </CardTitle>
          <CardDescription>
            Every failed attempt and automatic protection event from the current server session.
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