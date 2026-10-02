import type { TestConfig } from "@/lib/certification";
import type { QuestionDto, ValidationResultDto } from "@/lib/types";
import type { BankInfo, ValidationOutcome } from "../bank/types";
import { questionToDto, validateBankText, validateEditedQuestions } from "../bank/validate";
import type { AppContext } from "../context";
import { badRequest } from "../http/errors";
import { type Obj, object, optionalString, string, stringList } from "../http/input";
import { rulesFor } from "./banks";

const MAX_QUESTIONS = 1000;

/** A question bank as sent by the admin screen: the text of an uploaded file, or questions edited in the editor. */
export type BankInput =
  | { kind: "text"; text: string }
  | { kind: "edited"; questions: QuestionDto[]; info: BankInfo };

function readInfo(body: Obj): BankInfo {
  const meta = body.meta === undefined || body.meta === null ? {} : object(body.meta, "meta");
  const pick = (field: string) => {
    const value = optionalString(meta, field, 200)?.trim();
    return value ? value : null;
  };
  return { generator: pick("generator"), generatedAt: pick("generatedAt"), source: pick("source") };
}

export function parseBankInput(body: Obj): BankInput {
  if (typeof body.text === "string") {
    return { kind: "text", text: string(body, "text", 2 * 1024 * 1024) };
  }
  if (!Array.isArray(body.questions) || body.questions.length > MAX_QUESTIONS) {
    throw badRequest("invalidInput", { field: "questions" });
  }
  const questions = (body.questions as unknown[]).map((raw, i): QuestionDto => {
    const q = object(raw, `questions[${i}]`);
    return {
      id: optionalString(q, "id", 64) ?? "",
      text: string(q, "text", 5000),
      choices: stringList(q, "choices", 20, 2000),
      answerIndex: typeof q.answerIndex === "number" && Number.isInteger(q.answerIndex) ? q.answerIndex : -1,
      explanation: optionalString(q, "explanation", 5000) ?? "",
      source: optionalString(q, "source", 5000) ?? "",
    };
  });
  return { kind: "edited", questions, info: readInfo(body) };
}

export function validateBankInput(ctx: AppContext, test: TestConfig, input: BankInput): ValidationOutcome {
  const rules = rulesFor(ctx.config, test);
  return input.kind === "text"
    ? validateBankText(input.text, rules)
    : validateEditedQuestions(input.questions, input.info, rules);
}

export function toValidationDto(outcome: ValidationOutcome): ValidationResultDto {
  return {
    ok: outcome.errors.length === 0,
    errors: outcome.errors,
    warnings: outcome.warnings,
    infos: outcome.infos,
    summary: outcome.summary,
    preview: outcome.bank ? outcome.bank.questions.map(questionToDto) : null,
    meta: outcome.bank ? outcome.bank.info : null,
  };
}
