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
        <header className="page-head">
          <div className="page-head-text">
            <h1>{home.member.name}</h1>
            <dl className="meta">
              <dt>{t("home.yourRole")}</dt>
              <dd>{t.dynamic("roles", home.member.role)}</dd>
            </dl>
          </div>
          <button type="button" className="link-button small" onClick={onSwitchUser}>
            {t("home.notYou")}
          </button>
        </header>

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

        <div>
          {nextTest && nextInfo ? (
            <>
              <section className="section">
                <div className="section-head">
                  <h2>{t("home.step1")}</h2>
                  <p>{t("home.materialFor", { test: testName(nextTest.id) })}</p>
                </div>
                {nextInfo.material ? (
                  <PdfViewer
                    src={`/api/participant/materials/${nextTest.id}`}
                    title={t("home.materialFor", { test: testName(nextTest.id) })}
                  />
                ) : (
                  <Notice kind="info">{t("home.noMaterial")}</Notice>
                )}
              </section>

              <section className="section">
                <div className="section-head">
                  <h2>{t("home.step2")}</h2>
                  <p>
                    {testName(nextTest.id)}
                    {" / "}
                    {t("home.testInfo", {
                      count: nextTest.questionsPerTest,
                      required: requiredScore(nextTest.questionsPerTest, nextTest.passRate),
                    })}
                  </p>
                </div>
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
                {!nextInfo.ready ? <Notice kind="warning">{t("home.notReady")}</Notice> : null}
                <ErrorNotice error={error} />
              </section>
            </>
          ) : (
            <section className="section">
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
            <section className="section">
              <h2>{t("home.recent")}</h2>
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {home.recentAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="nowrap">{attempt.submittedAt ? formatDateTime(attempt.submittedAt) : ""}</td>
                        <td>{testName(attempt.testId)}</td>
                        <td className="num">
                          {attempt.score}/{attempt.total}
                        </td>
                        <td>
                          <span className={`badge ${attempt.passed ? "badge-success" : "badge-danger"}`}>
                            {attempt.passed ? t("home.passed") : t("home.failed")}
                          </span>
                        </td>
                        <td className="num">
                          <button type="button" className="link-button" onClick={() => onOpenResult(attempt.id)}>
                            {t("home.viewResult")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
