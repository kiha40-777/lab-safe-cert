import { readJson } from "@/server/http/body";
import { object, optionalString } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { deleteMember, toMemberDto, updateMember } from "@/server/services/members";

export const dynamic = "force-dynamic";

/** Changes a person's name and/or role. Body: { name?, role? }. */
export const PATCH = route<{ id: string }>({ auth: "admin" }, async ({ req, ctx, params }) => {
  const body = object(await readJson(req));
  const row = await updateMember(ctx, params.id, {
    name: optionalString(body, "name", 300),
    role: optionalString(body, "role", 64),
  });
  return json({ member: toMemberDto(row) });
});

/** Removes a person together with all of their attempts. */
export const DELETE = route<{ id: string }>({ auth: "admin", body: "none" }, async ({ ctx, params }) => {
  await deleteMember(ctx, params.id);
  return json({ ok: true });
});
