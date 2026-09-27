const fs = require('fs');
let t = fs.readFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', 'utf8');

// Fix the corrupted Leads CRM arabic text and the icon
t = t.replace('{ href: "/client/leads",            label: lang === "ar" ? "??????? ?????????" : "Leads CRM", icon: MessageSquare },', 
              '{ href: "/client/leads",            label: lang === "ar" ? "العملاء المحتملين" : "Leads CRM", icon: Users },');

// In case it wasn't corrupted:
t = t.replace('{ href: "/client/leads",            label: lang === "ar" ? "العملاء المحتملين" : "Leads CRM", icon: MessageSquare },', 
              '{ href: "/client/leads",            label: lang === "ar" ? "العملاء المحتملين" : "Leads CRM", icon: Users },');

fs.writeFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', t, 'utf8');
