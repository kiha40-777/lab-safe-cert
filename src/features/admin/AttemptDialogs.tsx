"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Loading } from "@/components/Loading";
import { ResultReview } from "@/components/ResultReview";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { AttemptResult, AttemptSummary, MemberDto } from "@/lib/types";

/** One attempt in full: score, verdict and every question with the person's answer and the correct one. */
export function AttemptDialog({ attemptId, onClose }: { attemptId: string | null; onClose: () => void }) {
  const { t, formatDateTime } = useI18n();
  return (
    <Dialog open={attemptId !== null} onClose={onClose} title={t("admin.dashboard.attemptTitle")} wide>
      {attemptId ? <AttemptBody attemptId={attemptId} formatDateTime={formatDateTime} /> : null}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
    </Dialog>
  );
}

function AttemptBody({ attemptId, formatDateTime }: { attemptId: string; formatDateTime: (iso: string) => string }) {
  const { t } = useI18n();
  const attempt = useLoad(() => api.get<AttemptResult>(`/api/admin/attempts/${attemptId}`));
  if (attempt.loading) return <Loading />;
  if (attempt.error || !attempt.data) return <ErrorNotice error={attempt.error} />;
  const result = attempt.data;
  return (
    <div className="stack">
      <div className="row-wrap">
        <strong>{t("admin.dashboard.attemptDetail", { name: result.memberName })}</strong>
        <span className={`badge ${result.passed ? "badge-success" : "badge-danger"}`}>
          {result.passed ? t("home.passed") : t("home.failed")}
        </span>
        <span>
          {t.dynamic("tests", `${result.testId}.name`)} · {result.score}/{result.total}
        </span>
        <span className="muted small">{formatDateTime(result.submittedAt)}</span>
      </div>
      <ResultReview questions={result.questions} admin />
    </div>
  );
}

/** A person's attempts, newest first, each openable in full. */
export function MemberAttemptsDialog({ member, onClose }: { member: MemberDto | null; onClose: () => void }) {
  const { t } = useI18n();
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  return (
    <>
      <Dialog
        open={member !== null && openAttempt === null}
        onClose={onClose}
        title={t("admin.dashboard.memberAttempts", { name: member?.name ?? "" })}
      >
        {member ? <MemberAttemptsBody memberId={member.id} onView={setOpenAttempt} /> : null}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </Dialog>
      <AttemptDialog attemptId={openAttempt} onClose={() => setOpenAttempt(null)} />
    </>
  );
}

function MemberAttemptsBody({ memberId, onView }: { memberId: string; onView: (attemptId: string) => void }) {
  const { t, formatDateTime } = useI18n();
  const history = useLoad(() => api.get<{ member: MemberDto; attempts: AttemptSummary[] }>(`/api/admin/members/${memberId}/attempts`));
  if (history.loading) return <Loading />;
  if (history.error || !history.data) return <ErrorNotice error={history.error} />;
  if (history.data.attempts.length === 0) return <p className="muted">{t("admin.dashboard.noAttempts")}</p>;
  return (
    <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {history.data.attempts.map((attempt) => (
        <li key={attempt.id} className="row-wrap">
          <span className={`badge ${attempt.passed ? "badge-success" : "badge-danger"}`}>
            {attempt.passed ? t("home.passed") : t("home.failed")}
          </span>
          <span>
            {t.dynamic("tests", `${attempt.testId}.name`)} · {attempt.score}/{attempt.total}
          </span>
          <span className="muted small">{attempt.submittedAt ? formatDateTime(attempt.submittedAt) : ""}</span>
          <span className="spacer" />
          <button type="button" className="btn btn-sm" onClick={() => onView(attempt.id)}>
            {t("admin.dashboard.viewAttempt")}
          </button>
        </li>
      ))}
    </ul>
  );
}
