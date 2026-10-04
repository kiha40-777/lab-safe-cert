"use client";

import { useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Notice } from "@/components/Notice";
import { PdfViewer } from "@/components/PdfViewer";
import { api } from "@/lib/api";
import { findTest, requiredScore } from "@/lib/certification";
import { certification } from "@/lib/config";
import { useI18n } from "@/lib/i18n/context";
import type { AttemptView, ParticipantHome } from "@/lib/types";

/** The person's start screen: study material first, then the test they can take, then recent results. */
export function HomeView({
  home,
  onAttemptStarted,
  onOpenResult,
  onSwitchUser,
}: {
  home: ParticipantHome;
  onAttemptStarted: (attempt: AttemptView) => void;
  onOpenResult: (attemptId: string) => void;
  onSwitchUser: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const nextTest = home.nextTestId ? findTest(certification, home.nextTestId) : undefined;
  const nextInfo = nextTest ? home.tests.find((x) => x.testId === nextTest.id) : undefined;
  const testName = (testId: string) => t.dynamic("tests", `${testId}.name`);

  async function start(testId: string) {
    setStarting(true);
    setError(null);
    try {
      onAttemptStarted(await api.post<AttemptView>("/api/participant/attempts", { testId }));
    } catch (failure) {
      setError(failure);
      setStarting(false);
    }
  }

  return (
    <main id="main" className="container">
      <div className="stack-lg">
        <section className="card stack-sm">
          <div className="row-wrap">
            <h1>{t("home.greeting", { name: home.member.name })}</h1>
            <span className="spacer" />
            <button type="button" className="link-button small" onClick={onSwitchUser}>
              {t("home.notYou")}
            </button>
          </div>
          <p>
            <span className="muted">{t("home.yourRole")}: </span>
            <span className="badge badge-info">{t.dynamic("roles", home.member.role)}</span>
          </p>
        </section>

        {home.activeAttempt ? (
          <Notice kind="info">
            <div className="row-wrap">
              <span>{t("home.resumeNotice")}</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={starting}
                onClick={() => home.activeAttempt && void start(home.activeAttempt.testId)}
              >
                {t("home.resume")}
              </button>
            </div>
          </Notice>
        ) : null}

        {nextTest && nextInfo ? (
          <>
            <section className="card stack">
              <h2>{t("home.step1")}</h2>
              <p className="muted">{t("home.materialFor", { test: testName(nextTest.id) })}</p>
              {nextInfo.material ? (
                <PdfViewer
                  src={`/api/participant/materials/${nextTest.id}`}
                  title={t("home.materialFor", { test: testName(nextTest.id) })}
                />
              ) : (
                <Notice kind="info">{t("home.noMaterial")}</Notice>
              )}
            </section>

            <section className="card stack">
              <h2>{t("home.step2")}</h2>
              <h3>{testName(nextTest.id)}</h3>
              <p>
                {nextInfo.caseStudyCount > 0
                  ? t("home.testInfoCaseStudy", {
                      count: nextInfo.questionCount,
                      standard: nextInfo.questionCount - nextInfo.caseStudyCount,
                      caseStudy: nextInfo.caseStudyCount,
                      required: requiredScore(nextInfo.questionCount, nextTest.passRate),
                    })
                  : t("home.testInfo", {
                      count: nextInfo.questionCount,
                      required: requiredScore(nextInfo.questionCount, nextTest.passRate),
                    })}
              </p>
              {!nextInfo.ready ? <Notice kind="warning">{t("home.notReady")}</Notice> : null}
              <ErrorNotice error={error} />
              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={starting || !nextInfo.ready}
                  onClick={() => void start(nextTest.id)}
                >
                  {starting ? t("home.starting") : t("home.start")}
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="card stack">
            <Notice kind="success">
              <strong>{t("home.allDoneTitle")}</strong>
              <p>{t("home.allDoneBody")}</p>
            </Notice>
            {home.tests
              .filter((info) => info.material)
              .map((info) => (
                <details key={info.testId}>
                  <summary>{t("home.materialFor", { test: testName(info.testId) })}</summary>
                  <div style={{ marginTop: "0.75rem" }}>
                    <PdfViewer
                      src={`/api/participant/materials/${info.testId}`}
                      title={t("home.materialFor", { test: testName(info.testId) })}
                    />
                  </div>
                </details>
              ))}
          </section>
        )}

        {home.recentAttempts.length > 0 ? (
          <section className="card stack-sm">
            <h2>{t("home.recent")}</h2>
            <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {home.recentAttempts.map((attempt) => (
                <li key={attempt.id} className="row-wrap">
                  <span className={`badge ${attempt.passed ? "badge-success" : "badge-danger"}`}>
                    {attempt.passed ? t("home.passed") : t("home.failed")}
                  </span>
                  <span>
                    {testName(attempt.testId)} · {attempt.score}/{attempt.total}
                  </span>
                  <span className="muted small">{attempt.submittedAt ? formatDateTime(attempt.submittedAt) : ""}</span>
                  <span className="spacer" />
                  <button type="button" className="btn btn-sm" onClick={() => onOpenResult(attempt.id)}>
                    {t("home.viewResult")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
