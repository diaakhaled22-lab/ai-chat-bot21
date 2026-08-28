export type ResponseLanguage = "Arabic" | "English";

const ARABIC_SCRIPT = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/g;
const LATIN_LETTER = /[A-Za-z]/g;
const HEBREW_SCRIPT = /[\u0590-\u05ff]/g;

export function detectResponseLanguage(message: string): ResponseLanguage {
  const arabicCount = message.match(ARABIC_SCRIPT)?.length ?? 0;
  const latinCount = message.match(LATIN_LETTER)?.length ?? 0;

  return arabicCount > 0 && arabicCount >= latinCount ? "Arabic" : "English";
}

export function getLanguageInstruction(latestUserMessage: string): string {
  const language = detectResponseLanguage(latestUserMessage);

  return [
    "ABSOLUTE RESPONSE LANGUAGE RULE:",
    `The server detected the latest customer message language as ${language}.`,
    `Reply entirely in ${language}. Do not mix ${language} with another natural language in the same response.`,
    "Always use the language of the latest customer message, not the language of earlier turns, system instructions, or reference content.",
    "Never use Hebrew, Hebrew words, or Hebrew-script characters under any circumstance.",
    "For Arabic, use natural Arabic in Arabic script. For English, use natural English.",
    "Keep URLs, email addresses, product names, and necessary technical identifiers unchanged only when they are required to answer.",
  ].join(" ");
}

export function removeHebrewScript(text: string, language: ResponseLanguage): string {
  const withoutHebrew = text.replace(HEBREW_SCRIPT, "").replace(/[ \t]{2,}/g, " ").trim();

  // Preserve URLs and email addresses as technical identifiers while removing
  // natural-language script from the wrong-language response.
  if (language === "English") {
    return withoutHebrew.replace(ARABIC_SCRIPT, "").replace(/[ \t]{2,}/g, " ").trim();
  }

  const protectedTokens: string[] = [];
  const withPlaceholders = withoutHebrew.replace(
    /https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.\w+/gi,
    (token) => {
      protectedTokens.push(token);
      return `\u0000${protectedTokens.length - 1}\u0000`;
    },
  );
  const arabicOnly = withPlaceholders
    .replace(LATIN_LETTER, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([،؛؟,.!])/g, "$1")
    .trim();

  return arabicOnly.replace(/\u0000(\d+)\u0000/g, (_, index: string) => protectedTokens[Number(index)]);
}

export function enforceResponseLanguage(text: string, latestUserMessage: string): string {
  const language = detectResponseLanguage(latestUserMessage);
  const cleaned = removeHebrewScript(text, language);

  if (cleaned) return cleaned;

  return language === "Arabic"
    ? "عذرًا، لم أتمكن من إعداد رد الآن. يرجى المحاولة مرة أخرى."
    : "Sorry, I could not prepare a response right now. Please try again.";
}

export function localizedChannelMessage(
  latestUserMessage: string,
  arabic: string,
  english: string,
): string {
  return detectResponseLanguage(latestUserMessage) === "Arabic" ? arabic : english;
}