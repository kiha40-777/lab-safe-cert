import type { BankDto } from "@/lib/types";
import { questionToDto } from "@/server/bank/validate";
import { readJson } from "@/server/http/body";
import { object, optionalBoolean } from "@/server/http/input";
import { json, route } from "@/server/http/route";
import { parseBankInput, toValidationDto, validateBankInput } from "@/server/services/bank-input";
import { loadBank, saveBank } from "@/server/services/banks";
import { requireTest } from "@/server/services/tests";

export const dynamic = "force-dynamic";

/** The stored question bank of a test, in the form the editor uses (null when there is none yet). */
export const GET = route<{ testId: string }>({ auth: "admin" }, async ({ ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  const stored = await loadBank(ctx.db, test.id);
  const bank: BankDto | null = stored ? { meta: stored.meta, questions: stored.questions.map(questionToDto) } : null;
  return json({ bank });
});

/**
 * Saves the question bank. Body: { text, reviewConfirmed } to import an uploaded file, or
 * { questions, meta?, reviewConfirmed? } to store questions edited in the editor.
 * The bank is checked again here; an invalid one is answered with 422 and the list of problems.
 */
export const PUT = route<{ testId: string }>({ auth: "admin" }, async ({ req, ctx, params }) => {
  const test = requireTest(ctx.config, params.testId);
  const body = object(await readJson(req));
  const input = parseBankInput(body);
  const outcome = validateBankInput(ctx, test, input);
  if (!outcome.bank) {
    return json({ error: { code: "bankInvalid" }, validation: toValidationDto(outcome) }, { status: 422 });
  }
  const meta = await saveBank(ctx, test.id, outcome.bank, {
    kind: input.kind === "text" ? "import" : "edit",
    reviewConfirmed: optionalBoolean(body, "reviewConfirmed") === true,
  });
  return json({ meta, warnings: outcome.warnings });
});
