"use client";

import { useI18n } from "@/lib/i18n/context";
import { type Locale, isLocale, localeIds, locales } from "@/lib/i18n/messages";

/** Lets the visitor choose the language of buttons and explanations (not of the questions). */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="row small">
      <span className="visually-hidden">{t("common.language")}</span>
      <span aria-hidden="true">🌐</span>
      <select
        value={locale}
        onChange={(event) => {
          const next: string = event.target.value;
          if (isLocale(next)) setLocale(next satisfies Locale);
        }}
        style={{ width: "auto", minHeight: 36, padding: "0.25rem 0.5rem" }}
      >
        {localeIds.map((id) => (
          <option key={id} value={id} lang={id}>
            {locales[id].label}
          </option>
        ))}
      </select>
    </label>
  );
}
