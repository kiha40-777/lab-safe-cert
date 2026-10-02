import { resolve } from "node:path";

/** Runtime settings taken from environment variables (see .env.example). All are optional. */
export interface Env {
  /** Folder that holds the database file. */
  dataDir: string;
  /** When set, this is the admin password (it cannot be changed in the admin screen). */
  adminPassword: string | null;
  /** When set, this is the participant password (it cannot be changed in the admin screen). */
  participantPassword: string | null;
  /** Generate a new admin password on start and print it (set by `--reset-admin-password`). */
  resetAdminPassword: boolean;
  /** Trust X-Forwarded-* headers (only enable behind a reverse proxy you control). */
  trustProxy: boolean;
  /** Always mark cookies as Secure. */
  cookieSecure: boolean;
  /** Largest accepted study PDF, in bytes. */
  maxPdfBytes: number;
  /** UI language for first-time visitors; null = follow the browser. */
  defaultLang: string | null;
}

const DEFAULT_MAX_PDF_MB = 25;

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function flag(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const requestedMb = Number(source.MAX_PDF_MB);
  const maxPdfMb =
    Number.isFinite(requestedMb) && requestedMb >= 1 && requestedMb <= 200
      ? requestedMb
      : DEFAULT_MAX_PDF_MB;

  return {
    // A run-time location (not part of the build), so the bundler must not try to include it.
    dataDir: resolve(/*turbopackIgnore: true*/ text(source.DATA_DIR) ?? "data"),
    adminPassword: text(source.ADMIN_PASSWORD),
    participantPassword: text(source.PARTICIPANT_PASSWORD),
    resetAdminPassword: flag(source.LSC_RESET_ADMIN_PASSWORD),
    trustProxy: flag(source.TRUST_PROXY),
    cookieSecure: flag(source.COOKIE_SECURE),
    maxPdfBytes: Math.round(maxPdfMb * 1024 * 1024),
    defaultLang: text(source.DEFAULT_LANG),
  };
}
