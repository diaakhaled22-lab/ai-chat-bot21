const fs = require('fs');
let lines = fs.readFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', 'utf8').split('\n');

let ticketsIndex = -1;
let broadcastIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('href: "/admin/tickets"')) {
    ticketsIndex = i;
  }
  if (lines[i].includes('href: "/admin/broadcast"')) {
    broadcastIndex = i;
  }
}

if (ticketsIndex !== -1 && broadcastIndex !== -1) {
  const ticketsLine = lines.splice(ticketsIndex, 1)[0];
  
  let newBroadcastIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('href: "/admin/broadcast"')) {
      newBroadcastIndex = i;
    }
  }

  lines.splice(newBroadcastIndex, 0, ticketsLine);
  
  fs.writeFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', lines.join('\n'));
  console.log("Moved successfully.");
} else {
  console.log("Failed to find lines. ticketsIndex:", ticketsIndex, "broadcastIndex:", broadcastIndex);
}
