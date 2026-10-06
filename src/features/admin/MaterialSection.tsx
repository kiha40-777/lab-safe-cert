"use client";

import { useId, useState } from "react";
import { PdfFileIcon, TrashIcon } from "@/components/ButtonIcons";
import { ConfirmDialog } from "@/components/Dialog";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FilePicker } from "@/components/FilePicker";
import { PdfViewer } from "@/components/PdfViewer";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import type { MaterialInfo } from "@/lib/types";
import styles from "./MaterialSection.module.css";

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
    <section className="section section-split" aria-labelledby={`${id}-title`}>
      <div className="section-intro">
        <h2 id={`${id}-title`}>{t("admin.material.title")}</h2>
        <p>{t("admin.material.help")}</p>
      </div>
      <div className="stack">
        {material ? (
          <p className="muted">
            {t("admin.material.uploaded", { filename: material.filename, size: formatBytes(material.size) })}{" "}
            <span className="small">{formatDateTime(material.uploadedAt)}</span>
          </p>
        ) : (
          <p className="muted">{t("admin.material.none")}</p>
        )}

        <div className={`stack ${styles.group}`}>
          <div className="field">
            <label htmlFor={`${id}-file`}>{material ? t("admin.material.replace") : t("admin.material.upload")}</label>
            <FilePicker
              id={`${id}-file`}
              accept="application/pdf,.pdf"
              icon={<PdfFileIcon />}
              wide
              disabled={busy}
              onFile={(file) => void upload(file)}
            />
          </div>

          {material ? (
            <div className="row-wrap">
              <button type="button" className="btn btn-sm" onClick={() => setPreview((shown) => !shown)} aria-expanded={preview}>
                {t("admin.material.preview")}
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                {t("common.delete")}
                <TrashIcon />
              </button>
            </div>
          ) : null}
        </div>

        {busy ? <span className="hint">{t("admin.material.uploading")}</span> : null}
        <ErrorNotice error={error} />
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
      </div>
    </section>
  );
}
