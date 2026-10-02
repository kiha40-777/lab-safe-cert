"use client";

import { type FormEvent, useId, useMemo, useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Loading } from "@/components/Loading";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { MemberDto } from "@/lib/types";

const OTHER = "__other__";

/** "Who are you?": pick your name from the list, or choose "Other" and type it. */
export function IdentifyView({ onIdentified }: { onIdentified: () => void }) {
  const { t, compareNames } = useI18n();
  const id = useId();
  const roster = useLoad(() => api.get<{ members: MemberDto[] }>("/api/participant/members"));
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const members = useMemo(
    () => [...(roster.data?.members ?? [])].sort((a, b) => compareNames(a.name, b.name)),
    [roster.data, compareNames],
  );
  const other = choice === OTHER;
  const canSubmit = choice !== "" && (!other || newName.trim() !== "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/participant/identify", other ? { newName } : { memberId: choice });
      onIdentified();
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <main id="main" className="container">
      <form className="card card-narrow stack" onSubmit={submit}>
        <h1>{t("identify.title")}</h1>
        <p className="muted">{t("identify.description")}</p>

        {roster.loading ? <Loading /> : null}
        <ErrorNotice error={roster.error} />

        {roster.data ? (
          <>
            <div className="field">
              <label htmlFor={`${id}-select`}>{t("identify.select")}</label>
              <select id={`${id}-select`} value={choice} onChange={(event) => setChoice(event.target.value)} disabled={busy}>
                <option value="">{t("identify.placeholder")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
                <option value={OTHER}>{t("identify.other")}</option>
              </select>
            </div>

            {other ? (
              <div className="field">
                <label htmlFor={`${id}-name`}>{t("identify.newName")}</label>
                <input
                  id={`${id}-name`}
                  type="text"
                  maxLength={80}
                  autoComplete="name"
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  disabled={busy}
                />
                <span className="hint">{t("identify.newNameHint")}</span>
              </div>
            ) : null}

            <ErrorNotice error={error} />
            <button type="submit" className="btn btn-primary" disabled={busy || !canSubmit}>
              {t("identify.submit")}
            </button>
          </>
        ) : null}
      </form>
    </main>
  );
}
