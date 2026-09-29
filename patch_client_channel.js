const fs = require('fs');

let code = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

// The bad code block:
//    let channel = "";
//    if (sessionId.startsWith("wa_")) channel = "whatsapp";
//    else if (sessionId.startsWith("tg_")) channel = "telegram";
//    else if (sessionId.startsWith("fb_")) channel = "messenger";
//    else if (sessionId.startsWith("wg_")) channel = "website";
//    else {
//      res.status(400).json({ error: "Unknown session type" });
//      return;
//    }

const badLogicRegex = /let channel = "";\s*if \(sessionId\.startsWith\("wa_"\)\) channel = "whatsapp";[\s\S]*?res\.status\(400\)\.json\({ error: "Unknown session type" }\);\s*return;\s*\}/;

const newLogic = `
    const [log] = await db
      .select()
      .from(chatLogsTable)
      .where(eq(chatLogsTable.sessionId, sessionId))
      .limit(1);

    if (!log) {
      res.status(404).json({ error: "Session not found in logs" });
      return;
    }
    const channel = log.channel;
`;

if (badLogicRegex.test(code)) {
    code = code.replace(badLogicRegex, newLogic);
    fs.writeFileSync('artifacts/api-server/src/routes/client.ts', code);
    console.log("Successfully patched channel logic in client.ts!");
} else {
    console.log("Could not find the bad logic to replace.");
}

