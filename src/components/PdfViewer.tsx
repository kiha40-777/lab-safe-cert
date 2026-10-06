"use client";

import { useI18n } from "@/lib/i18n/context";
import { DownloadIcon, ExternalLinkIcon } from "./ButtonIcons";
import styles from "./PdfViewer.module.css";

/**
 * Shows a PDF in the browser's own viewer. Some phone browsers only show the
 * first page inside a frame, so links to open it in a new tab or download it come with it.
 */
export function PdfViewer({ src, title }: { src: string; title: string }) {
  const { t } = useI18n();
  return (
    <div className="stack-sm">
      <iframe className={styles.frame} src={src} title={title} />
      <div className={styles.links}>
        <a className="btn btn-sm" href={src} target="_blank" rel="noopener noreferrer">
          {t("home.openNewTab")}
          <ExternalLinkIcon />
        </a>
        <a className="btn btn-sm" href={`${src}${src.includes("?") ? "&" : "?"}download=1`}>
          {t("home.download")}
          <DownloadIcon />
        </a>
      </div>
      <p className="hint">{t("home.pdfHelp")}</p>
    </div>
  );
}
