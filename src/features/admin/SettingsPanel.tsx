"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Loading } from "@/components/Loading";
import { Notice } from "@/components/Notice";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useLoad } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { AdminSettings } from "@/lib/types";

/** Passwords, and a note on where the data lives. */
export function SettingsPanel() {
  const { t } = useI18n();
  const settings = useLoad(() => api.get<AdminSettings>("/api/admin/settings"));

  return (
    <div className="stack-lg">
      <h2>{t("admin.settings.title")}</h2>
      {settings.loading ? <Loading /> : null}
      <ErrorNotice error={settings.error} />
      {settings.data ? (
        <>
          <AdminPassword managedByEnv={settings.data.admin.managedByEnv} />
          <ParticipantPassword settings={settings.data} onChanged={settings.reload} />
        </>
      ) : null}
      <section className="card stack-sm">
        <h3>{t("admin.settings.dataTitle")}</h3>
        <p className="muted">{t("admin.settings.dataBody")}</p>
      </section>
    </div>
  );
}

function AdminPassword({ managedByEnv }: { managedByEnv: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const mismatch = again !== "" && next !== again;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api.post("/api/admin/settings/password", { kind: "admin", currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setAgain("");
      setDone(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t("admin.settings.adminPassword")}</h3>
      {managedByEnv ? (
        <Notice kind="info">{t("admin.settings.managedByEnv")}</Notice>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor={`${id}-current`}>{t("admin.settings.currentPassword")}</label>
            <input id={`${id}-current`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-new`}>{t("admin.settings.newPassword")}</label>
            <input id={`${id}-new`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-again`}>{t("admin.settings.confirmPassword")}</label>
            <input id={`${id}-again`} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} disabled={busy} />
            {mismatch ? <span className="hint" role="alert">{t("admin.settings.mismatch")}</span> : null}
          </div>
          <ErrorNotice error={error} />
          {done ? <Notice kind="success">{t("admin.settings.changed")}</Notice> : null}
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy || current === "" || next === "" || mismatch || again === ""}>
              {t("admin.settings.change")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ParticipantPassword({ settings, onChanged }: { settings: AdminSettings; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { managedByEnv, set } = settings.participant;

  async function change(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setShown(null);
    try {
      const response = await api.post<{ password: string | null }>("/api/admin/settings/password", { kind: "participant", ...body });
      setShown(response.password);
      setOwn("");
      await onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t("admin.settings.participantPassword")}</h3>
      <p className="muted">{t("admin.settings.participantHelp")}</p>

      {managedByEnv ? (
        <Notice kind="info">{t("admin.settings.participantManagedByEnv")}</Notice>
      ) : (
        <>
          <Notice kind={set ? "success" : "warning"}>
            {set ? t("admin.settings.participantSet") : t("admin.settings.participantNotSet")}
          </Notice>

          {shown ? (
            <div className="stack-sm">
              <strong>{t("admin.settings.shownOnce")}</strong>
              <div className="row-wrap">
                <input ref={field} className="mono" type="text" readOnly value={shown} style={{ maxWidth: "18rem" }} onFocus={(e) => e.currentTarget.select()} aria-label={t("admin.settings.shownOnce")} />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    setCopied(await copyText(shown, field.current));
                    window.setTimeout(() => setCopied(false), 2500);
                  }}
                >
                  {copied ? t("common.copied") : t("common.copy")}
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void change({ generate: true })}>
              {t("admin.settings.generate")}
            </button>
          </div>

          <form
            className="stack-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void change({ newPassword: own });
            }}
          >
            <div className="field">
              <label htmlFor={`${id}-own`}>{t("admin.settings.setOwn")}</label>
              <input id={`${id}-own`} type="text" autoComplete="off" value={own} onChange={(e) => setOwn(e.target.value)} disabled={busy} />
            </div>
            <div>
              <button type="submit" className="btn" disabled={busy || own === ""}>
                {t("common.save")}
              </button>
            </div>
          </form>
          <p className="hint">{t("admin.settings.logsOut")}</p>
          <ErrorNotice error={error} />
        </>
      )}
    </section>
  );
}
