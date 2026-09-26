const fs = require('fs');
const path = require('path');

// Fix AdminWebhookMessenger.tsx
const webhookPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/admin/AdminWebhookMessenger.tsx');
if (fs.existsSync(webhookPath)) {
    let content = fs.readFileSync(webhookPath, 'utf8');
    content = content.replace(
        /className="flex-1 bg-muted\/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto"/g,
        'className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto"'
    );
    content = content.replace(
        /className="flex-1 bg-muted\/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto select-all"/g,
        'className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 font-mono text-xs overflow-x-auto select-all"'
    );
    fs.writeFileSync(webhookPath, content, 'utf8');
}

// Fix AdminBroadcast.tsx
const broadcastPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/admin/AdminBroadcast.tsx');
if (fs.existsSync(broadcastPath)) {
    let content = fs.readFileSync(broadcastPath, 'utf8');
    content = content.replace(
        /className="flex-1 truncate"/g,
        'className="flex-1 min-w-0 truncate"'
    );
    // Also, there might be long URL strings or something? Let's check for any other `flex-1` missing `min-w-0`.
    
    fs.writeFileSync(broadcastPath, content, 'utf8');
}

console.log("Patched Webhook and Broadcast pages for flex-1 min-w-0 overflow bugs.");
