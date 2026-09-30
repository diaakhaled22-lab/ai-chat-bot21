const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/index.ts', 'utf8');

// Replace dynamic import with static import at the top
if (!code.includes('import { initWebSocket }')) {
    code = 'import { initWebSocket } from "./lib/ws";\n' + code;
    // Replace the dynamic import invocation
    code = code.replace('import("./lib/ws").then(ws => ws.initWebSocket(server));', 'initWebSocket(server);');
    fs.writeFileSync('artifacts/api-server/src/index.ts', code);
    console.log('Fixed dynamic import in index.ts');
}
