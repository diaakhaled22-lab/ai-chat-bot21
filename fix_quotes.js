const fs = require('fs');
let t = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');
t = t.replace(/\`"/g, '"');
t = t.replace(/"`/g, '"');
fs.writeFileSync('artifacts/api-server/src/routes/client.ts', t);
