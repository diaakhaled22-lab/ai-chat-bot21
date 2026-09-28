const fs = require('fs');
let lines = fs.readFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', 'utf8').split('\n');

let webhookIndex = -1;
let settingsIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('href: "/client/webhook-history"')) {
    webhookIndex = i;
  }
  if (lines[i].includes('href: "/client/settings"')) {
    settingsIndex = i;
  }
}

if (webhookIndex !== -1 && settingsIndex !== -1) {
  const webhookLine = lines.splice(webhookIndex, 1)[0];
  
  // After splicing out, settingsIndex might have shifted
  let newSettingsIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('href: "/client/settings"')) {
      newSettingsIndex = i;
    }
  }

  lines.splice(newSettingsIndex, 0, webhookLine);
  
  fs.writeFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', lines.join('\n'));
  console.log("Moved successfully.");
} else {
  console.log("Failed to find lines. webhookIndex:", webhookIndex, "settingsIndex:", settingsIndex);
}
