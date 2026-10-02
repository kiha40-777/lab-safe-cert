import { badRequest } from "@/server/http/errors";
import { downloadResponse } from "@/server/http/files";
import { route } from "@/server/http/route";
import { attemptsCsv, resultsCsv } from "@/server/services/export";

export const dynamic = "force-dynamic";

/** CSV download. ?type=results (one row per person, default) or ?type=attempts (one row per submitted attempt). */
export const GET = route({ auth: "admin" }, async ({ ctx, url }) => {
  const type = url.searchParams.get("type") ?? "results";
  if (type !== "results" && type !== "attempts") throw badRequest("invalidInput", { field: "type" });
  const csv = type === "results" ? await resultsCsv(ctx) : await attemptsCsv(ctx);
  return downloadResponse(csv, `${type}-${ctx.now().toISOString().slice(0, 10)}.csv`, "text/csv; charset=utf-8");
});
