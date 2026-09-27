const fs = require('fs');
let t = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

const replacement = `
    if (channel === "telegram") {
      await fetch(\`https://api.telegram.org/bot\${company.telegramBotApiKey}/sendMessage\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: sessionId, text: message })
      });
    } else if (channel === "whatsapp") {
      await fetch(\`https://graph.facebook.com/v17.0/\${company.whatsappPhoneNumberId}/messages\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${company.whatsappApiToken}\` },
        body: JSON.stringify({ messaging_product: "whatsapp", to: sessionId, type: "text", text: { body: message } })
      });
    } else if (channel === "messenger") {
      await fetch(\`https://graph.facebook.com/v17.0/\${company.messengerPageId}/messages?access_token=\${company.messengerApiKey}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${company.messengerApiKey}\` },
        body: JSON.stringify({ recipient: { id: sessionId }, message: { text: message } })
      });
    }`;

const oldLogic = `
    if (channel === "telegram") {
      const axios = require("axios").default;
      await axios.post("https://api.telegram.org/bot" + company.telegramBotApiKey + "/sendMessage", {
        chat_id: sessionId,
        text: message
      });
    } else if (channel === "whatsapp") {
      const axios = require("axios").default;
      await axios.post("https://graph.facebook.com/v17.0/" + company.whatsappPhoneNumberId + "/messages", {
        messaging_product: "whatsapp",
        to: sessionId,
        type: "text",
        text: { body: message }
      }, {
        headers: { Authorization: "Bearer " + company.whatsappApiToken }
      });
    } else if (channel === "messenger") {
      const axios = require("axios").default;
      await axios.post("https://graph.facebook.com/v17.0/" + company.messengerPageId + "/messages", {
        recipient: { id: sessionId },
        message: { text: message }
      }, {
        headers: { Authorization: "Bearer " + company.messengerApiKey },
        params: { access_token: company.messengerApiKey }
      });
    }`;

t = t.replace(oldLogic.trim(), replacement.trim());
fs.writeFileSync('artifacts/api-server/src/routes/client.ts', t);
