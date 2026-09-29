import os

def patch_file(path, old_str, new_str):
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    
    if old_str in text:
        text = text.replace(old_str, new_str)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print("Patched " + path)
    else:
        print("Not found in " + path)

widget_old = """    if (isSessionInHandoff(priorLogs)) {
      res.json({ reply: localizedChannelMessage(message.trim(), "جاري تحويلك الى موظف دعم فني وسيتواصل معك قريبا.", "You are being transferred to a human agent. They will reply to you shortly.") });
      return;
    }"""

widget_new = """    if (isSessionInHandoff(priorLogs)) {
      if (sessionId && typeof sessionId === "string") {
        await db.insert(chatLogsTable).values({
          companyId: company.id,
          channel: "website",
          sessionId,
          customerMessage: message.trim(),
          botResponse: null,
          isHandoff: true
        });
      }
      res.json({ reply: "" });
      return;
    }"""

# Actually let's just make it return empty or something? Or return a short handoff waiting message
patch_file('src/routes/widget.ts', widget_old, widget_new)
