"use client";

import { useId, useRef, useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Notice } from "@/components/Notice";
import { api } from "@/lib/api";
import type { TestConfig } from "@/lib/certification";
import { useI18n } from "@/lib/i18n/context";
import type { QuestionDto, ValidationResultDto } from "@/lib/types";
import type { DraftInfo } from "./BankEditor";
import { IssueList } from "./IssueList";

/**
 * Upload or paste the question JSON and see what is wrong with it. Nothing is saved here:
 * a file without errors is opened in step 3 (the editor), where it is reviewed, edited and saved.
 */
export function ImportSection({
  test,
  hasDraft,
  onOpen,
}: {
  test: TestConfig;
  /** Whether questions that were opened earlier are still waiting in step 3 (they would be replaced). */
  hasDraft: boolean;
  onOpen: (questions: QuestionDto[], info: DraftInfo) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const base = `/api/admin/tests/${test.id}/bank`;

  async function check(source: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post<ValidationResultDto>(`${base}/validate`, { text: source }));
    } catch (failure) {
      setResult(null);
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file: File) {
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    await check(content);
    if (fileInput.current) fileInput.current.value = "";
  }

  function open() {
    if (!result?.ok || !result.preview) return;
    onOpen(result.preview, {
      generator: result.meta?.generator ?? "",
      generatedAt: result.meta?.generatedAt ?? "",
      source: result.meta?.source ?? "",
    });
  }

  const distribution = result?.summary
    ? Object.entries(result.summary.answerDistribution)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([letter, count]) => `${letter}: ${count}`)
        .join(" · ")
    : "";

  return (
    <section className="card stack" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t("admin.bank.importTitle")}</h2>
      <p className="muted">{t("admin.bank.importHelp")}</p>

      <div className="field">
        <label htmlFor={`${id}-file`}>{t("admin.bank.chooseFile")}</label>
        <input
          id={`${id}-file`}
          ref={fileInput}
          type="file"
          accept=".json,application/json,text/plain"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
        {fileName ? <span className="hint">{t("admin.bank.fileRead", { name: fileName })}</span> : null}
      </div>

      <div className="field">
        <label htmlFor={`${id}-text`}>{t("admin.bank.pasteLabel")}</label>
        <textarea
          id={`${id}-text`}
          className="mono"
          rows={6}
          spellCheck={false}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult(null);
          }}
          disabled={busy}
        />
      </div>

      <div>
        <button type="button" className="btn" disabled={busy || text.trim() === ""} onClick={() => void check(text)}>
          {busy ? t("admin.bank.checking") : t("admin.bank.check")}
        </button>
      </div>

      <ErrorNotice error={error} />

      {result ? (
        <div className="stack">
          {result.ok ? (
            <Notice kind="success">
              <strong>
                {(result.summary?.caseStudyCount ?? 0) > 0
                  ? t("admin.bank.resultOkCaseStudy", {
                      count: result.summary?.questionCount ?? 0,
                      caseStudy: result.summary?.caseStudyCount ?? 0,
                    })
                  : t("admin.bank.resultOk", { count: result.summary?.questionCount ?? 0 })}
              </strong>
              {distribution ? (
                <p className="small">
                  {t("admin.bank.answersSpread")}: {distribution}
                </p>
              ) : null}
            </Notice>
          ) : null}
          <IssueList errors={result.errors} warnings={result.warnings} infos={result.infos} />

          {result.ok ? (
            <div className="stack">
              {result.meta && (result.meta.generator || result.meta.generatedAt || result.meta.source) ? (
                <dl className="small" style={{ margin: 0 }}>
                  {result.meta.generator ? (
                    <div>
                      <dt style={{ display: "inline", fontWeight: 700 }}>{t("admin.bank.madeWith")}: </dt>
                      <dd style={{ display: "inline", margin: 0 }}>{result.meta.generator}</dd>
                    </div>
                  ) : null}
                  {result.meta.generatedAt ? (
                    <div>
                      <dt style={{ display: "inline", fontWeight: 700 }}>{t("admin.bank.madeOn")}: </dt>
                      <dd style={{ display: "inline", margin: 0 }}>{result.meta.generatedAt}</dd>
                    </div>
                  ) : null}
                  {result.meta.source ? (
                    <div>
                      <dt style={{ display: "inline", fontWeight: 700 }}>{t("admin.bank.madeFrom")}: </dt>
                      <dd style={{ display: "inline", margin: 0 }}>{result.meta.source}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {hasDraft ? <Notice kind="warning">{t("admin.bank.draftExists")}</Notice> : null}
              <div>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={open}>
                  {t("admin.bank.openInEditor")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
