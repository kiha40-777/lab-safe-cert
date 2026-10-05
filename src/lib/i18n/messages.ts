// Interface texts (everything except the questions themselves) live in the
// language files in src/locales. To add a language: copy en.json to <code>.json,
// translate the values, and add one line to `locales` below.
import en from "../../locales/en.json";
import ja from "../../locales/ja.json";

export type Messages = typeof en;

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, K> : Leaves<T[K], Join<P, K>>;
}[keyof T & string];
/** Plural variants (key_one / key_other) are addressed by the base key. */
type StripPlural<K extends string> = K extends `${infer B}_one`
  ? B
  : K extends `${infer B}_other`
    ? B
    : K;

/** Every text key, e.g. "home.start". A typo in a key is a compile error. */
export type MessageKey = StripPlural<Leaves<Messages>>;

// `satisfies Messages` makes the compiler check that a language has every key of English.
export const locales = {
  en: { label: "English", messages: en satisfies Messages },
  ja: { label: "日本語", messages: ja satisfies Messages },
} as const;

export type Locale = keyof typeof locales;
export const localeIds = Object.keys(locales) as Locale[];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lsc_lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(locales, value);
}

export type Params = Record<string, string | number>;

function flatten(object: object, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value as object, path));
  }
  return out;
}

const tables = Object.fromEntries(
  localeIds.map((id) => [id, flatten(locales[id].messages)]),
) as Record<Locale, Record<string, string>>;

export function interpolate(template: string, params?: Params): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    params && name in params ? String(params[name]) : placeholder,
  );
}

/** The text for a key, or undefined when no language has it. Falls back to English. */
export function lookup(locale: Locale, key: string, params?: Params): string | undefined {
  for (const id of locale === DEFAULT_LOCALE ? [locale] : [locale, DEFAULT_LOCALE]) {
    const table = tables[id];
    let template: string | undefined;
    if (params && typeof params.count === "number") {
      template = table[`${key}${params.count === 1 ? "_one" : "_other"}`];
    }
    template ??= table[key];
    if (template !== undefined) return interpolate(template, params);
  }
  return undefined;
}

export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  return lookup(locale, key, params) ?? key;
}

/** All flattened keys of a language (used by the tests that compare languages). */
export function keysOf(locale: Locale): string[] {
  return Object.keys(tables[locale]).sort();
}

export function templateOf(locale: Locale, key: string): string | undefined {
  return tables[locale][key];
}

export interface Translator {
  (key: MessageKey, params?: Params): string;
  /**
   * For texts whose key depends on data (a role, a test, an error or issue code):
   * looks up `${prefix}.${id}`; when there is no such text, returns `fallback` (default: the id).
   */
  dynamic(prefix: "roles" | "tests" | "errors" | "issues", id: string, params?: Params, fallback?: string): string;
}

export function makeTranslator(locale: Locale): Translator {
  const t = ((key: MessageKey, params?: Params) => translate(locale, key, params)) as Translator;
  t.dynamic = (prefix, id, params, fallback) => lookup(locale, `${prefix}.${id}`, params) ?? fallback ?? id;
  return t;
}
