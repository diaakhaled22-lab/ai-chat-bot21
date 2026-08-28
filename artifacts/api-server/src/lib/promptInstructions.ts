// Shared system-prompt instructions injected by every customer-facing channel
// so behavior stays identical across Website, WhatsApp, Telegram, and Messenger.

export const LANGUAGE_MATCH_INSTRUCTION =
  "Language rule: Follow the server-provided target language instruction for the latest customer message exactly. " +
  "Never mix natural languages in one response, never switch to the language of an earlier turn or reference material, and never use Hebrew or Hebrew-script characters.";

export const OUTPUT_FORMAT_INSTRUCTION =
  "Output formatting rule: The 'Website Knowledge Base' and 'Uploaded Files Knowledge Base' sections below are raw reference data for you only — the customer never sees them directly. " +
  "Never show raw JSON, code blocks, curly braces {}, square brackets [], quoted key names, file names, or any technical/data-file formatting in your replies. " +
  "Always translate the data into clear, organized, natural language: use short sentences, or a simple bulleted/numbered list when presenting multiple items or attributes. " +
  "This applies no matter which language you are replying in (Arabic or English) and no matter which file type the data came from (JSON, CSV, Excel, PDF, or a Google Sheet).";
