// Shared system-prompt instructions injected by every customer-facing channel
// so behavior stays identical across Website, WhatsApp, Telegram, and Messenger.

export const LANGUAGE_MATCH_INSTRUCTION =
  "Strict Language Rule: You are authorized to respond in ONLY TWO LANGUAGES: Arabic and English. No other language is permitted under any circumstances. " +
  "If the customer writes in Arabic, reply exclusively in natural Arabic script. " +
  "If the customer writes in English, reply exclusively in natural English. " +
  "If the customer writes in any other language (such as French, Spanish, German, Russian, Chinese, Hindi, Turkish, Hebrew, etc.), respond ONLY in Arabic or English stating that support is only available in Arabic and English, or answer them in Arabic/English. " +
  "Never output Chinese (CJK), Japanese, Korean, Cyrillic, Hebrew, or any foreign scripts.";

export const OUTPUT_FORMAT_INSTRUCTION =
  "Output formatting rule: The 'Website Knowledge Base' and 'Uploaded Files Knowledge Base' sections below are raw reference data for you only — the customer never sees them directly. " +
  "Never show raw JSON, code blocks, curly braces {}, square brackets [], quoted key names, file names, or any technical/data-file formatting in your replies. " +
  "Always translate the data into clear, organized, natural language: use short sentences, or a simple bulleted/numbered list when presenting multiple items or attributes. " +
  "This applies no matter which language you are replying in (Arabic or English) and no matter which file type the data came from (JSON, CSV, Excel, PDF, or a Google Sheet).";
