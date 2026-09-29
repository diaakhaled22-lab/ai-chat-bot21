const fs = require('fs');

const files = [
  'artifacts/api-server/src/routes/whatsapp.ts',
  'artifacts/api-server/src/routes/messenger.ts',
  'artifacts/api-server/src/routes/telegram.ts'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  
  // Replace:
  // if (isSessionInHandoff(priorLogs)) {
  //   return;
  // }
  // With:
  // if (isSessionInHandoff(priorLogs)) {
  //   await db.insert(chatLogsTable).values({ companyId: company.id, channel: "...", sessionId, customerMessage: userText, botResponse: null, isHandoff: true });
  //   return;
  // }
  // We need to extract the channel name from the file name
  const channel = file.includes("whatsapp") ? "whatsapp" : file.includes("messenger") ? "messenger" : "telegram";
  
  const badLogicRegex = /if\s*\(\s*isSessionInHandoff\(priorLogs\)\s*\)\s*\{\s*return;\s*\}/g;
  
  code = code.replace(badLogicRegex, `if (isSessionInHandoff(priorLogs)) {
            await db.insert(chatLogsTable).values({
              companyId: company.id,
              channel: "${channel}",
              sessionId,
              customerMessage: userText,
              botResponse: null,
              isHandoff: true
            });
            return;
          }`);
  
  fs.writeFileSync(file, code);
  console.log('Patched', file);
}
