import { readJson } from "@/server/http/body";
import { object, string } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { startAttempt } from "@/server/services/attempts";
import { requireSessionMember } from "@/server/services/participant";

export const dynamic = "force-dynamic";

/**
 * Starts a test (or picks up the unfinished one). Body: { testId }.
 * The response contains the questions but never the correct answers.
 */
export const POST = route({ auth: "participant" }, async ({ req, ctx, sessions }) => {
  const body = object(await readJson(req));
  const testId = string(body, "testId", 64, 1);
  const member = await requireSessionMember(ctx, sessions.participant);
  return json(await startAttempt(ctx, member.id, testId), { status: 201 });
});
