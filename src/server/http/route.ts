import type { Scope } from "@/lib/types";
import { COOKIE_NAMES, parseCookies } from "../auth/cookies";
import { type SessionRecord, findSession } from "../auth/sessions";
import { type AppContext, getAppContext } from "../context";
import type { Env } from "../env";
import { ApiError, forbidden, unauthorized } from "./errors";

export type Auth = "none" | "participant" | "admin" | "participant-or-admin";

export interface Sessions {
  participant: SessionRecord | null;
  admin: SessionRecord | null;
}

export interface RouteArgs<P> {
  req: Request;
  url: URL;
  ctx: AppContext;
  params: P;
  sessions: Sessions;
  /** True when responses should set the Secure flag on cookies. */
  secure: boolean;
  /** Address of the client, only known behind a trusted proxy (TRUST_PROXY=1). */
  clientIp: string | null;
}

export interface RouteOptions {
  auth: Auth;
  /** Content type the request body must have: "json" (default), "pdf", or "none" for body-less requests. */
  body?: "json" | "pdf" | "none";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOfUrl(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Rejects requests that a page on another site could have caused (CSRF). */
function assertSameOrigin(req: Request, env: Env): void {
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") throw forbidden("crossSite");
  const origin = req.headers.get("origin");
  if (origin === null) return;
  const ownHost = req.headers.get("host") ?? hostOfUrl(req.url);
  const host = env.trustProxy ? (req.headers.get("x-forwarded-host") ?? ownHost) : ownHost;
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // "null" or garbage
  }
  if (originHost === null || host === null || originHost !== host) throw forbidden("crossSite");
}

function assertContentType(req: Request, expected: "json" | "pdf"): void {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  const ok = expected === "json" ? type.startsWith("application/json") : type.startsWith("application/pdf");
  if (!ok) throw new ApiError(415, "unsupportedContentType");
}

function isSecure(req: Request, env: Env): boolean {
  if (env.cookieSecure) return true;
  if (env.trustProxy && req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

function clientIpOf(req: Request, env: Env): string | null {
  if (!env.trustProxy) return null;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || null;
}

/** The session a route requires (its existence was already checked by `route`). */
export function requireSession(session: SessionRecord | null): SessionRecord {
  if (!session) throw unauthorized();
  return session;
}

/** Response with a JSON body, never cached, optionally setting cookies. */
export function json(data: unknown, options: { status?: number; cookies?: string[]; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(options.headers);
  for (const cookie of options.cookies ?? []) headers.append("Set-Cookie", cookie);
  return Response.json(data, { status: options.status ?? 200, headers });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const headers: Record<string, string> = {};
    const retryAfter = error.params?.retryAfterSec;
    if (error.code === "tooManyAttempts" && typeof retryAfter === "number") headers["Retry-After"] = String(retryAfter);
    return json({ error: { code: error.code, ...(error.params ? { params: error.params } : {}) } }, { status: error.status, headers });
  }
  console.error("[lab-safe-cert] unexpected error:", error);
  return json({ error: { code: "internal" } }, { status: 500 });
}

/**
 * Wraps an API route: checks where the request came from (CSRF), resolves the
 * login sessions, enforces the required login, and turns errors into JSON.
 * Route files export the result as GET / POST / ... .
 */
export function route<P extends Record<string, string> = Record<string, string>>(
  options: RouteOptions,
  handler: (args: RouteArgs<P>) => Promise<Response>,
): (req: Request, routeContext?: { params: Promise<P> }) => Promise<Response> {
  return async (req, routeContext) => {
    try {
      const ctx = await getAppContext();
      const method = req.method.toUpperCase();
      if (!SAFE_METHODS.has(method)) {
        assertSameOrigin(req, ctx.env);
        const expected = options.body ?? "json";
        if (expected !== "none") assertContentType(req, expected);
      }

      const cookies = parseCookies(req.headers.get("cookie"));
      const sessions: Sessions = {
        participant: await findSession(ctx, "participant", cookies.get(COOKIE_NAMES.participant)),
        admin: await findSession(ctx, "admin", cookies.get(COOKIE_NAMES.admin)),
      };
      const allowed: Scope[] =
        options.auth === "none"
          ? []
          : options.auth === "participant-or-admin"
            ? ["participant", "admin"]
            : [options.auth];
      if (allowed.length > 0 && !allowed.some((scope) => sessions[scope] !== null)) throw unauthorized();

      return await handler({
        req,
        url: new URL(req.url),
        ctx,
        params: (routeContext ? await routeContext.params : {}) as P,
        sessions,
        secure: isSecure(req, ctx.env),
        clientIp: clientIpOf(req, ctx.env),
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
