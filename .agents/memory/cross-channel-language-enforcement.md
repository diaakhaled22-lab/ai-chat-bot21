---
name: Cross-channel language enforcement
description: The durable rule for keeping chatbot replies in the latest customer language across all delivery channels
---

Customer-facing chatbot replies must use the language detected from the latest user message, regardless of earlier conversation turns or knowledge-base language. The AI prompt is guidance; the final response must also be normalized before it is stored or sent.

**Why:** Prompt-only language rules can be overridden by multilingual history, reference content, or model behavior. A shared detector plus final-output guard keeps Website, WhatsApp, Telegram, Messenger, and generic webhook flows consistent.

**How to apply:** Any new customer-facing AI route should use the shared language instruction with the latest user text and pass the generated or externally supplied reply through the shared response normalizer before returning, storing, or sending it.