import type { Scope } from "@/lib/types";

export const COOKIE_NAMES: Record<Scope, string> = {
  participant: "lsc_participant",
  admin: "lsc_admin",
};

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && !cookies.has(name)) cookies.set(name, value);
  }
  return cookies;
}

/** Session cookie: not readable by scripts, never sent on cross-site requests. */
export function sessionCookie(name: string, token: string, maxAgeSec: number, secure: boolean): string {
  return [
    `${name}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(maxAgeSec)}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearedCookie(name: string, secure: boolean): string {
  return [`${name}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0", ...(secure ? ["Secure"] : [])].join("; ");
}
