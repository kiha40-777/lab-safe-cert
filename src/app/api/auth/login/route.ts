import { COOKIE_NAMES, parseCookies, sessionCookie } from "@/server/auth/cookies";
import { createSession, destroySession } from "@/server/auth/sessions";
import { ApiError } from "@/server/http/errors";
import { readJson } from "@/server/http/body";
import { object, oneOf, string } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { checkPassword } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** Logs in with the participant or the admin password. Failed attempts are limited. */
export const POST = route({ auth: "none" }, async ({ req, ctx, secure, clientIp }) => {
  const body = object(await readJson(req));
  const scope = oneOf(body, "scope", ["participant", "admin"] as const);
  const password = string(body, "password", 500);

  const decision = ctx.limiter.check(scope, clientIp);
  if (!decision.allowed) throw new ApiError(429, "tooManyAttempts", { retryAfterSec: decision.retryAfterSec });

  const result = await checkPassword(ctx, scope, password);
  if (result === "not-set") throw new ApiError(503, "passwordNotSet");
  if (result === "wrong") {
    ctx.limiter.recordFailure(scope, clientIp);
    throw new ApiError(401, "wrongPassword");
  }
  ctx.limiter.recordSuccess(scope, clientIp);

  const previous = parseCookies(req.headers.get("cookie")).get(COOKIE_NAMES[scope]);
  if (previous) await destroySession(ctx, previous);
  const { token, maxAgeSec } = await createSession(ctx, scope);
  return json({ ok: true }, { cookies: [sessionCookie(COOKIE_NAMES[scope], token, maxAgeSec, secure)] });
});
