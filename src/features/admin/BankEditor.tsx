"use client";

import { useId, useMemo, useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Loading } from "@/components/Loading";
import { Notice } from "@/components/Notice";
import { api, ApiClientError } from "@/lib/api";
import type { TestConfig } from "@/lib/certification";
import { certification } from "@/lib/config";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { BankDto, BankMetaDto, QuestionDto, ValidationResultDto } from "@/lib/types";
import styles from "./BankEditor.module.css";
import { IssueList } from "./IssueList";

const LETTERS = "ABCDEFGH";
const normalize = (text: string) => text.normalize("NFKC").toLowerCase();

export interface DraftInfo {
  generator: string;
  generatedAt: string;
  source: string;
}

/** Questions from an uploaded file that were opened here for review (step 2) and are not saved yet. */
export interface Draft {
  /** Changes with every file that is opened, so the editor starts over with the new questions. */
  serial: number;
  questions: QuestionDto[];
  info: DraftInfo;
}

type Saved = "import" | "edit";

/**
 * Step 3: the questions are reviewed and edited here, either an opened file (`draft`) or the stored
 * bank. They are only saved after a person confirms that every question and answer was checked.
 */
export function BankEditor({
  test,
  draft,
  existingCount,
  onChanged,
  onDraftSaved,
  onDraftDiscarded,
}: {
  test: TestConfig;
  draft: Draft | null;
  /** Number of questions in the stored bank (0 when there is none); a saved draft replaces them. */
  existingCount: number;
  onChanged: () => Promise<void>;
  onDraftSaved: () => void;
  onDraftDiscarded: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const loaded = useLoad(() => api.get<{ bank: BankDto | null }>(`/api/admin/tests/${test.id}/bank`));
  // Kept here (not in the editor) because the editor is rebuilt after every save.
  const [justSaved, setJustSaved] = useState<Saved | null>(null);

  async function afterSave(kind: Saved) {
    await loaded.reload();
    await onChanged();
    setJustSaved(kind);
  }

  return (
    <section className="card stack" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t("admin.bank.currentTitle")}</h2>
      {draft ? (
        <EditorBody
          key={`draft-${draft.serial}`}
          test={test}
          questions={draft.questions}
          info={draft.info}
          meta={null}
          isDraft
          existingCount={existingCount}
          justSaved={null}
          onSaved={async () => {
            await afterSave("import");
            onDraftSaved();
          }}
          onDiscardDraft={() => {
            setJustSaved(null);
            onDraftDiscarded();
          }}
        />
      ) : (
        <>
          {loaded.loading ? <Loading /> : null}
          <ErrorNotice error={loaded.error} />
          {loaded.data ? (
            loaded.data.bank ? (
              <EditorBody
                key={loaded.data.bank.meta?.updatedAt ?? "bank"}
                test={test}
                questions={loaded.data.bank.questions}
                info={{
                  generator: loaded.data.bank.meta?.generator ?? "",
                  generatedAt: loaded.data.bank.meta?.generatedAt ?? "",
                  source: loaded.data.bank.meta?.source ?? "",
                }}
                meta={loaded.data.bank.meta}
                isDraft={false}
                existingCount={existingCount}
                justSaved={justSaved}
                onSaved={() => afterSave("edit")}
                onDiscardDraft={onDraftDiscarded}
              />
            ) : (
              <p className="muted">{t("admin.bank.none")}</p>
            )
          ) : null}
        </>
      )}
    </section>
  );
}

function EditorBody({
  test,
  questions: initialQuestions,
  info: initialInfo,
  meta,
  isDraft,
  existingCount,
  justSaved,
  onSaved,
  onDiscardDraft,
}: {
  test: TestConfig;
  questions: QuestionDto[];
  info: DraftInfo;
  /** Details of the stored bank (null for a draft, which is not stored yet). */
  meta: BankMetaDto | null;
  isDraft: boolean;
  existingCount: number;
  justSaved: Saved | null;
  onSaved: () => Promise<void>;
  onDiscardDraft: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const [questions, setQuestions] = useState<QuestionDto[]>(initialQuestions);
  const [info, setInfo] = useState<DraftInfo>(initialInfo);
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [showAnswers, setShowAnswers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [problems, setProblems] = useState<ValidationResultDto | null>(null);

  const [baseline] = useState(() => JSON.stringify([initialQuestions, initialInfo]));
  const snapshot = useMemo(() => JSON.stringify([questions, info]), [questions, info]);
  const changed = snapshot !== baseline;
  // An opened file is never saved yet, even before the first edit.
  const dirty = isDraft || changed;

  // The confirmation belongs to the questions as they were when it was given: any later edit asks again.
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<string | null>(null);
  const confirmed = confirmedSnapshot === snapshot;

  const update = (index: number, patch: Partial<QuestionDto>) => {
    setQuestions((list) => list.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const updateChoice = (index: number, choiceIndex: number, value: string) =>
    setQuestions((list) =>
      list.map((q, i) => (i === index ? { ...q, choices: q.choices.map((c, k) => (k === choiceIndex ? value : c)) } : q)),
    );

  function addQuestion() {
    setQuestions((list) => [
      ...list,
      {
        id: "",
        text: "",
        choices: Array.from({ length: certification.questionBank.preferredChoices }, () => ""),
        answerIndex: 0,
        explanation: "",
        source: "",
      },
    ]);
    setOpened((set) => new Set(set).add(questions.length));
    setFilter("");
  }

  function removeQuestion(index: number) {
    setQuestions((list) => list.filter((_, i) => i !== index));
    setOpened(new Set());
  }

  async function save() {
    setSaving(true);
    setError(null);
    setProblems(null);
    try {
      await api.put(`/api/admin/tests/${test.id}/bank`, {
        questions,
        meta: { generator: info.generator, generatedAt: info.generatedAt, source: info.source },
        imported: isDraft,
        reviewConfirmed: confirmed,
      });
      await onSaved();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.validation) setProblems(failure.validation);
      setError(failure);
    } finally {
      setSaving(false);
    }
  }

  const q = normalize(filter.trim());
  const visible = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => q === "" || normalize(`${question.text} ${question.choices.join(" ")}`).includes(q));

  return (
    <div className="stack">
      <div className="stack-sm">
        {isDraft ? (
          <Notice kind="warning">
            <p>{t("admin.bank.draftBanner")}</p>
            {existingCount > 0 ? <p>{t("admin.bank.replaceWarning", { count: existingCount })}</p> : null}
          </Notice>
        ) : null}
        <p>
          {meta ? t("admin.bank.info", { count: questions.length, date: formatDateTime(meta.updatedAt) }) : t("admin.bank.draftInfo", { count: questions.length })}
          {meta?.reviewConfirmedAt ? (
            <span className="muted"> · {t("admin.bank.reviewedAt", { date: formatDateTime(meta.reviewConfirmedAt) })}</span>
          ) : null}
        </p>
        {meta?.generator ? <p className="small muted">{t("admin.bank.generatedBy", { generator: meta.generator })}</p> : null}
        {questions.length < test.questionsPerTest ? (
          <Notice kind="warning">{t("admin.bank.notEnough", { required: test.questionsPerTest })}</Notice>
        ) : null}
      </div>

      <details>
        <summary>{t("admin.bank.generatorLabel")}</summary>
        <div className="stack-sm" style={{ marginTop: "0.75rem" }}>
          <div className="field">
            <label htmlFor="info-generator">{t("admin.bank.madeWith")}</label>
            <input
              id="info-generator"
              type="text"
              maxLength={200}
              value={info.generator}
              onChange={(e) => setInfo({ ...info, generator: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="info-date">{t("admin.bank.madeOn")}</label>
            <input
              id="info-date"
              type="text"
              maxLength={200}
              value={info.generatedAt}
              onChange={(e) => setInfo({ ...info, generatedAt: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="info-source">{t("admin.bank.madeFrom")}</label>
            <input
              id="info-source"
              type="text"
              maxLength={200}
              value={info.source}
              onChange={(e) => setInfo({ ...info, source: e.target.value })}
            />
          </div>
        </div>
      </details>

      <div className="row-wrap">
        <div className="field" style={{ flex: "1 1 14rem" }}>
          <label htmlFor="bank-filter">{t("admin.bank.filter")}</label>
          <input id="bank-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <label className="check">
          <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
          <span>{t("admin.bank.showAnswers")}</span>
        </label>
        {isDraft ? null : (
          <a className="btn btn-sm" href={`/api/admin/tests/${test.id}/bank/export`} download>
            {t("admin.bank.export")}
          </a>
        )}
      </div>

      {visible.length === 0 ? <p className="muted">{t("admin.bank.noMatch")}</p> : null}

      <div className={styles.list}>
        {visible.map(({ question, index }) => (
          <details
            key={index}
            className={styles.item}
            open={opened.has(index)}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setOpened((set) => {
                const next = new Set(set);
                if (isOpen) next.add(index);
                else next.delete(index);
                return next;
              });
            }}
          >
            <summary className={styles.summary}>
              <span className={styles.number}>{t("admin.bank.questionNumber", { n: index + 1 })}</span>
              <span className={styles.excerpt}>{question.text || "…"}</span>
              {showAnswers ? (
                <span className={styles.correct} title={t("admin.bank.correctMark")}>
                  ✓ {LETTERS[question.answerIndex] ?? "?"}
                </span>
              ) : null}
            </summary>

            <div className={styles.body}>
              <div className="field">
                <label htmlFor={`q${index}-text`}>{t("admin.bank.questionText")}</label>
                <textarea
                  id={`q${index}-text`}
                  rows={3}
                  value={question.text}
                  onChange={(e) => update(index, { text: e.target.value })}
                />
              </div>

              <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label" style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
                  {t("admin.bank.correctChoice")}
                </legend>
                <div className="stack-sm">
                  {question.choices.map((choice, k) => (
                    <div key={k} className={styles.choiceRow}>
                      <input
                        type="radio"
                        name={`correct-${index}`}
                        checked={question.answerIndex === k}
                        onChange={() => update(index, { answerIndex: k })}
                        aria-label={`${t("admin.bank.correctChoice")}: ${LETTERS[k] ?? k + 1}`}
                      />
                      <span className={styles.letter} aria-hidden="true">
                        {LETTERS[k] ?? k + 1}
                      </span>
                      <input
                        type="text"
                        value={choice}
                        aria-label={t("admin.bank.choice", { letter: LETTERS[k] ?? String(k + 1) })}
                        onChange={(e) => updateChoice(index, k, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              <div className="field">
                <label htmlFor={`q${index}-explanation`}>{t("admin.bank.explanation")}</label>
                <textarea
                  id={`q${index}-explanation`}
                  rows={2}
                  value={question.explanation}
                  onChange={(e) => update(index, { explanation: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`q${index}-source`}>{t("admin.bank.source")}</label>
                <input
                  id={`q${index}-source`}
                  type="text"
                  value={question.source}
                  onChange={(e) => update(index, { source: e.target.value })}
                />
              </div>

              <div>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => removeQuestion(index)}>
                  {t("admin.bank.deleteQuestion")}
                </button>
              </div>
            </div>
          </details>
        ))}
      </div>

      {problems ? (
        <div className="stack-sm">
          <strong>{t("admin.bank.problemsOnSave")}</strong>
          <IssueList errors={problems.errors} warnings={problems.warnings} infos={[]} />
        </div>
      ) : (
        <ErrorNotice error={error} />
      )}
      {justSaved && !dirty ? (
        <Notice kind="success">{t(justSaved === "import" ? "admin.bank.imported" : "admin.bank.changesSaved")}</Notice>
      ) : null}

      <div className={styles.stickyBar}>
        {dirty ? (
          <label className={`check ${styles.confirm}`}>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={saving}
              onChange={(e) => setConfirmedSnapshot(e.target.checked ? snapshot : null)}
            />
            <span>{t("admin.bank.reviewConfirm")}</span>
          </label>
        ) : null}
        <button type="button" className="btn" onClick={addQuestion}>
          {t("admin.bank.addQuestion")}
        </button>
        <span className="spacer" />
        {changed ? <span className="small muted">{t("admin.bank.unsaved")}</span> : null}
        <button
          type="button"
          className="btn"
          disabled={!dirty || saving}
          onClick={() => {
            if (isDraft) {
              onDiscardDraft();
              return;
            }
            setQuestions(initialQuestions);
            setInfo(initialInfo);
            setProblems(null);
            setError(null);
            setOpened(new Set());
          }}
        >
          {isDraft ? t("admin.bank.discardDraft") : t("admin.bank.discard")}
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || !confirmed || saving} onClick={() => void save()}>
          {saving ? t("common.saving") : isDraft ? t("admin.bank.saveImport") : t("admin.bank.saveChanges")}
        </button>
      </div>
    </div>
  );
}
