import { readJson } from "@/server/http/body";
import { object } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { parseBankInput, toValidationDto, validateBankInput } from "@/server/services/bank-input";
import { requireTest } from "@/server/services/tests";

export const dynamic = "force-dynamic";

/** Checks a question-bank file (Body: { text }) or edited questions without saving anything. */
export const POST = route<{ testId: string }>({ auth: "admin" }, async ({ req, ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  const input = parseBankInput(object(await readJson(req)));
  return json(toValidationDto(await validateBankInput(ctx, test, input)));
});
