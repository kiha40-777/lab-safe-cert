"use client";

import { type FormEvent, useId, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import type { Scope } from "@/lib/types";
import { ErrorNotice } from "./ErrorNotice";
import { Notice } from "./Notice";

/** Password form for the test screen ("participant") and the admin screen ("admin"). */
export function LoginForm({
  scope,
  passwordSet = true,
  onLoggedIn,
}: {
  scope: Scope;
  /** False when nobody can log in yet because the participant password has not been set. */
  passwordSet?: boolean;
  onLoggedIn: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const admin = scope === "admin";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { scope, password });
      setPassword("");
      onLoggedIn();
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <main id="main" className="container">
      <form className="card card-narrow stack" onSubmit={submit}>
        <h1>{admin ? t("admin.login.title") : t("login.title")}</h1>
        <p className="muted">{admin ? t("admin.login.description") : t("login.description")}</p>
        {!passwordSet ? <Notice kind="warning">{t("login.notSet")}</Notice> : null}
        <div className="field">
          <label htmlFor={`${id}-password`}>{admin ? t("admin.login.password") : t("login.password")}</label>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy || !passwordSet}
          />
        </div>
        <ErrorNotice error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy || !passwordSet || password === ""}>
          {admin ? t("admin.login.submit") : t("login.submit")}
        </button>
        {admin ? <p className="hint">{t("admin.login.hint")}</p> : null}
        <a href={admin ? "/" : "/admin"} className="small">
          {admin ? t("admin.login.participantLink") : t("login.adminLink")}
        </a>
      </form>
    </main>
  );
}
