import type { AdminSettings } from "@/lib/types";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  generatePassword,
  hashPassword,
  normalizePassword,
  safeEqual,
  verifyPassword,
} from "../auth/password";
import { destroySessions } from "../auth/sessions";
import type { AppContext } from "../context";
import { badRequest, conflict } from "../http/errors";

export type PasswordKind = "admin" | "participant";

const KEYS: Record<PasswordKind, string> = {
  admin: "admin_password_hash",
  participant: "participant_password_hash",
};

/** A password from an environment variable wins over (and cannot be changed like) a stored one. */
function envPassword(ctx: AppContext, kind: PasswordKind): string | null {
  return kind === "admin" ? ctx.env.adminPassword : ctx.env.participantPassword;
}

async function storedHash(ctx: AppContext, kind: PasswordKind): Promise<string | null> {
  const row = await ctx.db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEYS[kind]]);
  return row?.value ?? null;
}

export async function isPasswordSet(ctx: AppContext, kind: PasswordKind): Promise<boolean> {
  return envPassword(ctx, kind) !== null || (await storedHash(ctx, kind)) !== null;
}

export async function checkPassword(
  ctx: AppContext,
  kind: PasswordKind,
  candidate: string,
): Promise<"ok" | "wrong" | "not-set"> {
  const fromEnv = envPassword(ctx, kind);
  if (fromEnv !== null) {
    return safeEqual(normalizePassword(candidate), normalizePassword(fromEnv)) ? "ok" : "wrong";
  }
  const hash = await storedHash(ctx, kind);
  if (hash === null) return "not-set";
  return (await verifyPassword(candidate, hash)) ? "ok" : "wrong";
}

/**
 * Stores a new password (as a hash). Everyone logged in with the old participant
 * password is logged out; for the admin password the caller keeps its own session.
 */
export async function setPassword(
  ctx: AppContext,
  kind: PasswordKind,
  newPassword: string,
  keepSessionHash?: string,
): Promise<void> {
  if (envPassword(ctx, kind) !== null) throw conflict("passwordManagedByEnv");
  const length = [...normalizePassword(newPassword)].length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw badRequest("invalidPassword", { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
  }
  const hash = await hashPassword(newPassword);
  await ctx.db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEYS[kind], hash],
  );
  await destroySessions(ctx, kind, keepSessionHash);
}

/** Generates a random participant password, stores it and returns it (it cannot be read back later). */
export async function generateAndSetPassword(
  ctx: AppContext,
  kind: PasswordKind,
  keepSessionHash?: string,
): Promise<string> {
  const password = generatePassword();
  await setPassword(ctx, kind, password, keepSessionHash);
  return password;
}

export async function getAdminSettings(ctx: AppContext): Promise<AdminSettings> {
  return {
    admin: { managedByEnv: ctx.env.adminPassword !== null },
    participant: {
      set: await isPasswordSet(ctx, "participant"),
      managedByEnv: ctx.env.participantPassword !== null,
    },
  };
}

/**
 * Called once at start-up: makes sure an admin password exists. On the very first
 * start (or with --reset-admin-password) a random one is generated and returned
 * so it can be shown once in the terminal.
 */
export async function ensurePasswords(
  ctx: AppContext,
): Promise<{ generatedAdminPassword: string | null; resetIgnored: boolean }> {
  if (ctx.env.adminPassword !== null) {
    return { generatedAdminPassword: null, resetIgnored: ctx.env.resetAdminPassword };
  }
  const exists = (await storedHash(ctx, "admin")) !== null;
  if (exists && !ctx.env.resetAdminPassword) {
    return { generatedAdminPassword: null, resetIgnored: false };
  }
  const password = await generateAndSetPassword(ctx, "admin");
  return { generatedAdminPassword: password, resetIgnored: false };
}
