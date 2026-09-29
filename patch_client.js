const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

// Find the start of router.post("/client/chat/reply"
const replyStart = code.indexOf('router.post("/client/chat/reply"');
// Find the start of router.get("/client/leads"
const leadsStart = code.indexOf('router.get("/client/leads"');

if (replyStart !== -1 && leadsStart !== -1 && replyStart < leadsStart) {
  const before = code.substring(0, replyStart);
  const after = code.substring(leadsStart);
  
  const newRoute = `
import { sendWhatsAppMessage } from "./whatsapp";
import { sendTelegramMessage } from "./telegram";
import { sendMessengerMessage } from "./messenger";

router.post("/client/chat/reply", async (req, res) => {
  try {
    const { sessionId, message, resolveHandoff } = req.body;
    if (!sessionId || message === undefined) {
      res.status(400).json({ error: "Missing sessionId or message" });
      return;
    }

    const [myCompany] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId))
      .limit(1);

    if (!myCompany) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    let channel = "";
    if (sessionId.startsWith("wa_")) channel = "whatsapp";
    else if (sessionId.startsWith("tg_")) channel = "telegram";
    else if (sessionId.startsWith("fb_")) channel = "messenger";
    else if (sessionId.startsWith("wg_")) channel = "website";
    else {
      res.status(400).json({ error: "Unknown session type" });
      return;
    }

    if (!resolveHandoff && message) {
        if (channel === "whatsapp") {
          const recipientPhone = sessionId.replace("wa_", "");
          if (myCompany.whatsappPhoneNumberId && myCompany.whatsappApiToken) {
            await sendWhatsAppMessage(myCompany.whatsappPhoneNumberId, myCompany.whatsappApiToken, recipientPhone, message);
          }
        } else if (channel === "telegram") {
          const chatId = parseInt(sessionId.replace("tg_", ""), 10);
          if (myCompany.telegramBotApiKey) {
            await sendTelegramMessage(myCompany.telegramBotApiKey, chatId, message);
          }
        } else if (channel === "messenger") {
          const senderId = sessionId.replace("fb_", "");
          if (myCompany.messengerApiKey) {
            await sendMessengerMessage(myCompany.messengerApiKey, senderId, message);
          }
        }
    }

    if (!resolveHandoff && message) {
        await db.insert(chatLogsTable).values({
          companyId: myCompany.id,
          channel: channel as any,
          sessionId,
          customerMessage: "",
          botResponse: "[مراسل البشري] " + message,
          isHandoff: true,
          isHumanReply: true
        });
    }

    if (resolveHandoff) {
      await db.insert(chatLogsTable).values({
        companyId: myCompany.id,
        channel: channel as any,
        sessionId,
        customerMessage: "",
        botResponse: "[HANDOFF_RESOLVED]",
        isHandoff: false,
        isHumanReply: false
      });
    }

    res.json({ success: true, ok: true });
  } catch (err) {
    logger.error({ err }, "Reply error");
    res.status(500).json({ error: "Internal server error" });
  }
});

`;
  
  // Note: we inject imports here but wait, imports must be at top level!
  // It's better to put imports at the top. Let's do that.
  let finalCode = before + newRoute + after;
  
  // Move imports to the top:
  const importsToInject = 'import { sendWhatsAppMessage } from "./whatsapp";\nimport { sendTelegramMessage } from "./telegram";\nimport { sendMessengerMessage } from "./messenger";\n';
  // Avoid duplicating if they are already there
  if (!before.includes('sendWhatsAppMessage')) {
      finalCode = finalCode.replace('import { Router } from "express";', 'import { Router } from "express";\n' + importsToInject);
  }
  // Strip the ones we injected inside newRoute to avoid top-level issues inside blocks
  finalCode = finalCode.replace(/import { send[A-Za-z]+Message } from "\.\/[a-z]+";\n/g, "");

  fs.writeFileSync('artifacts/api-server/src/routes/client.ts', finalCode);
  console.log('Successfully patched client.ts!');
} else {
  console.log('Could not find markers', replyStart, leadsStart);
}
