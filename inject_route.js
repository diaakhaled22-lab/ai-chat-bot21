const fs = require('fs');
const pApp = 'artifacts/chatbot-admin/src/App.tsx';
let appCode = fs.readFileSync(pApp, 'utf8');

if (!appCode.includes('ClientQuickReplies')) {
  appCode = appCode.replace(
    'import ClientDashboard from "@/pages/client/ClientDashboard";',
    'import ClientDashboard from "@/pages/client/ClientDashboard";\nimport ClientQuickReplies from "@/pages/client/ClientQuickReplies";'
  );
  
  appCode = appCode.replace(
    '<Route path="/client/malfunctions">\n        {() => <ProtectedRoute component={ClientMalfunctions} allowedRole="client" />}\n      </Route>',
    '<Route path="/client/malfunctions">\n        {() => <ProtectedRoute component={ClientMalfunctions} allowedRole="client" />}\n      </Route>\n      <Route path="/client/quick-replies">\n        {() => <ProtectedRoute component={ClientQuickReplies} allowedRole="client" />}\n      </Route>'
  );
  fs.writeFileSync(pApp, appCode);
  console.log("Updated App.tsx");
}

const pSidebar = 'artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx';
let sidebarCode = fs.readFileSync(pSidebar, 'utf8');

if (sidebarCode && !sidebarCode.includes('/client/quick-replies')) {
  sidebarCode = sidebarCode.replace(
    '      { href: "/client/chat-logs", icon: MessageSquare, label: t("nav.chatLogs", "Chat Logs") },',
    '      { href: "/client/chat-logs", icon: MessageSquare, label: t("nav.chatLogs", "Chat Logs") },\n      { href: "/client/quick-replies", icon: Zap, label: t("nav.quickReplies", "Quick Replies") },'
  );
  // Also import Zap if not imported
  if (!sidebarCode.includes('Zap')) {
    sidebarCode = sidebarCode.replace('MessageSquare,', 'MessageSquare, Zap,');
  }
  fs.writeFileSync(pSidebar, sidebarCode);
  console.log("Updated DashboardLayout.tsx");
}
