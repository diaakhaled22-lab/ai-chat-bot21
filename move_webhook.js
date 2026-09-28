const fs = require('fs');
let content = fs.readFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', 'utf8');

// Find the webhook history line
const webhookLine = '      { href: "/client/webhook-history",  label: t("nav_webhook_history"), icon: Zap },\n';
if (!content.includes(webhookLine)) {
  console.log("Could not find the webhook line exactly.");
  process.exit(1);
}

// Remove it from its current position
content = content.replace(webhookLine, '');

// Insert it right before the settings line
const settingsLine = '      { href: "/client/settings",         label: t("nav_settings"),        icon: Settings },';
if (!content.includes(settingsLine)) {
  console.log("Could not find the settings line exactly.");
  process.exit(1);
}

content = content.replace(settingsLine, webhookLine + settingsLine);

fs.writeFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', content);
console.log("Successfully moved Webhook History.");
