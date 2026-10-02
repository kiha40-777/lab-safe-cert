import { json, route } from "@/server/http/route";
import { listSubmittedAttempts } from "@/server/services/attempts";
import { requireMemberRow, toMemberDto } from "@/server/services/members";

export const dynamic = "force-dynamic";

/** All submitted attempts of one person, newest first. */
export const GET = route<{ id: string }>({ auth: "admin" }, async ({ ctx, params }) => {
  const member = await requireMemberRow(ctx.db, params.id);
  return json({ member: toMemberDto(member), attempts: await listSubmittedAttempts(ctx.db, member.id, 500) });
});
