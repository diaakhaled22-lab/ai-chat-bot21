const fs = require('fs');

const channels = ['telegram', 'whatsapp', 'messenger', 'widget'];

for (const channel of channels) {
  const filePath = 'artifacts/api-server/src/routes/' + channel + '.ts';
  if (!fs.existsSync(filePath)) continue;
  
  let text = fs.readFileSync(filePath, 'utf8');

  // Add imports
  if (!text.includes('METRICS_SYSTEM_PROMPT')) {
    text = text.replace('LEAD_GEN_SYSTEM_PROMPT, extractLeadData', 'LEAD_GEN_SYSTEM_PROMPT, extractLeadData, METRICS_SYSTEM_PROMPT, extractMetrics');
  }

  // Update callAI
  if (text.includes('LEAD_GEN_SYSTEM_PROMPT;') && !text.includes('METRICS_SYSTEM_PROMPT;')) {
    text = text.replace('LEAD_GEN_SYSTEM_PROMPT;', 'LEAD_GEN_SYSTEM_PROMPT;\n    sysContent += METRICS_SYSTEM_PROMPT;');
  }

  // First, extract metrics from rawReply
  text = text.replace(
    'const { cleanResponse, leadData } = extractLeadData(rawReply);',
    'const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);\n    const { cleanResponse, metrics } = extractMetrics(tempResponse);'
  );
  text = text.replace(
    'const { cleanResponse, leadData } = extractLeadData(aiReply);',
    'const { cleanResponse: tempResponse, leadData } = extractLeadData(aiReply);\n    const { cleanResponse, metrics } = extractMetrics(tempResponse);'
  );

  // In db.insert(chatLogsTable).values({ ... })
  // We add sentiment and intent
  text = text.replace(
    /db\.insert\(chatLogsTable\)\.values\(\{([\s\S]+?)(?=\})\}\)/g,
    (match, p1) => {
      if (match.includes('sentiment:')) return match;
      return 'db.insert(chatLogsTable).values({' + p1 + ', sentiment: metrics?.sentiment || null, intent: metrics?.intent || null})';
    }
  );

  fs.writeFileSync(filePath, text, 'utf8');
  console.log('Patched ' + channel + '.ts for metrics');
}
