const fs = require('fs');
let t = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');
const lines = t.split('\n');
lines[1222] = '        changes.push(`notification email set to "${notificationEmail}"`);';
fs.writeFileSync('artifacts/api-server/src/routes/client.ts', lines.join('\n'));
