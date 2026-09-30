const fs = require('fs');

const files = [
  'artifacts/api-server/src/routes/whatsapp.ts',
  'artifacts/api-server/src/routes/telegram.ts',
  'artifacts/api-server/src/routes/messenger.ts',
  'artifacts/api-server/src/routes/widget.ts'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let code = fs.readFileSync(file, 'utf8');
  
  const importName = 'triggerHandoffNotification';
  if (!code.includes(importName)) {
    if (code.includes('import { isSessionInHandoff')) {
      code = code.replace(
        'import { isSessionInHandoff',
        'import { isSessionInHandoff, triggerHandoffNotification'
      );
    } else {
      code = 'import { triggerHandoffNotification } from "../lib/handoff";\n' + code;
    }

    let modified = false;
    
    let channelStr = 'unknown';
    if (file.includes('whatsapp')) channelStr = '"whatsapp"';
    if (file.includes('telegram')) channelStr = '"telegram"';
    if (file.includes('messenger')) channelStr = '"messenger"';
    if (file.includes('widget')) channelStr = '"website"';

    const target = 'isHandoff = true;\n      }';
    const replacement = 'isHandoff = true;\n        triggerHandoffNotification(company, sessionId, ' + channelStr + ');\n      }';
    
    // There are nested blocks with different indentation
    const target2 = 'isHandoff = true;\n            }';
    const replacement2 = 'isHandoff = true;\n              triggerHandoffNotification(company, sessionId, ' + channelStr + ');\n            }';
    
    if (code.includes(target) || code.includes(target2) || code.includes('isHandoff = true;')) {
      code = code.replace(/isHandoff\s*=\s*true;\s*\}/g, 'isHandoff = true;\n        triggerHandoffNotification(company, sessionId, ' + channelStr + ');\n      }');
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(file, code);
      console.log(`Injected into ${file}`);
    }
  }
}
