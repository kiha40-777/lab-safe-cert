import { DEFAULT_LOCALE, type Locale, LOCALE_COOKIE, isLocale, localeIds } from "./messages";

/** Reads the language cookie out of a Cookie header. */
export function localeFromCookieHeader(header: string | null | undefined): Locale | null {
  for (const part of (header ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === LOCALE_COOKIE && isLocale(value)) return value;
  }
  return null;
}

/** The best supported language for an Accept-Language header ("ja-JP,ja;q=0.9,en;q=0.8"), or null. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  const wanted = (header ?? "")
    .split(",")
    .map((item) => {
      const [tag = "", ...params] = item.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);
      return { tag: tag.toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter((entry) => entry.tag !== "" && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const primary = tag.split("-")[0];
    const match = localeIds.find((id) => id === tag || id === primary);
    if (match) return match;
  }
  return null;
}

/**
 * Which language to show: the visitor's own choice (cookie), else the
 * DEFAULT_LANG setting, else the browser's language, else English.
 */
export function pickLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  defaultLang?: string | null;
}): Locale {
  return (
    localeFromCookieHeader(input.cookie) ??
    (isLocale(input.defaultLang) ? input.defaultLang : null) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
