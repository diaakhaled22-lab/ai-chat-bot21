const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');
code = code.replace(/botResponse:\s*"[^"]+"\s*\+\s*message,/g, 'botResponse: "[Human] " + message,');
fs.writeFileSync('artifacts/api-server/src/routes/client.ts', code);
console.log('Fixed botResponse encoding!');
