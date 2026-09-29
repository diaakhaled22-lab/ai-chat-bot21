import os

def patch_file(path, old_str, new_str):
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    
    if old_str in text:
        text = text.replace(old_str, new_str)
    elif old_str.replace('\n', '\r\n') in text:
        text = text.replace(old_str.replace('\n', '\r\n'), new_str.replace('\n', '\r\n'))
    else:
        print("Not found in " + path)
        return
        
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Patched " + path)

whatsapp_old = """           const rawReply = await callAI(company, userText, history, aiConfig);
           const { cleanResponse: tempResponse } = extractLeadData(rawReply);
           const { cleanResponse, metrics } = extractMetrics(tempResponse);
           const aiReply = enforceResponseLanguage(cleanResponse, userText);

          await db.insert(chatLogsTable).values({
            companyId: company.id,
            channel: "whatsapp",
            sessionId,
            customerMessage: userText,
            botResponse: aiReply, sentiment: metrics?.sentiment || null, intent: metrics?.intent || null});

          await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, aiReply);"""

whatsapp_new = """          if (isSessionInHandoff(priorLogs)) {
            return;
          }

          let rawReply = await callAI(company, userText, history, aiConfig);
          const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);
          const { cleanResponse, metrics } = extractMetrics(tempResponse);
          let aiReply = enforceResponseLanguage(cleanResponse, userText);
          let isHandoff = false;

          if (aiReply.trim() === "[HANDOFF_REQUESTED]" || rawReply.trim() === "[HANDOFF_REQUESTED]") {
            aiReply = localizedChannelMessage(userText, "سيتم تحويلك إلى موظف الدعم، يرجى الانتظار.", "You are being transferred to a human agent. They will reply to you shortly.");
            isHandoff = true;
          }

          if (leadData) {
            await db.insert(leadsTable).values({
              companyId: company.id,
              channel: "whatsapp",
              sessionId,
              name: leadData.name || null,
              email: leadData.email || null,
              phone: leadData.phone || null,
              interest: leadData.interest || null,
            });
          }

          await db.insert(chatLogsTable).values({
            companyId: company.id,
            channel: "whatsapp",
            sessionId,
            customerMessage: userText,
            botResponse: aiReply,
            isHandoff,
            sentiment: metrics?.sentiment || null,
            intent: metrics?.intent || null
          });

          await sendWhatsAppMessage(phoneNumberId, company.whatsappApiToken, senderPhone, aiReply);"""

patch_file('src/routes/whatsapp.ts', whatsapp_old, whatsapp_new)

messenger_old = """        const rawReply = await callAI(company, userText, history, aiConfig);
        const { cleanResponse: tempResponse } = extractLeadData(rawReply);
        const { cleanResponse, metrics } = extractMetrics(tempResponse);
        const aiReply = enforceResponseLanguage(cleanResponse, userText);

        await db.insert(chatLogsTable).values({
          companyId: company.id,
          channel: "messenger",
          sessionId,
          customerMessage: userText,
          botResponse: aiReply, sentiment: metrics?.sentiment || null, intent: metrics?.intent || null});

        await sendMessengerMessage(company.messengerApiKey, senderId, aiReply);"""

messenger_new = """        if (isSessionInHandoff(priorLogs)) {
          return;
        }

        let rawReply = await callAI(company, userText, history, aiConfig);
        const { cleanResponse: tempResponse, leadData } = extractLeadData(rawReply);
        const { cleanResponse, metrics } = extractMetrics(tempResponse);
        let aiReply = enforceResponseLanguage(cleanResponse, userText);
        let isHandoff = false;

        if (aiReply.trim() === "[HANDOFF_REQUESTED]" || rawReply.trim() === "[HANDOFF_REQUESTED]") {
          aiReply = localizedChannelMessage(userText, "سيتم تحويلك إلى موظف الدعم، يرجى الانتظار.", "You are being transferred to a human agent. They will reply to you shortly.");
          isHandoff = true;
        }

        if (leadData) {
          await db.insert(leadsTable).values({
            companyId: company.id,
            channel: "messenger",
            sessionId,
            name: leadData.name || null,
            email: leadData.email || null,
            phone: leadData.phone || null,
            interest: leadData.interest || null,
          });
        }

        await db.insert(chatLogsTable).values({
          companyId: company.id,
          channel: "messenger",
          sessionId,
          customerMessage: userText,
          botResponse: aiReply,
          isHandoff,
          sentiment: metrics?.sentiment || null,
          intent: metrics?.intent || null
        });

        await sendMessengerMessage(company.messengerApiKey, senderId, aiReply);"""

patch_file('src/routes/messenger.ts', messenger_old, messenger_new)

messenger_export_old = """async function sendMessengerMessage(pageAccessToken: string, recipientId: string, text: string) {"""
messenger_export_new = """export async function sendMessengerMessage(pageAccessToken: string, recipientId: string, text: string) {"""
patch_file('src/routes/messenger.ts', messenger_export_old, messenger_export_new)

telegram_export_old = """async function sendTelegramMessage(botToken: string, chatId: number, text: string) {"""
telegram_export_new = """export async function sendTelegramMessage(botToken: string, chatId: number, text: string) {"""
patch_file('src/routes/telegram.ts', telegram_export_old, telegram_export_new)

widget_export_old = """async function sendWidgetMessage(companyId: number, sessionId: string, text: string) {"""
widget_export_new = """export async function sendWidgetMessage(companyId: number, sessionId: string, text: string) {"""
patch_file('src/routes/widget.ts', widget_export_old, widget_export_new)

with open('src/routes/client.ts', 'r', encoding='utf-8') as f:
    client_code = f.read()

if 'POST /client/chat/reply' not in client_code:
    append_code = '''
// POST /client/chat/reply
import { sendWhatsAppMessage } from "./whatsapp";
import { sendTelegramMessage } from "./telegram";
import { sendMessengerMessage } from "./messenger";
import { sendWidgetMessage } from "./widget";

router.post("/client/chat/reply", async (req, res) => {
  try {
    const { sessionId, message, resolveHandoff } = req.body;
    if (!sessionId || !message) {
      res.status(400).json({ error: "Missing sessionId or message" });
      return;
    }

    const [myCompany] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.clientId, req.session.userId!))
      .limit(1);

    if (!myCompany) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Determine channel
    let channel: "whatsapp" | "telegram" | "messenger" | "website";
    if (sessionId.startsWith("wa_")) channel = "whatsapp";
    else if (sessionId.startsWith("tg_")) channel = "telegram";
    else if (sessionId.startsWith("fb_")) channel = "messenger";
    else if (sessionId.startsWith("wg_")) channel = "website";
    else {
      res.status(400).json({ error: "Unknown session type" });
      return;
    }

    // Send the message
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
    } else if (channel === "website") {
      if (typeof sendWidgetMessage === 'function') {
        await sendWidgetMessage(myCompany.id, sessionId, message);
      }
    }

    await db.insert(chatLogsTable).values({
      companyId: myCompany.id,
      channel,
      sessionId,
      botResponse: message,
      isHandoff: resolveHandoff ? false : true,
    });

    if (resolveHandoff) {
      await db.insert(chatLogsTable).values({
        companyId: myCompany.id,
        channel,
        sessionId,
        botResponse: "[HANDOFF_RESOLVED]",
        isHandoff: false,
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Reply error");
    res.status(500).json({ error: "Internal server error" });
  }
});
'''
    with open('src/routes/client.ts', 'a', encoding='utf-8') as f:
        f.write(append_code)
    print("Patched src/routes/client.ts")

