---
name: Knowledge files feed AI prompt
description: How uploaded knowledge files (PDF/Excel/CSV/JSON/Google Sheet) combine with the website-scrape context in the chatbot system prompt
---

The chatbot has two independent, additive knowledge sources feeding the AI system prompt — not a replacement relationship:

1. Website scrape (`websiteDataUrl` on the company) — existing "Website Knowledge Base" section.
2. Uploaded/linked knowledge files (per-company rows: PDF, Excel, CSV, JSON uploads, or a Google Sheet link) — "Uploaded Files Knowledge Base" section.

Both sections are appended independently to `sysContent` in all three channel handlers (widget, telegram, webhook). Neither disables the other; a company can use one, the other, or both.

**Why:** the client wants two data sources the chatbot can draw from simultaneously (website + documents), not a fallback chain.

**How to apply:** when adding a new context source in the future, follow the same pattern — a dedicated builder function producing a bounded, labeled text block, appended alongside (not replacing) existing sections in each channel's prompt assembly. Cap both per-item and total combined size to control prompt cost (this feature used ~2,500 chars/file, ~9,000 chars total, roughly matching the site-scrape cap).

Parsing runs async after the DB row is created (status starts "processing" → "ready"/"error"); only "ready" rows are included in the prompt. Google Sheet links require "Anyone with the link — Viewer" sharing (read via CSV-export URL, no OAuth) — this is separate from the existing write-only Google Sheets lead-capture integration.
