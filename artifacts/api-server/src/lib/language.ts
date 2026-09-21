export type ResponseLanguage = "Arabic" | "English";

const ARABIC_SCRIPT = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/g;
const LATIN_LETTER = /[A-Za-z]/g;
const HEBREW_SCRIPT = /[\u0590-\u05ff]/g;
const CJK_SCRIPT = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u1100-\u11ff\u3100-\u312f]/g;
const FOREIGN_SCRIPTS = /[\u0590-\u05ff\u0400-\u04ff\u0370-\u03ff\u0e00-\u0e7f\u0900-\u097f]/g;

// Common translation leaks from Chinese/multilingual LLMs when writing Arabic
const COMMON_CJK_TO_ARABIC: [RegExp, string][] = [
  [/提供/g, "تقديم"],
  [/请/g, "يرجى"],
  [/你好/g, "مرحباً"],
  [/谢谢/g, "شكراً"],
  [/客服/g, "خدمة العملاء"],
  [/帮助/g, "مساعدة"],
  [/支持/g, "دعم"],
  [/信息/g, "معلومات"],
  [/姓名/g, "الاسم"],
  [/电话/g, "الهاتف"],
];

export function detectResponseLanguage(message: string): ResponseLanguage {
  const arabicCount = message.match(ARABIC_SCRIPT)?.length ?? 0;
  const latinCount = message.match(LATIN_LETTER)?.length ?? 0;

  // If there are no Latin letters, or Arabic letters equal/outnumber Latin, default to Arabic.
  // This ensures that numbers-only messages (01121405023) don't suddenly switch the bot to English.
  return (arabicCount >= latinCount && latinCount === 0) || arabicCount > latinCount ? "Arabic" : "English";
}

export function getLanguageInstruction(latestUserMessage: string, explicitLang?: "ar" | "en"): string {
  const language = explicitLang 
    ? (explicitLang === "ar" ? "Arabic" : "English") 
    : detectResponseLanguage(latestUserMessage);

  return [
    "ABSOLUTE RESPONSE LANGUAGE RULE:",
    explicitLang 
      ? `The user has explicitly requested responses in ${language}.` 
      : `The server detected the latest customer message language as ${language}.`,
    `Reply entirely in ${language}. Do not mix ${language} with another natural language in the same response.`,
    "Always use the language of the latest customer message, not the language of earlier turns, system instructions, or reference content.",
    "Never use Hebrew, Hebrew words, or Hebrew-script characters under any circumstance.",
    "Never use Chinese (Hanzi / CJK), Japanese, Korean, Cyrillic, or any foreign scripts under any circumstance (never write characters like 提供). Every single word must be in standard natural Arabic.",
    "For Arabic, use natural Arabic in Arabic script. For English, use natural English.",
    "Keep URLs, email addresses, product names, and necessary technical identifiers unchanged only when they are required to answer.",
  ].join(" ");
}

export function removeHebrewScript(text: string, language: ResponseLanguage): string {
  let processed = text;

  // 1. Substitute known leaked CJK words to Arabic if replying in Arabic
  if (language === "Arabic") {
    for (const [pattern, replacement] of COMMON_CJK_TO_ARABIC) {
      processed = processed.replace(pattern, replacement);
    }
  }

  // 2. Strip any remaining CJK, Hebrew, Cyrillic, or other foreign scripts
  processed = processed
    .replace(CJK_SCRIPT, "")
    .replace(FOREIGN_SCRIPTS, "")
    .replace(HEBREW_SCRIPT, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // 3. Preserve URLs and email addresses as technical identifiers while removing
  // natural-language script from the wrong-language response.
  if (language === "English") {
    return processed.replace(ARABIC_SCRIPT, "").replace(/[ \t]{2,}/g, " ").trim();
  }

  const protectedTokens: string[] = [];
  const withPlaceholders = processed.replace(
    /https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.\w+/gi,
    (token) => {
      protectedTokens.push(token);
      return `\u0000${protectedTokens.length - 1}\u0000`;
    },
  );
  const arabicOnly = withPlaceholders
    .replace(LATIN_LETTER, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([،؛؟.!])/g, "$1")
    .trim();

  return arabicOnly.replace(/\u0000(\d+)\u0000/g, (_, index: string) => protectedTokens[Number(index)]);
}

export function enforceResponseLanguage(text: string, latestUserMessage: string, explicitLang?: "ar" | "en"): string {
  const language = explicitLang 
    ? (explicitLang === "ar" ? "Arabic" : "English") 
    : detectResponseLanguage(latestUserMessage);
  const cleaned = removeHebrewScript(text, language);

  if (cleaned) return cleaned;

  return language === "Arabic"
    ? "عذراً، لم أتمكن من صياغة رد الآن. يرجى المحاولة مرة أخرى."
    : "Sorry, I could not prepare a response right now. Please try again.";
}

export function localizedChannelMessage(
  latestUserMessage: string,
  arabic: string,
  english: string,
  explicitLang?: "ar" | "en"
): string {
  const language = explicitLang 
    ? (explicitLang === "ar" ? "Arabic" : "English") 
    : detectResponseLanguage(latestUserMessage);
  return language === "Arabic" ? arabic : english;
}