"use client";

import { type FormEvent, useId, useMemo, useState } from "react";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Notice } from "@/components/Notice";
import { api } from "@/lib/api";
import { certification } from "@/lib/config";
import { useI18n } from "@/lib/i18n/context";
import type { MemberDto, MemberOverview } from "@/lib/types";

interface BulkResponse {
  created: MemberDto[];
  skipped: { name: string; reason: "exists" | "duplicate" | "invalid" }[];
}

/** Registering people and correcting their names and roles. */
export function MembersPanel({
  members,
  reload,
  reviewOnly,
  goto,
}: {
  members: MemberOverview[];
  reload: () => Promise<void>;
  /** Start with only the people who typed their own name. */
  reviewOnly: boolean;
  goto: (hash: string) => void;
}) {
  const { t, compareNames } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemberOverview | null>(null);
  const [deleting, setDeleting] = useState<MemberOverview | null>(null);

  const shown = useMemo(() => {
    const list = reviewOnly ? members.filter((m) => m.selfRegistered) : members;
    return [...list].sort((a, b) => compareNames(a.name, b.name));
  }, [members, reviewOnly, compareNames]);

  async function change(member: MemberOverview, patch: { name?: string; role?: string }) {
    setBusyId(member.id);
    setError(null);
    try {
      await api.patch(`/api/admin/members/${member.id}`, patch);
      await reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member: MemberOverview) {
    setBusyId(member.id);
    setError(null);
    try {
      await api.delete(`/api/admin/members/${member.id}`);
      setDeleting(null);
      await reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack-lg">
      <div className="grid-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <AddMemberForm onAdded={reload} />
        <BulkAddForm onAdded={reload} />
      </div>

      <section className="stack">
        <div className="row-wrap">
          <h2>{t("admin.members.title")}</h2>
          <span className="spacer" />
          {reviewOnly ? (
            <button type="button" className="btn btn-sm" onClick={() => goto("members")}>
              {t("common.all")}
            </button>
          ) : null}
        </div>
        <p className="hint">{t("admin.members.roleHelp")}</p>
        <ErrorNotice error={error} />

        {shown.length === 0 ? (
          <Notice kind="info">{t("admin.members.empty")}</Notice>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("common.role")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((member) => (
                  <tr key={member.id}>
                    <td>
                      {member.name}
                      {member.selfRegistered ? (
                        <div className="row-wrap" style={{ marginTop: "0.25rem" }}>
                          <span className="badge badge-warning">{t("admin.members.selfRegistered")}</span>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busyId === member.id}
                            onClick={() => void change(member, { role: member.role })}
                          >
                            {t("admin.members.markChecked")}
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <select
                        aria-label={t("admin.members.changeRole", { name: member.name })}
                        value={member.role}
                        disabled={busyId === member.id}
                        onChange={(event) => void change(member, { role: event.target.value })}
                        style={{ width: "auto" }}
                      >
                        {certification.roles.map((role) => (
                          <option key={role} value={role}>
                            {t.dynamic("roles", role)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row-wrap">
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(member)}>
                          {t("common.edit")}
                        </button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleting(member)}>
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EditMemberDialog
        member={editing}
        onClose={() => setEditing(null)}
        onSave={async (patch) => {
          if (!editing) return;
          await api.patch(`/api/admin/members/${editing.id}`, patch);
          setEditing(null);
          await reload();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t("common.delete")}
        message={<p>{t("admin.members.deleteConfirm", { name: deleting?.name ?? "" })}</p>}
        confirmLabel={t("common.delete")}
        danger
        busy={busyId !== null}
        onConfirm={() => deleting && void remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function AddMemberForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const { t } = useI18n();
  const id = useId();
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>(certification.defaultRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/members", { name, role });
      setName("");
      await onAdded();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{t("admin.members.addTitle")}</h2>
      <div className="field">
        <label htmlFor={`${id}-name`}>{t("admin.members.name")}</label>
        <input id={`${id}-name`} type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-role`}>{t("admin.members.role")}</label>
        <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
          {certification.roles.map((r) => (
            <option key={r} value={r}>
              {t.dynamic("roles", r)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice error={error} />
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ""}>
          {t("admin.members.addButton")}
        </button>
      </div>
    </form>
  );
}

function BulkAddForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState("");
  const [role, setRole] = useState<string>(certification.defaultRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<BulkResponse | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await api.post<BulkResponse>("/api/admin/members/bulk", { names: text.split(/\r?\n/), role });
      setResult(response);
      setText(response.skipped.map((s) => s.name).join("\n"));
      await onAdded();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{t("admin.members.bulkTitle")}</h2>
      <p className="hint">{t("admin.members.bulkHelp")}</p>
      <div className="field">
        <label htmlFor={`${id}-names`} className="visually-hidden">
          {t("admin.members.bulkTitle")}
        </label>
        <textarea id={`${id}-names`} rows={5} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-role`}>{t("admin.members.role")}</label>
        <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
          {certification.roles.map((r) => (
            <option key={r} value={r}>
              {t.dynamic("roles", r)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice error={error} />
      {result ? (
        <Notice kind={result.skipped.length > 0 ? "warning" : "success"}>
          {t("admin.members.bulkResult", { created: result.created.length, skipped: result.skipped.length })}
          {result.skipped.length > 0 ? (
            <ul>
              {result.skipped.map((s, i) => (
                <li key={i}>
                  {s.name} — {t(`admin.members.skipReason.${s.reason}`)}
                </li>
              ))}
            </ul>
          ) : null}
        </Notice>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ""}>
          {t("admin.members.bulkButton")}
        </button>
      </div>
    </form>
  );
}

function EditMemberDialog({
  member,
  onClose,
  onSave,
}: {
  member: MemberOverview | null;
  onClose: () => void;
  onSave: (patch: { name: string; role: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={member !== null} onClose={onClose} title={t("admin.members.editTitle")}>
      {member ? <EditMemberForm key={member.id} member={member} onClose={onClose} onSave={onSave} /> : null}
    </Dialog>
  );
}

function EditMemberForm({
  member,
  onClose,
  onSave,
}: {
  member: MemberOverview;
  onClose: () => void;
  onSave: (patch: { name: string; role: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const id = useId();
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({ name, role });
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor={`${id}-name`}>{t("admin.members.name")}</label>
        <input id={`${id}-name`} type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-role`}>{t("admin.members.role")}</label>
        <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
          {certification.roles.map((r) => (
            <option key={r} value={r}>
              {t.dynamic("roles", r)}
            </option>
          ))}
        </select>
      </div>
      {member.selfRegistered ? <p className="hint">{t("admin.members.selfRegisteredHelp")}</p> : null}
      <ErrorNotice error={error} />
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ""}>
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
