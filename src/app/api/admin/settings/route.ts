import { json, route } from "@/server/http/route";
import { getAdminSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

/** Which passwords are set and whether they are managed by environment variables. (Never returns a password.) */
export const GET = route({ auth: "admin" }, async ({ ctx }) => json(await getAdminSettings(ctx)));
