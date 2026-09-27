const fs = require('fs');

const channels = ['telegram', 'whatsapp', 'messenger', 'widget'];

for (const channel of channels) {
  const filePath = `artifacts/api-server/src/routes/${channel}.ts`;
  if (!fs.existsSync(filePath)) continue;
  
  let text = fs.readFileSync(filePath, 'utf8');

  // Add imports
  if (!text.includes('isSessionInHandoff')) {
    text = "import { isSessionInHandoff, HANDOFF_SYSTEM_PROMPT } from '../lib/handoff';\n" + text;
  }

  // Update callAI
  if (text.includes('company.systemPrompt ?? ""') && !text.includes('HANDOFF_SYSTEM_PROMPT')) {
    text = text.replace('company.systemPrompt ?? "";', 'company.systemPrompt ?? "";\n  sysContent += HANDOFF_SYSTEM_PROMPT;');
  }

  // Replace AI invocation logic
  const oldLogic = /(const aiReply = enforceResponseLanguage\(await callAI\(company, userText, history, aiConfig\), userText\);\s+await db\.insert\(chatLogsTable\)\.values\(\{\s+companyId: company\.id,\s+channel: "[^"]+",\s+sessionId,\s+customerMessage: userText,\s+botResponse: aiReply,\s+\}\);)/s;
  
  const match = text.match(oldLogic);
  if (match) {
    const replacement = `
    if (isSessionInHandoff(priorLogs)) {
      return;
    }

    let aiReply = enforceResponseLanguage(await callAI(company, userText, history, aiConfig), userText);
    let isHandoff = false;

    if (aiReply.trim() === "[HANDOFF_REQUESTED]") {
      aiReply = localizedChannelMessage(userText, "سيتم تحويلك إلى موظف الدعم، يرجى الانتظار.", "You are being transferred to a human agent. They will reply to you shortly.");
      isHandoff = true;
    }

    await db.insert(chatLogsTable).values({
      companyId: company.id,
      channel: "${channel}",
      sessionId,
      customerMessage: userText,
      botResponse: aiReply,
      isHandoff,
    });
    `;
    text = text.replace(oldLogic, replacement);
    fs.writeFileSync(filePath, text, 'utf8');
    console.log(`Patched ${channel}.ts`);
  } else {
    console.log(`Could not match logic in ${channel}.ts`);
  }
}
