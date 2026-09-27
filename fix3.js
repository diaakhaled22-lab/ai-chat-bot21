const fs = require('fs');
let t = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

// Fix telegram
t = t.replace('await axios.post(https://api.telegram.org/bot + company.telegramBotApiKey + /sendMessage, {', 'await axios.post("https://api.telegram.org/bot" + company.telegramBotApiKey + "/sendMessage", {');

// Fix whatsapp
t = t.replace('await axios.post(https://graph.facebook.com/v17.0/ + company.whatsappPhoneNumberId + /messages, {', 'await axios.post("https://graph.facebook.com/v17.0/" + company.whatsappPhoneNumberId + "/messages", {');
t = t.replace('headers: { Authorization: Bearer  + company.whatsappApiToken }', 'headers: { Authorization: "Bearer " + company.whatsappApiToken }');

// Fix messenger
t = t.replace('await axios.post(https://graph.facebook.com/v17.0/ + company.messengerPageId + /messages, {', 'await axios.post("https://graph.facebook.com/v17.0/" + company.messengerPageId + "/messages", {');
t = t.replace('headers: { Authorization: Bearer  + company.messengerApiKey },', 'headers: { Authorization: "Bearer " + company.messengerApiKey },');

// Fix botResponse
t = t.replace('botResponse: [????]  + message,', 'botResponse: "[موظف] " + message,');

fs.writeFileSync('artifacts/api-server/src/routes/client.ts', t);
