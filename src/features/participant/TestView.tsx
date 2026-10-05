"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Notice } from "@/components/Notice";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import type { AttemptResult, AttemptView } from "@/lib/types";
import styles from "./TestView.module.css";

const LETTERS = "ABCDEFGH";
const AUTOSAVE_DELAY_MS = 500;

/** Taking a test: one question at a time, answers saved as you go, a summary before handing in. */
export function TestView({
  attempt,
  onSubmitted,
  onLeave,
}: {
  attempt: AttemptView;
  onSubmitted: (result: AttemptResult) => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const total = attempt.questions.length;
  const [answers, setAnswers] = useState<(number | null)[]>(attempt.answers);
  const [index, setIndex] = useState(() => Math.max(0, attempt.answers.findIndex((a) => a === null)));
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const saved = useRef(JSON.stringify(attempt.answers));
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const question = attempt.questions[index];
  const answeredCount = answers.filter((a) => a !== null).length;
  const unanswered = answers.flatMap((a, i) => (a === null ? [i + 1] : []));

  const saveNow = useCallback(
    async (current: (number | null)[]) => {
      const text = JSON.stringify(current);
      if (text === saved.current) return;
      try {
        await api.put(`/api/participant/attempts/${attempt.id}/answers`, { answers: current });
        saved.current = text;
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
    },
    [attempt.id],
  );

  // Save shortly after the last change.
  useEffect(() => {
    const timer = window.setTimeout(() => void saveNow(answers), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [answers, saveNow]);

  // Move keyboard/screen-reader focus to the new question when the question changes.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [index]);

  function choose(choiceIndex: number) {
    setAnswers((previous) => previous.map((value, i) => (i === index ? choiceIndex : value)));
  }

  async function leave() {
    await saveNow(answers);
    onLeave();
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      onSubmitted(await api.post<AttemptResult>(`/api/participant/attempts/${attempt.id}/submit`, { answers }));
    } catch (failure) {
      setError(failure);
      setSubmitting(false);
    }
  }

  if (!question) return null;
  const isLast = index === total - 1;

  return (
    <main id="main" className="container container-wide">
      <div className="stack-lg">
        <header className="page-head">
          <div className="page-head-text">
            <h1>{t.dynamic("tests", `${attempt.testId}.name`)}</h1>
          </div>
          <button type="button" className="link-button small" onClick={() => void leave()}>
            {t("test.leave")}
          </button>
        </header>

        {attempt.resumed ? <Notice kind="info">{t("test.restored")}</Notice> : null}

        <div className={styles.layout}>
          <section className={`stack ${styles.main}`} aria-labelledby="question-heading">
            <div className="row-wrap">
              <h2 id="question-heading" ref={heading} tabIndex={-1} className={styles.heading}>
                {t("test.questionOf", { current: index + 1, total })}
              </h2>
              <span className="spacer" />
              <span className="muted small">{t("test.answered", { answered: answeredCount, total })}</span>
            </div>
            <progress className={styles.progress} max={total} value={answeredCount} aria-hidden="true" />

            <fieldset className={styles.question}>
              <legend className={styles.legend}>{question.text}</legend>
              <div className={styles.choices} role="radiogroup" aria-label={t("test.choices")}>
                {question.choices.map((choice, k) => {
                  const selected = answers[index] === k;
                  return (
                    <label key={`${index}-${k}`} className={`${styles.choice} ${selected ? styles.selected : ""}`.trim()}>
                      <input
                        type="radio"
                        name={`question-${index}`}
                        checked={selected}
                        onChange={() => choose(k)}
                      />
                      <span className={styles.letter} aria-hidden="true">
                        {LETTERS[k] ?? k + 1}
                      </span>
                      <span className={styles.choiceText}>{choice}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className={`row-wrap ${styles.pager}`}>
              <button type="button" className="btn" onClick={() => setIndex(index - 1)} disabled={index === 0}>
                {t("test.previous")}
              </button>
              <span className="spacer" />
              {isLast ? (
                <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
                  {t("test.review")}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setIndex(index + 1)}>
                  {t("test.next")}
                </button>
              )}
            </div>
          </section>

          <section className={`panel stack ${styles.side}`} aria-labelledby="navigator-heading">
            <h2 id="navigator-heading" className="small">
              {t("test.navigator")}
            </h2>
            <div className={styles.nav}>
              {answers.map((answer, i) => {
                const state = i === index ? "current" : answer !== null ? "answered" : "";
                return (
                  <button
                    key={i}
                    type="button"
                    className={`${styles.navButton} ${state ? styles[state] : ""}`.trim()}
                    aria-current={i === index ? "step" : undefined}
                    aria-label={`${answer !== null ? t("test.navAnswered", { n: i + 1 }) : t("test.navUnanswered", { n: i + 1 })}${
                      i === index ? `, ${t("test.navCurrent")}` : ""
                    }`}
                    onClick={() => setIndex(i)}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="stack-sm">
              <button type="button" className="btn btn-block" onClick={() => setConfirming(true)}>
                {t("test.handIn")}
              </button>
              <span className="hint" role="status">
                {saveFailed ? t("test.autosaveFailed") : t("test.autosaved")}
              </span>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={confirming} onClose={() => !submitting && setConfirming(false)} title={t("test.confirmTitle")}>
        <p>{t("test.confirmBody", { answered: answeredCount, total })}</p>
        {unanswered.length > 0 ? <Notice kind="warning">{t("test.confirmUnanswered", { list: unanswered.join(", ") })}</Notice> : null}
        <ErrorNotice error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={submitting}>
            {t("test.keepWorking")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
            {submitting ? t("test.submitting") : t("test.confirmSubmit")}
          </button>
        </div>
      </Dialog>
    </main>
  );
}
