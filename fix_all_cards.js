const fs = require('fs');

// AdminChatLogs.tsx
let text = fs.readFileSync('artifacts/chatbot-admin/src/pages/admin/AdminChatLogs.tsx', 'utf8');
const adminChatLogsReplacement = `      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalMessages}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Active Sessions</CardTitle>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeSessions}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Unread</CardTitle>
            <MessageCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{unreadSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Read</CardTitle>
            <MessageSquare className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{readSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Top Channel</CardTitle>
            <Globe className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold capitalize">{topChannel}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Top Company</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate pr-2">{topCompany}</div>
          </CardContent>
        </Card>
      </div>`;

let startStr = '<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">';
let startIndex = text.indexOf(startStr);
if (startIndex !== -1) {
  let currentIdx = startIndex;
  for (let i = 0; i < 6; i++) {
    currentIdx = text.indexOf('</Card>', currentIdx + 1);
  }
  let endDivIdx = text.indexOf('</div>', currentIdx) + 6;
  text = text.substring(0, startIndex) + adminChatLogsReplacement + text.substring(endDivIdx);
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/admin/AdminChatLogs.tsx', text, 'utf8');
}

// ClientChatLogs.tsx
text = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', 'utf8');
const clientChatLogsReplacement = `      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "إجمالي الرسائل" : "Total Messages"}</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalMessages}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "الجلسات النشطة (Sessions)" : "Active Sessions"}</CardTitle>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{uniqueSessions}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "غير مقروءة" : "Unread"}</CardTitle>
            <MessageCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{unreadSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "مقروءة" : "Read"}</CardTitle>
            <MessageSquare className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{readSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "القناة الأكثر نشاطاً" : "Top Channel"}</CardTitle>
            <Globe className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold capitalize">{topChannel}</div>
          </CardContent>
        </Card>
      </div>`;
startStr = '<div className="grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">';
startIndex = text.indexOf(startStr);
if (startIndex !== -1) {
  let currentIdx = startIndex;
  for (let i = 0; i < 5; i++) {
    currentIdx = text.indexOf('</Card>', currentIdx + 1);
  }
  let endDivIdx = text.indexOf('</div>', currentIdx) + 6;
  text = text.substring(0, startIndex) + clientChatLogsReplacement + text.substring(endDivIdx);
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', text, 'utf8');
}

// ClientDashboard.tsx
text = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', 'utf8');
const statCardReplacement = `function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium truncate pr-2">{label}</CardTitle>
        <Icon className={\`h-4 w-4 \${color.replace('bg-', 'text-').replace('/10', '')}\`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums truncate">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}`;
startStr = 'function StatCard({';
startIndex = text.indexOf(startStr);
if (startIndex !== -1) {
  let currentIdx = startIndex;
  const endStr = '  );\n}';
  const endIdx = text.indexOf(endStr, currentIdx) + endStr.length;
  text = text.substring(0, startIndex) + statCardReplacement + text.substring(endIdx);
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', text, 'utf8');
}

// AdminAttackMonitoring.tsx
text = fs.readFileSync('artifacts/chatbot-admin/src/pages/admin/AdminAttackMonitoring.tsx', 'utf8');
const adminAttackReplacement = `      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Failed in last 5 min</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{analytics?.recentFailedAttempts ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Recorded failed attempts</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{analytics?.totalFailedAttempts ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Failed attempts</CardTitle>
            <Activity className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {policy.maxFailedAttempts}
            </div>
            <p className="text-xs text-muted-foreground mt-1">within {policy.failureWindowMinutes} minutes</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Account lockout</CardTitle>
            <Clock3 className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{policy.accountLockoutMinutes} min</div>
            <p className="text-xs text-muted-foreground mt-1">Subsequent attempts blocked</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">Suspicious activity</CardTitle>
            <Ban className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">IP Block</div>
            <p className="text-xs text-muted-foreground mt-1">after {policy.additionalAttemptsBeforeIpBlock} more attempts</p>
          </CardContent>
        </Card>
      </div>`;
startStr = '<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">';
startIndex = text.indexOf(startStr);
if (startIndex !== -1) {
  let currentIdx = startIndex;
  for (let i = 0; i < 5; i++) {
    currentIdx = text.indexOf('</Card>', currentIdx + 1);
  }
  let endDivIdx = text.indexOf('</div>', currentIdx) + 6;
  text = text.substring(0, startIndex) + adminAttackReplacement + text.substring(endDivIdx);
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/admin/AdminAttackMonitoring.tsx', text, 'utf8');
}
