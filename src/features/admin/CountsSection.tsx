"use client";

import { useId, useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Notice } from "@/components/Notice";
import { api } from "@/lib/api";
import type { TestConfig } from "@/lib/certification";
import {
  COUNT_LIMITS,
  type CountsProblem,
  type TestCounts,
  checkCounts,
  isCount,
  standardBankSize,
  standardPerTest,
} from "@/lib/counts";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/messages";
import styles from "./CountsSection.module.css";

const PROBLEM_TEXT: Record<CountsProblem, MessageKey> = {
  perTestAboveBank: "admin.counts.problems.perTestAboveBank",
  caseStudyBankAboveBank: "admin.counts.problems.caseStudyBankAboveBank",
  caseStudyPerTestAbovePerTest: "admin.counts.problems.caseStudyPerTestAbovePerTest",
  caseStudyPerTestAboveBank: "admin.counts.problems.caseStudyPerTestAboveBank",
  ordinaryShort: "admin.counts.problems.ordinaryShort",
  noCaseStudies: "admin.counts.problems.noCaseStudies",
};

type Text = Record<keyof TestCounts, string>;

/**
 * How many questions the question set of a test holds and how many one attempt asks, each with how many of
 * them are case studies. Set first: the AI prompt (step 1) asks for these numbers, the question set is checked
 * against them (steps 2 and 3) and the test draws from it. Case studies are part of the totals.
 */
export function CountsSection({
  test,
  counts,
  onChanged,
}: {
  test: TestConfig;
  /** The numbers saved on the server. */
  counts: TestCounts;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const id = useId();
  const supportsCaseStudy = test.caseStudy !== undefined;
  const [text, setText] = useState<Text>(() => ({
    bankSize: String(counts.bankSize),
    perTest: String(counts.perTest),
    caseStudyBankSize: String(counts.caseStudyBankSize),
    caseStudyPerTest: String(counts.caseStudyPerTest),
  }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));
  const entered: TestCounts = {
    bankSize: toNumber(text.bankSize),
    perTest: toNumber(text.perTest),
    // A test without case studies has none, whatever the hidden fields hold.
    caseStudyBankSize: supportsCaseStudy ? toNumber(text.caseStudyBankSize) : 0,
    caseStudyPerTest: supportsCaseStudy ? toNumber(text.caseStudyPerTest) : 0,
  };
  const fields = (Object.keys(COUNT_LIMITS) as (keyof TestCounts)[]).filter(
    (field) => supportsCaseStudy || !field.startsWith("caseStudy"),
  );
  const wrong = new Set(fields.filter((field) => !isCount(field, entered[field])));
  const problems = wrong.size === 0 ? checkCounts(entered, supportsCaseStudy) : [];
  const changed = wrong.size === 0 && fields.some((field) => entered[field] !== counts[field]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/api/admin/tests/${test.id}/counts`, entered);
      await onChanged();
      setSaved(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const input = (field: keyof TestCounts, row: string, column: string) => {
    const [least, most] = COUNT_LIMITS[field];
    return (
      <input
        type="number"
        inputMode="numeric"
        min={least}
        max={most}
        value={text[field]}
        aria-label={`${row}: ${column}`}
        aria-invalid={wrong.has(field)}
        onChange={(event) => {
          setText({ ...text, [field]: event.target.value });
          setSaved(false);
        }}
      />
    );
  };

  const colBank = t("admin.counts.colBank");
  const colTest = t("admin.counts.colTest");
  const rowTotal = t("admin.counts.rowTotal");
  const rowCaseStudy = t("admin.counts.rowCaseStudy");

  return (
    <section className="section section-split" aria-labelledby={`${id}-title`}>
      <div className="section-intro">
        <h2 id={`${id}-title`}>{t("admin.counts.title")}</h2>
        <p>{t("admin.counts.help")}</p>
      </div>
      <div className="stack">
        <div className={styles.grid} role="group" aria-labelledby={`${id}-title`}>
          <span />
          <span className={styles.head}>{colBank}</span>
          <span className={styles.head}>{colTest}</span>

          <span className={styles.rowLabel}>{rowTotal}</span>
          {input("bankSize", rowTotal, colBank)}
          {input("perTest", rowTotal, colTest)}

          {supportsCaseStudy ? (
            <>
              <span className={styles.rowLabel}>{rowCaseStudy}</span>
              {input("caseStudyBankSize", rowCaseStudy, colBank)}
              {input("caseStudyPerTest", rowCaseStudy, colTest)}

              <span className={styles.rowLabel}>{t("admin.counts.rowStandard")}</span>
              <span className={styles.computed}>{wrong.size === 0 ? standardBankSize(entered) : "–"}</span>
              <span className={styles.computed}>{wrong.size === 0 ? standardPerTest(entered) : "–"}</span>
            </>
          ) : null}
        </div>

        <p className="hint">{t(supportsCaseStudy ? "admin.counts.hintCaseStudy" : "admin.counts.hint")}</p>

        {wrong.size > 0 ? <Notice kind="warning">{t("admin.counts.invalid")}</Notice> : null}
        {problems.length > 0 ? (
          <Notice kind="warning">
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{t(PROBLEM_TEXT[problem])}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <ErrorNotice error={error} />
        {saved && !changed ? <Notice kind="success">{t("admin.counts.saved")}</Notice> : null}

        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!changed || problems.length > 0 || busy}
            onClick={() => void save()}
          >
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </section>
  );
}
