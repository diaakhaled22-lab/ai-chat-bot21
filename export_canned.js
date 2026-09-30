const fs = require('fs');
const p = 'lib/db/src/schema/index.ts';
let code = fs.readFileSync(p, 'utf8');
code += '\nexport * from "./cannedResponses";\n';
fs.writeFileSync(p, code);
console.log("Updated index.ts");
