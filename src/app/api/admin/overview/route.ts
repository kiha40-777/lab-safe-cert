import { json, route } from "@/server/http/route";
import { getAdminOverview } from "@/server/services/overview";

export const dynamic = "force-dynamic";

/** Dashboard data: every person with their role and results, the state of each test, recent attempts. */
export const GET = route({ auth: "admin" }, async ({ ctx }) => json(await getAdminOverview(ctx)));
