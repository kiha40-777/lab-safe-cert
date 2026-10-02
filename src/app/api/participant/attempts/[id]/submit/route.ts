import { readJson } from "@/server/http/body";
import { object } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { submitAttempt } from "@/server/services/attempts";
import { requireSessionMember } from "@/server/services/participant";

export const dynamic = "force-dynamic";

/**
 * Hands in the test. Body: { answers } (index of the chosen choice per question, null when
 * unanswered); without `answers` the last saved answers are graded. Returns the full result.
 */
export const POST = route<{ id: string }>({ auth: "participant" }, async ({ req, ctx, sessions, params }) => {
  const body = object(await readJson(req));
  const member = await requireSessionMember(ctx, sessions.participant);
  return json(await submitAttempt(ctx, params.id, member.id, body.answers));
});
