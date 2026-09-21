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
    "Only TWO languages are authorized for responses: Arabic and English. No other language is allowed.",
    explicitLang 
      ? `The user has explicitly requested responses in ${language}.` 
      : `The target response language for this message is ${language}.`,
    `Reply entirely and strictly in ${language}. Do not mix ${language} with any other language.`,
    "If the customer writes in Arabic, respond strictly in standard Arabic script.",
    "If the customer writes in English, respond strictly in standard English.",
    "If the customer writes in any other language, respond strictly in Arabic or English only.",
    "Never use Chinese (Hanzi/CJK), Japanese, Korean, Cyrillic, Hebrew, or any foreign scripts under any circumstance.",
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

// Common greetings fallback if AI model output is empty or stripped
const GREETING_FALLBACKS: Record<string, string> = {
  "السلام": "وعليكم السلام ورحمة الله وبركاته! أهلاً بك، كيف يمكنني مساعدتك اليوم؟",
  "السلام عليكم": "وعليكم السلام ورحمة الله وبركاته! أهلاً وسهلاً بك، كيف أستطيع خدمتك اليوم؟",
  "سلام": "وعليكم السلام ورحمة الله! كيف يمكنني مساعدتك؟",
  "مرحبا": "مرحباً بك! يسعدني مساعدتك، تفضل بسؤالك.",
  "مرحباً": "مرحباً بك! يسعدني مساعدتك، تفضل بسؤالك.",
  "أهلا": "أهلاً وسهلاً بك! كيف يمكنني مساعدتك اليوم؟",
  "أهلاً": "أهلاً وسهلاً بك! كيف يمكنني مساعدتك اليوم؟",
  "صباح الخير": "صباح النور والسرور! كيف يمكنني خدمتك اليوم؟",
  "مساء الخير": "مساء النور والسرور! كيف يمكنني مساعدتك اليوم؟",
  "hello": "Hello! How can I assist you today?",
  "hi": "Hi there! How can I help you today?",
  "hey": "Hey! How can I help you today?",
};

export function enforceResponseLanguage(text: string, latestUserMessage: string, explicitLang?: "ar" | "en"): string {
  const language = explicitLang 
    ? (explicitLang === "ar" ? "Arabic" : "English") 
    : detectResponseLanguage(latestUserMessage);
  const cleaned = removeHebrewScript(text, language);

  if (cleaned) return cleaned;

  // Smart fallback for greetings if AI model returned empty or stripped
  const normalizedUserMsg = latestUserMessage.trim().replace(/[!.,؟?]/g, "").trim().toLowerCase();
  if (GREETING_FALLBACKS[normalizedUserMsg]) {
    return GREETING_FALLBACKS[normalizedUserMsg];
  }

  // Friendly conversational fallback instead of generic error
  return language === "Arabic"
    ? "أهلاً بك! كيف يمكنني مساعدتك اليوم؟"
    : "Hello! How can I help you today?";
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