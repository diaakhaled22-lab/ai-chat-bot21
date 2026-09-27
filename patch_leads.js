const fs = require('fs');

const channels = ['telegram', 'whatsapp', 'messenger', 'widget'];

for (const channel of channels) {
  const filePath = `artifacts/api-server/src/routes/${channel}.ts`;
  if (!fs.existsSync(filePath)) continue;
  
  let text = fs.readFileSync(filePath, 'utf8');

  // Add imports
  if (!text.includes('LEAD_GEN_SYSTEM_PROMPT')) {
    text = text.replace('HANDOFF_SYSTEM_PROMPT', 'HANDOFF_SYSTEM_PROMPT, LEAD_GEN_SYSTEM_PROMPT, extractLeadData');
    if (!text.includes('leadsTable')) {
      text = text.replace('chatLogsTable', 'chatLogsTable, leadsTable');
    }
  }

  // Update callAI
  if (text.includes('HANDOFF_SYSTEM_PROMPT;') && !text.includes('LEAD_GEN_SYSTEM_PROMPT;')) {
    text = text.replace('HANDOFF_SYSTEM_PROMPT;', 'HANDOFF_SYSTEM_PROMPT;\n    sysContent += LEAD_GEN_SYSTEM_PROMPT;');
  }

  // Replace AI invocation logic to extract leads
  // Since we already replaced it earlier for Handoff, we can look for `let aiReply = enforceResponseLanguage`
  const oldLogic = /(let aiReply = enforceResponseLanguage\(await callAI\(company, userText, history, aiConfig\), userText\);\s+let isHandoff = false;\s+if \(aiReply\.trim\(\) === "\[HANDOFF_REQUESTED\]"\) \{\s+aiReply = localizedChannelMessage\(userText, "سيتم تحويلك إلى موظف الدعم، يرجى الانتظار\.", "You are being transferred to a human agent\. They will reply to you shortly\."\);\s+isHandoff = true;\s+\})/s;
  
  const match = text.match(oldLogic);
  if (match) {
    const replacement = `let rawReply = await callAI(company, userText, history, aiConfig);
    const { cleanResponse, leadData } = extractLeadData(rawReply);
    
    let aiReply = enforceResponseLanguage(cleanResponse, userText);
    let isHandoff = false;

    if (aiReply.trim() === "[HANDOFF_REQUESTED]" || rawReply.trim() === "[HANDOFF_REQUESTED]") {
      aiReply = localizedChannelMessage(userText, "سيتم تحويلك إلى موظف الدعم، يرجى الانتظار.", "You are being transferred to a human agent. They will reply to you shortly.");
      isHandoff = true;
    }

    if (leadData) {
      await db.insert(leadsTable).values({
        companyId: company.id,
        channel: "${channel}",
        sessionId,
        name: leadData.name || null,
        email: leadData.email || null,
        phone: leadData.phone || null,
        interest: leadData.interest || null,
      });
    }`;
    text = text.replace(oldLogic, replacement);
    fs.writeFileSync(filePath, text, 'utf8');
    console.log(`Patched ${channel}.ts`);
  } else {
    console.log(`Could not match logic in ${channel}.ts`);
  }
}
