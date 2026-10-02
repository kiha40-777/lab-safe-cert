import { json, route } from "@/server/http/route";
import { listRoster } from "@/server/services/participant";

export const dynamic = "force-dynamic";

/** Names and roles for the "who are you?" drop-down. */
export const GET = route({ auth: "participant" }, async ({ ctx }) => json({ members: await listRoster(ctx) }));
