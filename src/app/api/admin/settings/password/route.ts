import { ApiError } from "@/server/http/errors";
import { readJson } from "@/server/http/body";
import { object, oneOf, optionalBoolean, string } from "@/server/http/input";
import { json, requireSession, route } from "@/server/http/route";
import { checkPassword, generateAndSetPassword, setPassword } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/**
 * Changes a password. Body:
 *  - { kind: "admin", currentPassword, newPassword }
 *  - { kind: "participant", newPassword } or { kind: "participant", generate: true }
 * A generated password is returned once (only its hash is stored, so it cannot be shown again).
 */
export const POST = route({ auth: "admin" }, async ({ req, ctx, sessions, clientIp }) => {
  const body = object(await readJson(req));
  const kind = oneOf(body, "kind", ["admin", "participant"] as const);
  const session = requireSession(sessions.admin);

  if (kind === "admin") {
    const decision = ctx.limiter.check("admin", clientIp);
    if (!decision.allowed) throw new ApiError(429, "tooManyAttempts", { retryAfterSec: decision.retryAfterSec });
    const current = await checkPassword(ctx, "admin", string(body, "currentPassword", 500));
    if (current !== "ok") {
      ctx.limiter.recordFailure("admin", clientIp);
      throw new ApiError(403, "wrongCurrentPassword");
    }
    ctx.limiter.recordSuccess("admin", clientIp);
    await setPassword(ctx, "admin", string(body, "newPassword", 500), session.tokenHash);
    return json({ password: null });
  }

  if (optionalBoolean(body, "generate") === true) {
    return json({ password: await generateAndSetPassword(ctx, "participant") });
  }
  await setPassword(ctx, "participant", string(body, "newPassword", 500));
  return json({ password: null });
});
