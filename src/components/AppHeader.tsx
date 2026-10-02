"use client";

import { type ReactNode, useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** Top bar: the app name, the language choice and (when logged in) the person's controls. */
export function AppHeader({ admin = false, children }: { admin?: boolean; children?: ReactNode }) {
  const { t } = useI18n();
  // The server sets the title for the first page load; this keeps it in step when the language is changed.
  useEffect(() => {
    document.title = admin ? `${t("app.adminSuffix")} · ${t("app.name")}` : t("app.name");
  }, [t, admin]);
  return (
    <header className="topbar">
      <a className="skip-link" href="#main">
        {t("app.skipToContent")}
      </a>
      <div className="topbar-inner">
        <div className="brand">
          <span>{t("app.name")}</span>
          {admin ? <small>{t("app.adminSuffix")}</small> : null}
        </div>
        <LanguageSwitcher />
        {children}
      </div>
    </header>
  );
}
