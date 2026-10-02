"use client";

import { useI18n } from "@/lib/i18n/context";
import { describeError } from "@/lib/errors";
import { Notice } from "./Notice";

/** Shows a translated message for an error thrown by an API call. Renders nothing without an error. */
export function ErrorNotice({ error, className }: { error: unknown; className?: string }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <Notice kind="danger" className={className}>
      {describeError(t, error)}
    </Notice>
  );
}
