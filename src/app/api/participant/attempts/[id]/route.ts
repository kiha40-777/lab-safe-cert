import { json, route } from "@/server/http/route";
import { getAttemptDetail } from "@/server/services/attempts";
import { requireSessionMember } from "@/server/services/participant";

export const dynamic = "force-dynamic";

/** The questions of an unfinished attempt, or the full result of a submitted one. */
export const GET = route<{ id: string }>({ auth: "participant" }, async ({ ctx, sessions, params }) => {
  const member = await requireSessionMember(ctx, sessions.participant);
  return json(await getAttemptDetail(ctx, params.id, member.id));
});
