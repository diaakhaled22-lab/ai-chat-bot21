import { createContext, useContext, useEffect, useState } from "react";
import { translations, type Lang, type TranslationKey } from "@/i18n/translations";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem("mc-lang");
      return (stored === "ar" || stored === "en") ? stored : "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    applyLang(lang);
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    try { localStorage.setItem("mc-lang", next); } catch {}
  };

  const t = (key: TranslationKey): string => translations[lang][key] as string;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
