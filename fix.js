const fs = require('fs');
let t = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');
t = t.replace('changes.push(`notification email set to "${notificationEmail}");}', 'changes.push(`notification email set to "${notificationEmail}"`);\n      }');
fs.writeFileSync('artifacts/api-server/src/routes/client.ts', t);
