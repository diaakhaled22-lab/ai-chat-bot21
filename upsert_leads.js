const fs = require('fs');

const files = [
  'artifacts/api-server/src/routes/whatsapp.ts',
  'artifacts/api-server/src/routes/telegram.ts',
  'artifacts/api-server/src/routes/messenger.ts',
  'artifacts/api-server/src/routes/widget.ts'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  
  const regex = /if\s*\(\s*leadData(?:\s*&&\s*sessionId\s*&&\s*typeof\s*sessionId\s*===\s*"string")?\s*\)\s*\{\s*await\s+db\.insert\(leadsTable\)\.values\(\{(.*?)\}\);\s*\}/gs;
  
  code = code.replace(regex, (match, body) => {
    const channelMatch = body.match(/channel:\s*"([^"]+)"/);
    const channel = channelMatch ? channelMatch[1] : 'unknown';
    
    return `if (leadData && sessionId && typeof sessionId === "string") {
      const [existingLead] = await db
        .select()
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.companyId, company.id),
            eq(leadsTable.sessionId, sessionId)
          )
        )
        .limit(1);

      if (existingLead) {
        await db
          .update(leadsTable)
          .set({
            name: leadData.name || existingLead.name,
            email: leadData.email || existingLead.email,
            phone: leadData.phone || existingLead.phone,
            interest: leadData.interest || existingLead.interest,
          })
          .where(eq(leadsTable.id, existingLead.id));
      } else {
        await db.insert(leadsTable).values({
          companyId: company.id,
          channel: "${channel}",
          sessionId,
          name: leadData.name || null,
          email: leadData.email || null,
          phone: leadData.phone || null,
          interest: leadData.interest || null,
        });
      }
    }`;
  });

  fs.writeFileSync(file, code);
  console.log("Updated", file);
}
