const fs = require('fs');
let t = fs.readFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', 'utf8');

// Add History to imports if not there
if (!t.includes('History,')) {
  t = t.replace('ShieldCheck, ShieldAlert,', 'ShieldCheck, ShieldAlert, History,');
}

// Replace ShieldAlert for audit-logs with History
t = t.replace('{ href: "/admin/audit-logs",         label: "Audit Logs",         icon: ShieldAlert },', 
              '{ href: "/admin/audit-logs",         label: "Audit Logs",         icon: History },');

fs.writeFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', t, 'utf8');
