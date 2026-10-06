"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./FilePicker.module.css";

/**
 * Chooses a file and hands it to `onFile`. The button is written here, in the language of the app: the button
 * of a plain <input type="file"> is worded by the browser, in the browser's own language, whatever the app is
 * set to. The input itself stays in the page, hidden, so keyboard and screen-reader users still reach it; the
 * button is its label. The field's own <label htmlFor={id}> keeps working.
 */
export function FilePicker({
  id,
  accept,
  icon,
  wide = false,
  disabled = false,
  onFile,
}: {
  id: string;
  accept: string;
  /** Shown after the text of the button: the kind of file that is expected (see ButtonIcons.tsx). */
  icon: ReactNode;
  /** The button fills the width it is given, instead of being as wide as its text. */
  wide?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <input
        id={id}
        className={`visually-hidden ${styles.input}`}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          // Empty again, so that choosing the same file once more is noticed.
          input.value = "";
          if (file) onFile(file);
        }}
      />
      <label htmlFor={id} className={`btn ${styles.button} ${wide ? styles.wide : ""}`.trim()} aria-disabled={disabled}>
        {t("common.chooseFile")}
        {icon}
      </label>
    </div>
  );
}
