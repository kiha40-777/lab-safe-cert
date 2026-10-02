import { ApiClientError } from "./api";
import type { Translator } from "./i18n/messages";

/** A readable, translated message for anything that went wrong while calling the API. */
export function describeError(t: Translator, error: unknown): string {
  if (error instanceof ApiClientError) {
    const params = { ...error.params, code: error.code };
    return t.dynamic("errors", error.code, params, t("errors.unknown", params));
  }
  return t("errors.unknown", { code: error instanceof Error ? error.message : "?" });
}
