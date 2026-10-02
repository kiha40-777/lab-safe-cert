import type { AuthStatus } from "@/lib/types";
import { json, route } from "@/server/http/route";
import { findMemberRow, toMemberDto } from "@/server/services/members";
import { isPasswordSet } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** Who is logged in (used by the pages to decide which screen to show). */
export const GET = route({ auth: "none" }, async ({ ctx, sessions }) => {
  const memberId = sessions.participant?.memberId;
  const member = memberId ? await findMemberRow(ctx.db, memberId) : undefined;
  const status: AuthStatus = {
    participant: sessions.participant !== null,
    admin: sessions.admin !== null,
    member: member ? toMemberDto(member) : null,
    participantPasswordSet: await isPasswordSet(ctx, "participant"),
  };
  return json(status);
});
