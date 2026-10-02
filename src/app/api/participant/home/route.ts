import { json, route } from "@/server/http/route";
import { getParticipantHome, requireSessionMember } from "@/server/services/participant";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "participant" }, async ({ ctx, sessions }) => {
  const member = await requireSessionMember(ctx, sessions.participant);
  return json(await getParticipantHome(ctx, member));
});
