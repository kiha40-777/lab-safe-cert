"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { type Locale, LOCALE_COOKIE, type Translator, makeTranslator } from "./messages";

interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
  /** e.g. "Sep 30, 2026, 5:07 PM" / "2026年9月30日 17:07" */
  formatDateTime: (iso: string) => string;
  formatDate: (iso: string) => string;
  /** Sorts names the way people of the chosen language expect. */
  compareNames: (a: string, b: string) => number;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18n>(() => {
    const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
    return {
      locale,
      setLocale,
      t: makeTranslator(locale),
      formatDateTime: (iso) => dateTime.format(new Date(iso)),
      formatDate: (iso) => date.format(new Date(iso)),
      compareNames: (a, b) => collator.compare(a, b),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>.");
  return value;
}
