const fs = require('fs');

const files = [
  'artifacts/api-server/src/routes/whatsapp.ts',
  'artifacts/api-server/src/routes/messenger.ts',
  'artifacts/api-server/src/routes/telegram.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (content.includes('sysContent += LEAD_GEN_SYSTEM_PROMPT;')) {
    console.log(file + ' already has LEAD_GEN_SYSTEM_PROMPT');
    continue;
  }

  // Regex replacement to handle any line endings
  const regex = /  let sysContent = company\.systemPrompt \?\? "";\r?\n  (?:if |sysContent)/;
  
  const match = content.match(regex);
  if (match) {
    const replacement = \  let sysContent = company.systemPrompt ?? "";\n  sysContent += HANDOFF_SYSTEM_PROMPT;\n  sysContent += LEAD_GEN_SYSTEM_PROMPT;\n  sysContent += METRICS_SYSTEM_PROMPT;\n  \ + match[0].split('\n')[1].trim();
    
    // We only replace the first occurrence (or all, if we want)
    content = content.replace(/  let sysContent = company\.systemPrompt \?\? "";\r?\n/, \  let sysContent = company.systemPrompt ?? "";\n  sysContent += HANDOFF_SYSTEM_PROMPT;\n  sysContent += LEAD_GEN_SYSTEM_PROMPT;\n  sysContent += METRICS_SYSTEM_PROMPT;\n\);
    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
  } else {
    console.log('Could not match regex in ' + file);
  }
}
