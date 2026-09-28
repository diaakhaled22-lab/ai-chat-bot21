const fs = require('fs');

const files = [
  'artifacts/api-server/src/routes/whatsapp.ts',
  'artifacts/api-server/src/routes/messenger.ts',
  'artifacts/api-server/src/routes/telegram.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('sysContent += LEAD_GEN_SYSTEM_PROMPT')) {
    content = content.replace(
      /  let sysContent = company\.systemPrompt \?\? "";/,
      '  let sysContent = company.systemPrompt ?? "";\n  sysContent += HANDOFF_SYSTEM_PROMPT;\n  sysContent += LEAD_GEN_SYSTEM_PROMPT;\n  sysContent += METRICS_SYSTEM_PROMPT;'
    );
    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
  } else {
    console.log(file + ' already has sysContent += LEAD_GEN_SYSTEM_PROMPT');
  }
}
