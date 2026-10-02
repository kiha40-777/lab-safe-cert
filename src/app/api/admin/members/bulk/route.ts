import { readJson } from "@/server/http/body";
import { object, stringList, string } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { createMembersBulk, toMemberDto } from "@/server/services/members";

export const dynamic = "force-dynamic";

/** Registers many people at once. Body: { names: string[], role }. Existing/invalid/repeated names are reported as skipped. */
export const POST = route({ auth: "admin" }, async ({ req, ctx }) => {
  const body = object(await readJson(req));
  const result = await createMembersBulk(ctx, stringList(body, "names", 5000, 300), string(body, "role", 64));
  return json({ created: result.created.map(toMemberDto), skipped: result.skipped }, { status: 201 });
});
