"use client";

import { useId, useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Notice } from "@/components/Notice";
import { api } from "@/lib/api";
import { MAX_CASE_STUDY, type TestConfig } from "@/lib/certification";
import { useI18n } from "@/lib/i18n/context";
import type { CaseStudyInfo } from "@/lib/types";

const isCount = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;

/**
 * Case-study questions of a test: how many the AI is asked to write (only used in the prompt of
 * step 1) and how many of the questions of each test are case studies (saved on the server; always asked last).
 */
export function CaseStudySection({
  test,
  info,
  generateCount,
  onGenerateCountChange,
  onChanged,
}: {
  test: TestConfig;
  /** Current state on the server (the saved number per test and how many case studies the bank holds). */
  info: CaseStudyInfo;
  generateCount: number;
  onGenerateCountChange: (count: number) => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const id = useId();
  const [perTestText, setPerTestText] = useState(String(info.perTest));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const perTest = perTestText.trim() === "" ? Number.NaN : Number(perTestText);
  const valid = isCount(perTest, test.questionsPerTest);
  const changed = valid && perTest !== info.perTest;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/api/admin/tests/${test.id}/case-study`, { perTest });
      await onChanged();
      setSaved(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section section-split" aria-labelledby={`${id}-title`}>
      <div className="section-intro">
        <h2 id={`${id}-title`}>{t("admin.caseStudy.title")}</h2>
        <p>{t("admin.caseStudy.help", { count: test.questionsPerTest })}</p>
      </div>
      <div className="stack">

        <div className="field">
          <label htmlFor={`${id}-generate`}>{t("admin.caseStudy.generateLabel")}</label>
          <input
            id={`${id}-generate`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_CASE_STUDY}
            style={{ maxWidth: "8rem" }}
            value={generateCount}
            onChange={(event) => {
              const n = event.target.value === "" ? 0 : Number(event.target.value);
              if (isCount(n, MAX_CASE_STUDY)) onGenerateCountChange(n);
            }}
          />
          <span className="hint">{t("admin.caseStudy.generateHint")}</span>
        </div>

        <div className="field">
          <label htmlFor={`${id}-per-test`}>{t("admin.caseStudy.perTestLabel")}</label>
          <div className="row-wrap">
            <input
              id={`${id}-per-test`}
              type="number"
              inputMode="numeric"
              min={0}
              max={test.questionsPerTest}
              style={{ maxWidth: "8rem" }}
              value={perTestText}
              aria-invalid={!valid}
              onChange={(event) => {
                setPerTestText(event.target.value);
                setSaved(false);
              }}
            />
            <button type="button" className="btn btn-primary" disabled={!changed || busy} onClick={() => void save()}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
          <span className="hint">{t("admin.caseStudy.perTestHint", { max: test.questionsPerTest })}</span>
        </div>

        <ErrorNotice error={error} />
        {saved && !changed ? <Notice kind="success">{t("admin.caseStudy.saved")}</Notice> : null}

        {info.perTest > 0 ? (
          <p className="small muted">
            {t("admin.caseStudy.testSize", {
              total: test.questionsPerTest,
              standard: test.questionsPerTest - info.perTest,
              caseStudy: info.perTest,
            })}
          </p>
        ) : null}
        <p className="small muted">{t("admin.caseStudy.available", { count: info.available })}</p>
        {info.available < info.perTest ? (
          <Notice kind="warning">{t("admin.caseStudy.notEnough", { available: info.available, required: info.perTest })}</Notice>
        ) : null}
      </div>
    </section>
  );
}
