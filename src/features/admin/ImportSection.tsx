"use client";

import { useId, useRef, useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Notice } from "@/components/Notice";
import { api, ApiClientError } from "@/lib/api";
import type { TestConfig } from "@/lib/certification";
import { useI18n } from "@/lib/i18n/context";
import type { ValidationResultDto } from "@/lib/types";
import { IssueList } from "./IssueList";

/** Upload or paste the question JSON, see what is wrong with it, and only then save it. */
export function ImportSection({
  test,
  existingCount,
  onSaved,
}: {
  test: TestConfig;
  /** Number of questions in the bank that a save would replace (0 when there is none). */
  existingCount: number;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationResultDto | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const base = `/api/admin/tests/${test.id}/bank`;

  async function check(source: string) {
    setBusy("check");
    setError(null);
    setSaved(false);
    setConfirmed(false);
    try {
      setResult(await api.post<ValidationResultDto>(`${base}/validate`, { text: source }));
    } catch (failure) {
      setResult(null);
      setError(failure);
    } finally {
      setBusy(null);
    }
  }

  async function readFile(file: File) {
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    await check(content);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await api.put(base, { text, reviewConfirmed: confirmed });
      setSaved(true);
      setResult(null);
      setText("");
      setFileName(null);
      setConfirmed(false);
      await onSaved();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.validation) setResult(failure.validation);
      setError(failure);
    } finally {
      setBusy(null);
    }
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
          disabled={busy !== null}
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
            setSaved(false);
          }}
          disabled={busy !== null}
        />
      </div>

      <div>
        <button type="button" className="btn" disabled={busy !== null || text.trim() === ""} onClick={() => void check(text)}>
          {busy === "check" ? t("admin.bank.checking") : t("admin.bank.check")}
        </button>
      </div>

      <ErrorNotice error={error} />
      {saved ? <Notice kind="success">{t("admin.bank.imported")}</Notice> : null}

      {result ? (
        <div className="stack">
          {result.ok ? (
            <Notice kind="success">
              <strong>{t("admin.bank.resultOk", { count: result.summary?.questionCount ?? 0 })}</strong>
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

              {existingCount > 0 ? <Notice kind="warning">{t("admin.bank.replaceWarning", { count: existingCount })}</Notice> : null}

              <label className="check">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>{t("admin.bank.reviewConfirm")}</span>
              </label>
              <div>
                <button type="button" className="btn btn-primary" disabled={!confirmed || busy !== null} onClick={() => void save()}>
                  {busy === "save" ? t("common.saving") : t("admin.bank.saveImport")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
