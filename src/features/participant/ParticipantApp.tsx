"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Loading } from "@/components/Loading";
import { LoginForm } from "@/components/LoginForm";
import { api } from "@/lib/api";
import { useLoad, useUnauthorized } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { AttemptDetail, AttemptResult, AttemptView, AuthStatus, ParticipantHome } from "@/lib/types";
import { HomeView } from "./HomeView";
import { IdentifyView } from "./IdentifyView";
import { ResultView } from "./ResultView";
import { TestView } from "./TestView";

type View = { name: "home" } | { name: "test"; attempt: AttemptView } | { name: "result"; result: AttemptResult };

/** The test screen: password -> choose your name -> study material -> test -> result. */
export function ParticipantApp() {
  const { t } = useI18n();
  const status = useLoad(() => api.get<AuthStatus>("/api/auth/status"));
  useUnauthorized(() => void status.reload());

  async function logout() {
    await api.post("/api/auth/logout", { scope: "participant" });
    await status.reload();
  }

  const s = status.data;
  let body;
  if (!s) {
    body = (
      <main id="main" className="container">
        {status.error ? (
          <div className="stack">
            <ErrorNotice error={status.error} />
            <button type="button" className="btn" onClick={() => void status.reload()}>
              {t("common.retry")}
            </button>
          </div>
        ) : (
          <Loading />
        )}
      </main>
    );
  } else if (!s.participant) {
    body = <LoginForm scope="participant" passwordSet={s.participantPasswordSet} onLoggedIn={() => void status.reload()} />;
  } else if (!s.member) {
    body = <IdentifyView onIdentified={() => void status.reload()} />;
  } else {
    body = <MemberArea key={s.member.id} onSwitchUser={async () => {
      await api.post("/api/participant/identify", { clear: true });
      await status.reload();
    }} />;
  }

  return (
    <>
      <AppHeader>
        {s?.participant ? (
          <>
            {s.member ? <span className="topbar-user">{s.member.name}</span> : null}
            <button type="button" className="btn btn-sm" onClick={() => void logout()}>
              {t("common.logout")}
            </button>
          </>
        ) : null}
      </AppHeader>
      {body}
    </>
  );
}

/** Everything after the person has chosen their name. */
function MemberArea({ onSwitchUser }: { onSwitchUser: () => void }) {
  const { t } = useI18n();
  const home = useLoad(() => api.get<ParticipantHome>("/api/participant/home"));
  const [view, setView] = useState<View>({ name: "home" });
  const [error, setError] = useState<unknown>(null);

  // Every new screen (start, test, result) starts at the top of the page.
  const screen = view.name === "test" ? `test-${view.attempt.id}` : view.name === "result" ? `result-${view.result.id}` : "home";
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  function backHome() {
    setView({ name: "home" });
    void home.reload();
  }

  async function openResult(attemptId: string) {
    setError(null);
    try {
      const detail = await api.get<AttemptDetail>(`/api/participant/attempts/${attemptId}`);
      if (detail.status === "submitted") setView({ name: "result", result: detail });
      else setView({ name: "test", attempt: detail });
    } catch (failure) {
      setError(failure);
    }
  }

  async function retry(testId: string) {
    setError(null);
    try {
      setView({ name: "test", attempt: await api.post<AttemptView>("/api/participant/attempts", { testId }) });
    } catch (failure) {
      setError(failure);
      backHome();
    }
  }

  if (view.name === "test") {
    return <TestView key={view.attempt.id} attempt={view.attempt} onSubmitted={(result) => setView({ name: "result", result })} onLeave={backHome} />;
  }
  if (view.name === "result") {
    const info = home.data?.tests.find((x) => x.testId === view.result.testId);
    return (
      <ResultView
        result={view.result}
        hasMaterial={Boolean(info?.material)}
        onRetry={() => void retry(view.result.testId)}
        onBack={backHome}
      />
    );
  }

  if (!home.data) {
    return (
      <main id="main" className="container">
        {home.error ? (
          <div className="stack">
            <ErrorNotice error={home.error} />
            <button type="button" className="btn" onClick={() => void home.reload()}>
              {t("common.retry")}
            </button>
          </div>
        ) : (
          <Loading />
        )}
      </main>
    );
  }

  return (
    <>
      {error ? (
        <div className="container" style={{ paddingBottom: 0 }}>
          <ErrorNotice error={error} />
        </div>
      ) : null}
      <HomeView
        home={home.data}
        onAttemptStarted={(attempt) => setView({ name: "test", attempt })}
        onOpenResult={(id) => void openResult(id)}
        onSwitchUser={onSwitchUser}
      />
    </>
  );
}
