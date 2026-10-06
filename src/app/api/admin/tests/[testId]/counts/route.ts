import { COUNT_LIMITS, type TestCounts } from "@/lib/counts";
import { readJson } from "@/server/http/body";
import { integer, object } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { setCounts } from "@/server/services/counts";
import { requireTest } from "@/server/services/tests";

export const dynamic = "force-dynamic";

/**
 * Sets the numbers a test is built with. Body: { bankSize, perTest, caseStudyBankSize?, caseStudyPerTest? }:
 * questions in the question set and in one attempt, each with how many of them are case studies
 * (case studies are part of the totals; 0 or left out for a test without them). Numbers that do not fit
 * together are answered with 400 invalidCounts and the first problem.
 */
export const PUT = route<{ testId: string }>({ auth: "admin" }, async ({ req, ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  const body = object(await readJson(req));
  const read = (field: keyof TestCounts, fallback?: number): number =>
    fallback !== undefined && body[field] === undefined ? fallback : integer(body, field, ...COUNT_LIMITS[field]);
  const counts = await setCounts(ctx, test, {
    bankSize: read("bankSize"),
    perTest: read("perTest"),
    caseStudyBankSize: read("caseStudyBankSize", 0),
    caseStudyPerTest: read("caseStudyPerTest", 0),
  });
  return json({ counts });
});
