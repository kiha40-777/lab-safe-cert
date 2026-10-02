import { COOKIE_NAMES, clearedCookie, parseCookies } from "@/server/auth/cookies";
import { destroySession } from "@/server/auth/sessions";
import { readJson } from "@/server/http/body";
import { object, oneOf } from "@/server/http/input";
import { json, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/** Logs out of one screen ("participant" or "admin"). Safe to call when not logged in. */
export const POST = route({ auth: "none" }, async ({ req, ctx, secure }) => {
  const body = object(await readJson(req));
  const scope = oneOf(body, "scope", ["participant", "admin"] as const);
  const token = parseCookies(req.headers.get("cookie")).get(COOKIE_NAMES[scope]);
  if (token) await destroySession(ctx, token);
  return json({ ok: true }, { cookies: [clearedCookie(COOKIE_NAMES[scope], secure)] });
});
