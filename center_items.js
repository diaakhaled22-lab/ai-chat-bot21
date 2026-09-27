const fs = require('fs');
let t = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', 'utf8');

t = t.replace('<div className="flex items-start sm:items-center gap-3">', '<div className="flex items-center gap-3">');
t = t.replace('<div className="shrink-0 self-start sm:self-auto bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2">', '<div className="shrink-0 bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2">');

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', t, 'utf8');
