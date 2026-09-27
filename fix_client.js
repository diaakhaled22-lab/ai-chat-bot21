const fs = require('fs');
let text = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', 'utf8');

const replacement = `      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground truncate pr-2">{lang === "ar" ? "إجمالي الرسائل" : "Total Messages"}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground truncate pr-2">{lang === "ar" ? "الجلسات النشطة (Sessions)" : "Active Sessions"}</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{uniqueSessions}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground truncate pr-2">{lang === "ar" ? "غير مقروءة" : "Unread"}</CardTitle>
            <MessageCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{unreadSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground truncate pr-2">{lang === "ar" ? "مقروءة" : "Read"}</CardTitle>
            <MessageSquare className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{readSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground truncate pr-2">{lang === "ar" ? "القناة الأكثر نشاطاً" : "Top Channel"}</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{topChannel}</div>
          </CardContent>
        </Card>
      </div>`;

const startStr = '<div className="grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">';
const startIndex = text.indexOf(startStr);

if (startIndex !== -1) {
  let currentIdx = startIndex;
  for (let i = 0; i < 5; i++) {
    currentIdx = text.indexOf('</Card>', currentIdx + 1);
  }
  const endDivIdx = text.indexOf('</div>', currentIdx) + 6;
  
  text = text.substring(0, startIndex) + replacement + text.substring(endDivIdx);
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', text, 'utf8');
  console.log('ClientChatLogs updated');
} else {
  console.log('Could not find grid in ClientChatLogs');
}

