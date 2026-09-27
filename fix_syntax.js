const fs = require('fs');
let t = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

t = t.replace(/\\\`/g, '\`');
t = t.replace(/\\\$/g, '$');
t = t.replace(/\\\\n/g, '\\n');

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', t, 'utf8');
