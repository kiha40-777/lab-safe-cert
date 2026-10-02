import { json, route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/** Used by hosting platforms and Docker to check that the server and its database are up. */
export const GET = route({ auth: "none" }, async () => json({ ok: true }));
