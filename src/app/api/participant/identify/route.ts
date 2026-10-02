import { readJson } from "@/server/http/body";
import { object, string } from "@/server/http/input";
import { json, requireSession, route } from "@/server/http/route";
import { type IdentifyInput, identify } from "@/server/services/participant";

export const dynamic = "force-dynamic";

/**
 * Chooses who this session is. Body: { memberId } for a listed person,
 * { newName } for "Other" (registers a new candidate), or { clear: true } for "not me".
 */
export const POST = route({ auth: "participant" }, async ({ req, ctx, sessions }) => {
  const body = object(await readJson(req));
  let input: IdentifyInput;
  if (body.clear === true) input = { clear: true };
  else if (body.newName !== undefined) input = { newName: string(body, "newName", 300) };
  else input = { memberId: string(body, "memberId", 100, 1) };
  const member = await identify(ctx, requireSession(sessions.participant), input);
  return json({ member });
});
