import { resolve } from "node:path";

/** Runtime settings taken from environment variables (see .env.example). All are optional. */
export interface Env {
  /** Folder that holds the database file (used when no Turso database is configured). */
  dataDir: string;
  /** Address of a Turso (libSQL) database. When set, the data is kept there instead of in `dataDir`. */
  tursoUrl: string | null;
  /** Access token of that Turso database. */
  tursoAuthToken: string | null;
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
  /** UI language for first-time visitors; null = follow the browser. */
  defaultLang: string | null;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function flag(value: string | undefined, fallback = false): boolean {
  const v = value?.trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes";
}

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  // Render (render.com) sets RENDER=true and serves the app through its HTTPS proxy, so there the
  // two proxy settings are on unless they are set explicitly.
  const behindProxy = flag(source.RENDER);

  return {
    // A run-time location (not part of the build), so the bundler must not try to include it.
    dataDir: resolve(/*turbopackIgnore: true*/ text(source.DATA_DIR) ?? "data"),
    tursoUrl: text(source.TURSO_DATABASE_URL),
    tursoAuthToken: text(source.TURSO_AUTH_TOKEN),
    adminPassword: text(source.ADMIN_PASSWORD),
    participantPassword: text(source.PARTICIPANT_PASSWORD),
    resetAdminPassword: flag(source.LSC_RESET_ADMIN_PASSWORD),
    trustProxy: flag(source.TRUST_PROXY, behindProxy),
    cookieSecure: flag(source.COOKIE_SECURE, behindProxy),
    defaultLang: text(source.DEFAULT_LANG),
  };
}
