---
name: Google Sheets is a write target, not a knowledge source
description: How the chatbot's Google Sheets integration is meant to work — read this before touching syncConversationToSheet or the sheet-related company fields.
---

The Google Sheet configured on a company is a **write target the company owner controls**, not a
knowledge base fed into the AI's context. The owner defines fields by naming them in the sheet's
header row (row 1) — e.g. "Name", "Phone", "Email", "Conversation Date". During live chat on any
channel (Telegram, WhatsApp webhook, Website widget — including both the auto-AI-reply branch and
the caller-supplied-`botResponse` branch of `/webhook/message`), the bot extracts those fields from
the conversation via an AI JSON-extraction call and appends/updates a row.

**Why:** An earlier iteration read the sheet's contents into the AI system prompt (treating it like
`websiteDataUrl`). The user clarified this was backwards — the sheet is where the bot stores captured
customer info, not something it reads from. Website Data URL is the knowledge source; Google Sheets is
the write-back/CRM sink.

**How to apply:**
- Returning-customer matching checks BOTH a "phone"-like header and an "email"-like header
  independently (row scan, match on either) — do not special-case a single "preferred" identifier
  column, since a customer may give phone in one chat and email in another.
- The write path must never block or fail the actual chat reply: sheet sync runs unawaited (`void
  syncConversationToSheet(...)`) and every internal step is wrapped in try/catch with `logger.warn`,
  never throwing.
- Any new live-chat code path that generates a reply (auto or caller-supplied) must also call
  `syncConversationToSheet` — it's easy to miss a secondary path when a route has more than one way to
  produce/store a turn.
