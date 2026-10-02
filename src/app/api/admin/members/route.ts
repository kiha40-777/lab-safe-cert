import { readJson } from "@/server/http/body";
import { object, optionalString, string } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { createMember, toMemberDto } from "@/server/services/members";

export const dynamic = "force-dynamic";

/** Registers one person. Body: { name, role? } (the role defaults to the entry role of the ladder). */
export const POST = route({ auth: "admin" }, async ({ req, ctx }) => {
  const body = object(await readJson(req));
  const row = await createMember(ctx, {
    name: string(body, "name", 300),
    role: optionalString(body, "role", 64),
  });
  return json({ member: toMemberDto(row) }, { status: 201 });
});
