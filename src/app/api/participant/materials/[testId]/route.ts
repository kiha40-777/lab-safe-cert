import { findTest } from "@/lib/certification";
import { notFound } from "@/server/http/errors";
import { pdfResponse } from "@/server/http/files";
import { route } from "@/server/http/route";
import { getMaterialFile } from "@/server/services/materials";

export const dynamic = "force-dynamic";

/** The study PDF of a test. Add ?download=1 to save it instead of viewing it. */
export const GET = route<{ testId: string }>(
  { auth: "participant-or-admin" },
  async ({ ctx, params, url }) => {
    const test = findTest(ctx.config, params.testId);
    if (!test) throw notFound("unknownTest");
    const file = await getMaterialFile(ctx.db, test.id);
    if (!file) throw notFound("materialNotFound");
    return pdfResponse(file, url.searchParams.get("download") === "1");
  },
);
