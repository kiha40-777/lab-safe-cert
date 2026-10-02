import { createHash } from "node:crypto";
import type { Scope } from "@/lib/types";
import type { AppContext } from "../context";

/** How long a login lasts. */
export const SESSION_TTL_MS: Record<Scope, number> = {
  participant: 24 * 60 * 60_000,
  admin: 8 * 60 * 60_000,
};

export interface SessionRecord {
  tokenHash: string;
  scope: Scope;
  memberId: string | null;
}

/** Only a hash of the token is stored, so a copy of the database cannot be used to log in. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  ctx: AppContext,
  scope: Scope,
): Promise<{ token: string; maxAgeSec: number }> {
  const token = ctx.rng.token(32);
  const now = ctx.now();
  await ctx.db.run(
    "INSERT INTO sessions (token_hash, scope, member_id, created_at, expires_at) VALUES (?, ?, NULL, ?, ?)",
    [
      hashToken(token),
      scope,
      now.toISOString(),
      new Date(now.getTime() + SESSION_TTL_MS[scope]).toISOString(),
    ],
  );
  await ctx.db.run("DELETE FROM sessions WHERE expires_at < ?", [now.toISOString()]);
  return { token, maxAgeSec: SESSION_TTL_MS[scope] / 1000 };
}

export async function findSession(
  ctx: AppContext,
  scope: Scope,
  token: string | undefined,
): Promise<SessionRecord | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await ctx.db.get<{ member_id: string | null; expires_at: string }>(
    "SELECT member_id, expires_at FROM sessions WHERE token_hash = ? AND scope = ?",
    [tokenHash, scope],
  );
  if (!row || row.expires_at <= ctx.now().toISOString()) return null;
  return { tokenHash, scope, memberId: row.member_id };
}

export async function destroySession(ctx: AppContext, token: string): Promise<void> {
  await ctx.db.run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

/** Logs out everyone of a scope, optionally keeping one session (the one that made the change). */
export async function destroySessions(ctx: AppContext, scope: Scope, keepTokenHash?: string): Promise<void> {
  if (keepTokenHash) {
    await ctx.db.run("DELETE FROM sessions WHERE scope = ? AND token_hash <> ?", [scope, keepTokenHash]);
  } else {
    await ctx.db.run("DELETE FROM sessions WHERE scope = ?", [scope]);
  }
}

/** Remembers which person a participant session is acting as. */
export async function setSessionMember(
  ctx: AppContext,
  tokenHash: string,
  memberId: string | null,
): Promise<void> {
  await ctx.db.run("UPDATE sessions SET member_id = ? WHERE token_hash = ?", [memberId, tokenHash]);
}
