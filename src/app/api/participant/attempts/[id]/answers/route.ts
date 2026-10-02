import { readJson } from "@/server/http/body";
import { object } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { saveAnswers } from "@/server/services/attempts";
import { requireSessionMember } from "@/server/services/participant";

export const dynamic = "force-dynamic";

/** Saves the answers given so far, so that a reload does not lose them. Body: { answers }. */
export const PUT = route<{ id: string }>({ auth: "participant" }, async ({ req, ctx, sessions, params }) => {
  const body = object(await readJson(req));
  const member = await requireSessionMember(ctx, sessions.participant);
  await saveAnswers(ctx, params.id, member.id, body.answers);
  return json({ ok: true });
});
