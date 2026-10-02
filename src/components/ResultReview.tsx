"use client";

import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import type { ResultQuestion } from "@/lib/types";
import styles from "./ResultReview.module.css";

const LETTERS = "ABCDEFGH";
const MARKS = { correct: "✓", incorrect: "✕", unanswered: "–" } as const;

/**
 * Every question with its choices, what the person answered, the correct answer
 * and whether it was right. Used for the participant's result and the admin's view of an attempt.
 */
export function ResultReview({
  questions,
  admin = false,
  jump = false,
}: {
  questions: ResultQuestion[];
  admin?: boolean;
  /** Show a panel of question numbers beside the list (under it on a narrow screen) that jumps to a question. */
  jump?: boolean;
}) {
  const { t } = useI18n();
  const baseId = useId();
  const [onlyWrong, setOnlyWrong] = useState(false);
  const shown = questions.map((question, index) => ({ question, number: index + 1 })).filter(({ question }) => !onlyWrong || !question.correct);
  const showJump = jump && shown.length > 0;
  const itemId = (number: number) => `${baseId}-q${number}`;

  function jumpTo(number: number) {
    const item = document.getElementById(itemId(number));
    if (!item) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    item.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    // Keyboard and screen-reader focus follows the jump.
    item.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  }

  return (
    <section className={showJump ? styles.withJump : "stack"} aria-labelledby="review-heading">
      <div className={`row-wrap ${styles.top}`}>
        <h2 id="review-heading">{admin ? t("admin.dashboard.answersTitle") : t("result.details")}</h2>
        <span className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={onlyWrong} onChange={(event) => setOnlyWrong(event.target.checked)} />
          <span>{t("result.onlyIncorrect")}</span>
        </label>
      </div>

      {showJump ? (
        <nav className={`card ${styles.jump}`} aria-labelledby={`${baseId}-jump`}>
          <h2 id={`${baseId}-jump`} style={{ fontSize: "1rem" }}>
            {t("result.jump")}
          </h2>
          <div className={styles.jumpGrid}>
            {shown.map(({ question, number }) => {
              const state = question.correct ? "correct" : question.chosenIndex === null ? "unanswered" : "incorrect";
              const label =
                state === "correct"
                  ? t("result.jumpCorrect", { n: number })
                  : state === "incorrect"
                    ? t("result.jumpIncorrect", { n: number })
                    : t("result.jumpUnanswered", { n: number });
              return (
                <button
                  key={number}
                  type="button"
                  className={`${styles.jumpButton} ${styles[state]}`}
                  aria-label={label}
                  onClick={() => jumpTo(number)}
                >
                  {number}
                  <span className={styles.mark} aria-hidden="true">
                    {MARKS[state]}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}

      {shown.length === 0 ? <p className={`notice notice-success ${styles.body}`}>{t("result.nothingWrong")}</p> : null}

      <ol className={`${styles.list} ${styles.body}`}>
        {shown.map(({ question, number }) => (
          <li key={number} id={itemId(number)} className={`${styles.item} ${question.correct ? styles.ok : styles.bad}`}>
            <div className={styles.head}>
              <h3 tabIndex={-1}>{t("result.questionN", { n: number })}</h3>
              {question.correct ? (
                <span className="badge badge-success">{t("result.correct")}</span>
              ) : question.chosenIndex === null ? (
                <span className="badge badge-warning">{t("result.unanswered")}</span>
              ) : (
                <span className="badge badge-danger">{t("result.incorrect")}</span>
              )}
            </div>
            <p className={styles.text}>{question.text}</p>
            <ul className={styles.choices}>
              {question.choices.map((choice, k) => {
                const isRight = k === question.answerIndex;
                const isChosen = k === question.chosenIndex;
                const cls = isRight ? styles.right : isChosen ? styles.wrong : "";
                return (
                  <li key={k} className={`${styles.choice} ${cls}`.trim()}>
                    <span className={styles.letter}>{LETTERS[k] ?? k + 1}</span>
                    <span className={styles.choiceText}>{choice}</span>
                    {isChosen ? (
                      <span className="badge badge-info">{admin ? t("result.theirAnswer") : t("result.yourAnswer")}</span>
                    ) : null}
                    {isRight ? <span className="badge badge-success">{t("result.correctAnswer")}</span> : null}
                  </li>
                );
              })}
            </ul>
            {question.explanation || question.source ? (
              <div className={styles.note}>
                {question.explanation ? (
                  <p>
                    <strong>{t("result.explanation")}: </strong>
                    {question.explanation}
                  </p>
                ) : null}
                {question.source ? <p className="muted">{t("result.source", { source: question.source })}</p> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
