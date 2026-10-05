import { readJson } from "@/server/http/body";
import { integer, object } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { setCaseStudyPerTest } from "@/server/services/case-study";
import { requireTest } from "@/server/services/tests";

export const dynamic = "force-dynamic";

/** Sets how many of the questions of one attempt are case studies (0 to the number of questions of the test). Body: { perTest }. */
export const PUT = route<{ testId: string }>({ auth: "admin" }, async ({ req, ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  const body = object(await readJson(req));
  const perTest = await setCaseStudyPerTest(ctx, test, integer(body, "perTest", 0, test.questionsPerTest));
  return json({ perTest });
});
