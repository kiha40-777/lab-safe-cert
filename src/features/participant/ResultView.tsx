"use client";

import { useState } from "react";
import { Notice } from "@/components/Notice";
import { PdfViewer } from "@/components/PdfViewer";
import { ResultReview } from "@/components/ResultReview";
import { useI18n } from "@/lib/i18n/context";
import type { AttemptResult } from "@/lib/types";

/** Score, verdict, every question with the person's answer and the correct one, and the study PDF again. */
export function ResultView({
  result,
  hasMaterial,
  onRetry,
  onBack,
}: {
  result: AttemptResult;
  hasMaterial: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [showMaterial, setShowMaterial] = useState(false);
  const testName = t.dynamic("tests", `${result.testId}.name`);
  const percent = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;

  return (
    <main id="main" className="container container-wide">
      <div className="stack-lg">
        <section className="card stack">
          <p className="muted">
            {testName} — {t("result.title")}
          </p>
          <Notice kind={result.passed ? "success" : "warning"}>
            <p style={{ fontSize: "1.5rem", fontWeight: 800 }}>{result.passed ? t("result.passed") : t("result.failed")}</p>
          </Notice>
          <p style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            {t("result.score", { score: result.score, total: result.total })} ({percent}%)
          </p>
          <p className="muted">{t("result.required", { required: result.requiredScore })}</p>
          {result.promotedTo ? (
            <Notice kind="success">{t("result.promoted", { role: t.dynamic("roles", result.promotedTo) })}</Notice>
          ) : null}
          {!result.passed ? <p>{t("result.failedHint")}</p> : null}

          <div className="row-wrap">
            {!result.passed ? (
              <button type="button" className="btn btn-primary" onClick={onRetry}>
                {t("result.retry")}
              </button>
            ) : null}
            {hasMaterial ? (
              <button type="button" className="btn" onClick={() => setShowMaterial((shown) => !shown)} aria-expanded={showMaterial}>
                {showMaterial ? t("result.hideMaterial") : t("result.showMaterial")}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={onBack}>
              {t("result.backHome")}
            </button>
          </div>
        </section>

        {showMaterial ? (
          <section className="card">
            <PdfViewer src={`/api/participant/materials/${result.testId}`} title={t("home.materialFor", { test: testName })} />
          </section>
        ) : null}

        <ResultReview questions={result.questions} jump />
      </div>
    </main>
  );
}
