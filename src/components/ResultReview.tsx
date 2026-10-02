"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import type { ResultQuestion } from "@/lib/types";
import styles from "./ResultReview.module.css";

const LETTERS = "ABCDEFGH";

/**
 * Every question with its choices, what the person answered, the correct answer
 * and whether it was right. Used for the participant's result and the admin's view of an attempt.
 */
export function ResultReview({ questions, admin = false }: { questions: ResultQuestion[]; admin?: boolean }) {
  const { t } = useI18n();
  const [onlyWrong, setOnlyWrong] = useState(false);
  const shown = questions.map((question, index) => ({ question, number: index + 1 })).filter(({ question }) => !onlyWrong || !question.correct);

  return (
    <section className="stack" aria-labelledby="review-heading">
      <div className="row-wrap">
        <h2 id="review-heading">{admin ? t("admin.dashboard.answersTitle") : t("result.details")}</h2>
        <span className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={onlyWrong} onChange={(event) => setOnlyWrong(event.target.checked)} />
          <span>{t("result.onlyIncorrect")}</span>
        </label>
      </div>

      {shown.length === 0 ? <p className="notice notice-success">{t("result.nothingWrong")}</p> : null}

      <ol className={styles.list}>
        {shown.map(({ question, number }) => (
          <li key={number} className={`${styles.item} ${question.correct ? styles.ok : styles.bad}`}>
            <div className={styles.head}>
              <h3>{t("result.questionN", { n: number })}</h3>
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
