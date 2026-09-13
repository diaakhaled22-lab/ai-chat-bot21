import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Ban, Clock3, Loader2, ShieldAlert, TrendingUp, UserRound } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AttackEvent = "failed_attempt" | "account_locked" | "blocked_attempt" | "ip_blocked";

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
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function eventStyle(event: AttackEvent): string {
  if (event === "ip_blocked") return "text-red-400 border-red-500/30 bg-red-500/10";
  if (event === "account_locked") return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  if (event === "blocked_attempt") return "text-orange-400 border-orange-500/30 bg-orange-500/10";
  return "text-muted-foreground border-border bg-muted/40";
}

export default function AdminAttackMonitoring() {
  const { data, isLoading, error } = useQuery<AttackMonitoringSnapshot>({
    queryKey: ["admin-attack-monitoring"],
    queryFn: () => customFetch("/api/admin/attack-monitoring"),
    refetchInterval: 10_000,
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
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-300">Sudden failed-login spike detected</p>
              <p className="text-sm text-red-200/80 mt-1">{analytics.spikeAlert.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-start gap-3">
            <TrendingUp className="w-4 h-4 text-red-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Failed in last 5 minutes</p>
              <p className="text-lg font-semibold">{analytics?.recentFailedAttempts ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-start gap-3">
            <Activity className="w-4 h-4 text-primary mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Recorded failed attempts</p>
              <p className="text-lg font-semibold">{analytics?.totalFailedAttempts ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-start gap-3">
            <Activity className="w-4 h-4 text-amber-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Failed attempts</p>
              <p className="text-lg font-semibold">
                {policy.maxFailedAttempts} within {policy.failureWindowMinutes} minutes
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-start gap-3">
            <Clock3 className="w-4 h-4 text-orange-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Account lockout</p>
              <p className="text-lg font-semibold">{policy.accountLockoutMinutes} minutes</p>
              <p className="text-xs text-muted-foreground mt-0.5">Subsequent attempts are blocked.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-start gap-3">
            <Ban className="w-4 h-4 text-red-400 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">Suspicious activity</p>
              <p className="text-lg font-semibold">IP block after {policy.additionalAttemptsBeforeIpBlock} more</p>
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
                {analytics.activeIps.map((item) => (
                  <div key={item.value} className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-mono truncate">{item.value}</span>
                    <Badge variant="outline" className="tabular-nums shrink-0">{item.count}</Badge>
                  </div>
                ))}
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
          <CardContent className="flex flex-wrap gap-2">
            {data.blockedIps.map((blocked) => (
              <Badge key={blocked.ip} variant="outline" className="font-mono text-red-300 border-red-500/30">
                {blocked.ip}
              </Badge>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{log.ip}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(log.time)}</TableCell>
                      <TableCell className="font-medium">{log.username}</TableCell>
                      <TableCell className="tabular-nums">{log.failedAttempts}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={eventStyle(log.event)}>
                          {eventLabels[log.event]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}