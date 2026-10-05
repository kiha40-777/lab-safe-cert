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
        <div className="stack">
          <header className="page-head" style={{ alignItems: "center" }}>
            <p className="eyebrow" style={{ flex: "1 1 16rem" }}>
              {testName}
            </p>
            <div className="page-head-actions">
              {hasMaterial ? (
                <button type="button" className="btn" onClick={() => setShowMaterial((shown) => !shown)} aria-expanded={showMaterial}>
                  {showMaterial ? t("result.hideMaterial") : t("result.showMaterial")}
                </button>
              ) : null}
              <button type="button" className="btn" onClick={onBack}>
                {t("result.backHome")}
              </button>
              {!result.passed ? (
                <button type="button" className="btn btn-primary" onClick={onRetry}>
                  {t("result.retry")}
                </button>
              ) : null}
            </div>
          </header>

          <div className={`verdict ${result.passed ? "verdict-pass" : "verdict-fail"}`}>
            <h1>{result.passed ? t("result.passed") : t("result.failed")}</h1>
            <p style={{ fontVariantNumeric: "tabular-nums" }}>
              <strong style={{ fontWeight: 800 }}>
                {t("result.score", { score: result.score, total: result.total })} ({percent}%)
              </strong>
              {" / "}
              {t("result.required", { required: result.requiredScore })}
            </p>
          </div>
        </div>

        {result.promotedTo ? (
          <Notice kind="success">{t("result.promoted", { role: t.dynamic("roles", result.promotedTo) })}</Notice>
        ) : null}
        {!result.passed ? <p className="muted">{t("result.failedHint")}</p> : null}

        {showMaterial ? (
          <section>
            <PdfViewer src={`/api/participant/materials/${result.testId}`} title={t("home.materialFor", { test: testName })} />
          </section>
        ) : null}

        <ResultReview questions={result.questions} jump />
      </div>
    </main>
  );
}
