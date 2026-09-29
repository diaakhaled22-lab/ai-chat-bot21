const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

const importWs = 'import { notifyWidgetClient } from "../lib/ws";\n';
if (!code.includes('notifyWidgetClient')) {
    code = code.replace('import { Router } from "express";', 'import { Router } from "express";\n' + importWs);
}

const wsSend = `
          if (channel === "website") {
            notifyWidgetClient(sessionId, { type: "new_message", role: "bot", text: message });
          }
`;

// Insert after botResponse: "[Human] " + message, ... });
// But be careful with regex
const insertionPoint = /botResponse:\s*"\[Human\] "\s*\+\s*message,\s*isHandoff:\s*true,?\s*\}\);\s*\}\s*if\s*\(resolveHandoff\)/;

if (insertionPoint.test(code)) {
    code = code.replace(insertionPoint, match => {
        return match.replace('}\n\n      if (resolveHandoff)', `}\n${wsSend}\n      if (resolveHandoff)`);
    });
    // simpler replacement
} else {
    // maybe easier:
    code = code.replace('isHandoff: true,\n            });\n      }', 'isHandoff: true,\n            });\n' + wsSend + '      }');
}

fs.writeFileSync('artifacts/api-server/src/routes/client.ts', code);
console.log('Modified client.ts to emit ws event');
