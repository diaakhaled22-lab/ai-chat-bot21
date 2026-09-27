const fs = require('fs');
let text = fs.readFileSync('artifacts/api-server/src/routes/whatsapp.ts', 'utf8');

const replacement = `
          for (const message of messages) {
            const senderPhone = message.from;
            let userText = message.type === "text" ? message.text?.body : undefined;

            if (!userText && (message.type === "audio" || message.type === "voice")) {
               try {
                  const mediaId = message.audio?.id || message.voice?.id;
                  if (mediaId && company.whatsappApiToken) {
                     const buffer = await downloadWhatsAppAudio(company.whatsappApiToken, mediaId);
                     const transcript = await transcribeAudio(company, buffer, "audio.ogg");
                     userText = "[رسالة صوتية] " + transcript;
                  }
               } catch (err) {
                  // ignore
               }
            }

            if (!senderPhone || !userText) continue;`;

text = text.replace(/for\s*\(const\s+message\s+of\s+messages\)\s*\{\s*const\s+senderPhone\s*=\s*message\.from;\s*const\s+userText\s*=\s*message\.type\s*===\s*"text"\s*\?\s*message\.text\?\.body\s*:\s*undefined;\s*if\s*\(!senderPhone\s*\|\|\s*!userText\)\s*continue;/g, replacement);

fs.writeFileSync('artifacts/api-server/src/routes/whatsapp.ts', text, 'utf8');
