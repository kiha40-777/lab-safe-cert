"use client";

import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PdfViewer } from "@/components/PdfViewer";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { MaterialInfo } from "@/lib/types";

/** Upload, preview, replace and remove the study PDF of a test. */
export function MaterialSection({
  testId,
  material,
  onChanged,
}: {
  testId: string;
  material: MaterialInfo | null;
  onChanged: () => Promise<void>;
}) {
  const { t, formatDateTime } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const src = `/api/admin/tests/${testId}/material`;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      await api.uploadPdf(src, file);
      await onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(src);
      setConfirmDelete(false);
      setPreview(false);
      await onChanged();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t("admin.material.title")}</h2>
      <p className="muted">{t("admin.material.help")}</p>

      {material ? (
        <p>
          <strong>{t("admin.material.uploaded", { filename: material.filename, size: formatBytes(material.size) })}</strong>{" "}
          <span className="muted small">{formatDateTime(material.uploadedAt)}</span>
        </p>
      ) : (
        <p className="muted">{t("admin.material.none")}</p>
      )}

      <div className="field">
        <label htmlFor={`${id}-file`}>{material ? t("admin.material.replace") : t("admin.material.upload")}</label>
        <input
          id={`${id}-file`}
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {busy ? <span className="hint">{t("admin.material.uploading")}</span> : null}
      </div>

      <ErrorNotice error={error} />

      {material ? (
        <div className="row-wrap">
          <button type="button" className="btn btn-sm" onClick={() => setPreview((shown) => !shown)} aria-expanded={preview}>
            {t("admin.material.preview")}
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            {t("common.delete")}
          </button>
        </div>
      ) : null}
      {material && preview ? <PdfViewer src={src} title={t("admin.material.preview")} /> : null}

      <ConfirmDialog
        open={confirmDelete}
        title={t("common.delete")}
        message={<p>{t("admin.material.deleteConfirm")}</p>}
        confirmLabel={t("common.delete")}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
