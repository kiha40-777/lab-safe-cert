"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";

/** Shown when a page crashes unexpectedly. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="container">
      <div className="card card-narrow stack">
        <h1>{t("errors.internal")}</h1>
        <div>
          <button type="button" className="btn btn-primary" onClick={reset}>
            {t("common.retry")}
          </button>
        </div>
      </div>
    </main>
  );
}
