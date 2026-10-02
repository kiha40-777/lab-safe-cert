import { bankToExternal } from "@/server/bank/validate";
import { notFound } from "@/server/http/errors";
import { downloadResponse } from "@/server/http/files";
import { route } from "@/server/http/route";
import { loadBank } from "@/server/services/banks";
import { requireTest } from "@/server/services/tests";

export const dynamic = "force-dynamic";

/** Downloads the stored question bank as a file in the documented JSON format. */
export const GET = route<{ testId: string }>({ auth: "admin" }, async ({ ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  const stored = await loadBank(ctx.db, test.id);
  if (!stored) throw notFound("bankNotFound");
  const text = JSON.stringify(
    bankToExternal({
      info: { generator: stored.meta.generator, generatedAt: stored.meta.generatedAt, source: stored.meta.source },
      questions: stored.questions,
    }),
    null,
    2,
  );
  return downloadResponse(text + "\n", `question-bank-${test.id}.json`, "application/json; charset=utf-8");
});
