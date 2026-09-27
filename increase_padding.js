const fs = require('fs');
let t = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', 'utf8');

t = t.replace('className="p-4 pt-4 flex flex-col', 'className="p-6 pt-6 flex flex-col');

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', t, 'utf8');
