import { DEFAULT_LOCALE, type Locale, LOCALE_COOKIE, isLocale } from "./messages";

/** Reads the language cookie out of a Cookie header. */
export function localeFromCookieHeader(header: string | null | undefined): Locale | null {
  for (const part of (header ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === LOCALE_COOKIE && isLocale(value)) return value;
  }
  return null;
}

/**
 * Which language to show: the visitor's own choice (cookie), else the DEFAULT_LANG
 * setting, else English. The browser's language is deliberately not used: everyone
 * starts in English and switches with the language menu.
 */
export function pickLocale(input: { cookie?: string | null; defaultLang?: string | null }): Locale {
  return localeFromCookieHeader(input.cookie) ?? (isLocale(input.defaultLang) ? input.defaultLang : null) ?? DEFAULT_LOCALE;
}
