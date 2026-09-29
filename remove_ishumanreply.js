const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

code = code.replace(/isHumanReply:\s*true\s*,?/g, '');
code = code.replace(/isHumanReply:\s*false\s*,?/g, '');

fs.writeFileSync('artifacts/api-server/src/routes/client.ts', code);
console.log('Removed isHumanReply from client.ts');
