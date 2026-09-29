const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

const importsToAdd = `
import { sendWhatsAppMessage } from "./whatsapp";
import { sendTelegramMessage } from "./telegram";
import { sendMessengerMessage } from "./messenger";
`;

if (!code.includes('sendWhatsAppMessage } from "./whatsapp"')) {
    code = code.replace('import { Router } from "express";', 'import { Router } from "express";' + importsToAdd);
    fs.writeFileSync('artifacts/api-server/src/routes/client.ts', code);
    console.log("Added missing imports");
}
