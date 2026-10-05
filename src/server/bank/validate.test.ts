import { describe, expect, it } from "vitest";
import { findTest } from "@/lib/certification";
import { certification } from "@/lib/config";
import type { QuestionDto } from "@/lib/types";
import { makeBankJson, makeQuestions } from "../test-utils";
import { rulesFor } from "../services/banks";
import {
  bankToExternal,
  letterOf,
  questionToDto,
  validateBankText,
  validateEditedQuestions,
} from "./validate";

const test = findTest(certification, "participant");
if (!test) throw new Error("participant test missing from config");
const rules = rulesFor(certification, test, 0);

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

/** A bank file whose questions are changed by `edit` (a list of raw question objects). */
function bankWith(count: number, edit: (questions: Record<string, unknown>[]) => void): string {
  const parsed = JSON.parse(makeBankJson(count)) as { questions: Record<string, unknown>[] };
  edit(parsed.questions);
  return JSON.stringify(parsed);
}

describe("validateBankText: accepted input", () => {
  it("accepts a complete bank of 60 questions without any warning", () => {
    const result = validateBankText(makeBankJson(60), rules);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.bank?.questions).toHaveLength(60);
    expect(result.summary?.questionCount).toBe(60);
    expect(result.summary?.choiceCounts).toEqual({ "4": 60 });
    expect(result.summary?.answerDistribution).toEqual({ A: 15, B: 15, C: 15, D: 15 });
    expect(result.bank?.info).toEqual({ generator: "test-suite", generatedAt: "2000-01-01", source: "placeholder" });
  });

  it("removes a Markdown code fence that chat AIs like to add", () => {
    const text = "```json\n" + makeBankJson(60) + "\n```";
    const result = validateBankText(text, rules);
    expect(result.errors).toEqual([]);
    expect(codes(result.infos)).toContain("input.fenceStripped");
  });

  it("ignores a sentence before and after the JSON, with a warning", () => {
    const text = "Here is your test:\n" + makeBankJson(60) + "\nLet me know if you need changes!";
    const result = validateBankText(text, rules);
    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).toContain("input.extraTextIgnored");
  });

  it("handles a fence inside prose", () => {
    const text = "Sure!\n```json\n" + makeBankJson(60) + "\n```\nDone.";
    const result = validateBankText(text, rules);
    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).toContain("input.extraTextIgnored");
  });

  it("ignores a byte-order mark", () => {
    expect(validateBankText("﻿" + makeBankJson(60), rules).errors).toEqual([]);
  });

  it("accepts a bare array of questions", () => {
    const array = (JSON.parse(makeBankJson(60)) as { questions: unknown[] }).questions;
    const result = validateBankText(JSON.stringify(array), rules);
    expect(result.errors).toEqual([]);
    expect(codes(result.infos)).toContain("root.array");
  });

  it("accepts lower-case answer letters and forms like \"B)\"", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.answer = "a";
      qs[1]!.answer = "B)";
      qs[2]!.answer = " c. ";
    });
    const result = validateBankText(text, rules);
    expect(result.errors).toEqual([]);
    expect(result.bank?.questions.slice(0, 3).map((q) => q.answerIndex)).toEqual([0, 1, 2]);
  });

  it("assigns ids to questions that have none, avoiding collisions", () => {
    const text = bankWith(60, (qs) => {
      delete qs[0]!.id;
      qs[1]!.id = "q001"; // would collide with the generated id of question 1
    });
    const result = validateBankText(text, rules);
    expect(result.errors).toEqual([]);
    const ids = result.bank?.questions.map((q) => q.id) ?? [];
    expect(new Set(ids).size).toBe(60);
    expect(ids[0]).not.toBe("q001");
  });

  it("keeps optional explanation and source", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.explanation = "  Because.  ";
      qs[0]!.source = "p. 3";
    });
    const question = validateBankText(text, rules).bank?.questions[0];
    expect(question?.explanation).toBe("Because.");
    expect(question?.source).toBe("p. 3");
  });

  it("warns (but accepts) a bank whose size differs from the expected 60", () => {
    const result = validateBankText(makeBankJson(45), rules);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual({ code: "bank.sizeDiffers", params: { count: 45, expected: 60 } });
  });

  it("warns when a question does not have the usual number of choices, if the limits allow other counts", () => {
    const flexible = { ...rules, minChoices: 2, maxChoices: 6 };
    const result = validateBankText(makeBankJson(60, 3), flexible);
    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).toContain("question.choiceCountDiffers");
  });

  it("is configured so that every question has exactly 4 choices", () => {
    expect(rules).toMatchObject({ minChoices: 4, maxChoices: 4, preferredChoices: 4 });
  });
});

describe("validateBankText: rejected input", () => {
  it("reports an empty text", () => {
    expect(codes(validateBankText("  \n ", rules).errors)).toEqual(["json.empty"]);
  });

  it("reports a syntax error with its position", () => {
    const result = validateBankText('{"questions": [ {"question": "x", ', rules);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("json.syntax");
    expect(result.errors[0]?.params?.message).toBeTruthy();
    expect(result.bank).toBeNull();
  });

  it("rejects JSON that is neither an object nor an array", () => {
    expect(codes(validateBankText('"just text"', rules).errors)).toContain("root.invalid");
  });

  it("rejects an object without a questions array", () => {
    expect(codes(validateBankText("{}", rules).errors)).toContain("questions.missing");
  });

  it("rejects an unsupported schema_version", () => {
    const text = makeBankJson(60, 4, { schema_version: 2 });
    expect(codes(validateBankText(text, rules).errors)).toContain("schema.unsupported");
  });

  it("rejects numeric answers because 0-based/1-based is ambiguous", () => {
    const text = bankWith(60, (qs) => (qs[4]!.answer = 2));
    const result = validateBankText(text, rules);
    expect(result.errors).toContainEqual({ code: "answer.isNumber", question: 5, params: { value: 2 } });
    expect(result.bank).toBeNull();
  });

  it("rejects an answer letter beyond the last choice", () => {
    const text = bankWith(60, (qs) => (qs[0]!.answer = "F"));
    expect(validateBankText(text, rules).errors).toContainEqual({
      code: "answer.outOfRange",
      question: 1,
      params: { letter: "F", count: 4 },
    });
  });

  it("rejects missing or unreadable answers", () => {
    const text = bankWith(60, (qs) => {
      delete qs[0]!.answer;
      qs[1]!.answer = "the second one";
    });
    const result = validateBankText(text, rules);
    expect(codes(result.errors)).toEqual(expect.arrayContaining(["answer.missing", "answer.invalid"]));
  });

  it("rejects a question without text or choices", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.question = "   ";
      delete qs[1]!.choices;
    });
    const result = validateBankText(text, rules);
    expect(result.errors).toContainEqual({ code: "question.textMissing", question: 1 });
    expect(result.errors).toContainEqual({ code: "question.choicesMissing", question: 2 });
  });

  it("requires exactly 4 choices: not fewer and not more", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.choices = ["only one"];
      qs[0]!.answer = "A";
      qs[1]!.choices = ["1", "2", "3", "4", "5"];
      qs[2]!.choices = ["1", "2", "3"];
      qs[2]!.answer = "A";
    });
    const result = validateBankText(text, rules);
    expect(result.errors).toContainEqual({ code: "question.choicesNotExact", question: 1, params: { expected: 4, count: 1 } });
    expect(result.errors).toContainEqual({ code: "question.choicesNotExact", question: 2, params: { expected: 4, count: 5 } });
    expect(result.errors).toContainEqual({ code: "question.choicesNotExact", question: 3, params: { expected: 4, count: 3 } });
    expect(result.bank).toBeNull();
  });

  it("rejects too few and too many choices when the limits allow a range", () => {
    const flexible = { ...rules, minChoices: 2, maxChoices: 6 };
    const text = bankWith(60, (qs) => {
      qs[0]!.choices = ["only one"];
      qs[0]!.answer = "A";
      qs[1]!.choices = ["1", "2", "3", "4", "5", "6", "7"];
    });
    const result = validateBankText(text, flexible);
    expect(result.errors).toContainEqual({ code: "question.choicesTooFew", question: 1, params: { min: 2 } });
    expect(result.errors).toContainEqual({ code: "question.choicesTooMany", question: 2, params: { max: 6 } });
  });

  it("rejects empty and duplicate choices", () => {
    const text = bankWith(60, (qs) => {
      qs[2]!.choices = ["a", "", "c", "d"];
      qs[3]!.choices = ["same", "Same ", "x", "y"];
    });
    const result = validateBankText(text, rules);
    expect(result.errors).toContainEqual({ code: "question.choiceEmpty", question: 3, params: { choice: "B" } });
    expect(result.errors).toContainEqual({
      code: "question.choicesDuplicate",
      question: 4,
      params: { a: "A", b: "B" },
    });
  });

  it("rejects fewer questions than one attempt needs", () => {
    const result = validateBankText(makeBankJson(10), rules);
    expect(result.errors).toContainEqual({ code: "bank.tooFew", params: { count: 10, required: 30 } });
  });

  it("rejects an empty question list", () => {
    expect(codes(validateBankText('{"questions": []}', rules).errors)).toContain("bank.empty");
  });

  it("rejects duplicate ids", () => {
    const text = bankWith(60, (qs) => (qs[9]!.id = "q001"));
    expect(validateBankText(text, rules).errors).toContainEqual({
      code: "bank.duplicateId",
      params: { id: "q001", questions: "1, 10" },
    });
  });

  it("rejects a note that is not text", () => {
    const text = bankWith(60, (qs) => (qs[0]!.explanation = { a: 1 }));
    expect(codes(validateBankText(text, rules).errors)).toContain("question.noteInvalid");
  });

  it("keeps the report short: many identical problems become one \"and N more\" entry", () => {
    const text = bankWith(60, (qs) => qs.forEach((q) => delete q.answer));
    const { errors } = validateBankText(text, rules);
    expect(errors.filter((e) => e.code === "answer.missing")).toHaveLength(8);
    expect(errors).toContainEqual({ code: "omitted", params: { of: "answer.missing", count: 52 } });
  });
});

describe("validateBankText: warnings that help catch AI mistakes", () => {
  it("flags \"all of the above\" style choices, in English and Japanese", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.choices = ["a", "b", "c", "All of the above"];
      qs[1]!.choices = ["a", "b", "c", "上記のすべて"];
      qs[2]!.choices = ["a", "b", "c", "どれも当てはまらない"];
    });
    const warnings = validateBankText(text, rules).warnings.filter((w) => w.code === "choice.allOfTheAbove");
    expect(warnings.map((w) => w.question)).toEqual([1, 2, 3]);
  });

  it("flags choices or questions that refer to other choices by letter", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.choices = ["a", "b", "c", "Both A and B are correct"];
      qs[1]!.question = "Which is right: choice B or something else?";
      qs[2]!.choices = ["a", "b", "c", "AとBの両方が正しい"];
    });
    const { warnings } = validateBankText(text, rules);
    expect(warnings).toContainEqual({ code: "choice.refersToOthers", question: 1, params: { choice: "D" } });
    expect(warnings).toContainEqual({ code: "question.refersToChoices", question: 2 });
    expect(warnings).toContainEqual({ code: "choice.refersToOthers", question: 3, params: { choice: "D" } });
  });

  it("does not flag ordinary words that merely contain a letter", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.question = "Which option is used in a laboratory when working with acids?";
    });
    expect(codes(validateBankText(text, rules).warnings)).not.toContain("question.refersToChoices");
  });

  it("warns when one answer letter dominates", () => {
    const text = bankWith(60, (qs) => qs.forEach((q, i) => (q.answer = i < 40 ? "B" : "A")));
    expect(validateBankText(text, rules).warnings).toContainEqual({
      code: "bank.answerSkew",
      params: { letter: "B", percent: 67 },
    });
  });

  it("warns about repeated question text", () => {
    const text = bankWith(60, (qs) => (qs[5]!.question = qs[0]!.question));
    expect(validateBankText(text, rules).warnings).toContainEqual({
      code: "bank.duplicateQuestion",
      params: { questions: "1, 6" },
    });
  });

  it("warns about very short questions", () => {
    const text = bankWith(60, (qs) => (qs[0]!.question = "Why"));
    expect(validateBankText(text, rules).warnings).toContainEqual({ code: "question.textShort", question: 1 });
  });
});

describe("editing in the admin screen", () => {
  const info = { generator: null, generatedAt: null, source: null };
  const dtos = (): QuestionDto[] => makeQuestions(60).map(questionToDto);

  it("accepts questions as edited and produces a bank", () => {
    const result = validateEditedQuestions(dtos(), info, rules);
    expect(result.errors).toEqual([]);
    expect(result.bank?.questions).toHaveLength(60);
  });

  it("uses the same checks as an uploaded file", () => {
    const list = dtos();
    list[0]!.answerIndex = -1; // nothing selected
    list[1]!.choices = ["x", "x", "y", "z"];
    const { errors } = validateEditedQuestions(list, info, rules);
    expect(codes(errors)).toEqual(expect.arrayContaining(["answer.missing", "question.choicesDuplicate"]));
  });

  it("gives blank ids an automatic value", () => {
    const list = dtos();
    list[3]!.id = "  ";
    const ids = validateEditedQuestions(list, info, rules).bank?.questions.map((q) => q.id);
    expect(ids?.[3]).toBe("q004");
  });
});

describe("bankToExternal", () => {
  it("writes the documented file format and can be read back unchanged", () => {
    const first = validateBankText(bankWith(60, (qs) => (qs[0]!.explanation = "why")), rules).bank;
    expect(first).not.toBeNull();
    const external = bankToExternal(first!);
    expect(external.schema_version).toBe(1);
    const questions = external.questions as Record<string, unknown>[];
    expect(questions[0]).toMatchObject({ id: "q001", answer: "A", explanation: "why" });
    expect(typeof questions[0]?.answer).toBe("string");

    const second = validateBankText(JSON.stringify(external), rules);
    expect(second.errors).toEqual([]);
    expect(second.bank).toEqual(first);
  });

  it("uses letters A, B, C, ...", () => {
    expect([0, 1, 2, 7].map(letterOf)).toEqual(["A", "B", "C", "H"]);
  });
});

describe("case-study questions", () => {
  const supervisor = findTest(certification, "supervisor");
  if (!supervisor) throw new Error("supervisor test missing from config");
  const withCaseStudies = (perTest: number) => rulesFor(certification, supervisor, perTest);

  it("reads \"type\": \"case_study\" and counts them apart from the ordinary questions", () => {
    const result = validateBankText(makeBankJson(60, 4, {}, 5), withCaseStudies(3));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.summary).toMatchObject({ questionCount: 65, caseStudyCount: 5 });
    const kinds = result.bank!.questions.map((q) => q.kind);
    expect(kinds.filter((k) => k === "case_study")).toHaveLength(5);
    expect(result.bank!.questions.find((q) => q.id === "c001")?.kind).toBe("case_study");
    expect(result.bank!.questions.find((q) => q.id === "q001")?.kind).toBe("standard");
  });

  it("treats a question without \"type\" as an ordinary one and accepts spelling variants", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.type = "Case-Study";
      qs[1]!.type = "case study";
      qs[2]!.type = " STANDARD ";
    });
    const result = validateBankText(text, withCaseStudies(0));
    expect(result.errors).toEqual([]);
    expect(result.bank!.questions.slice(0, 4).map((q) => q.kind)).toEqual(["case_study", "case_study", "standard", "standard"]);
  });

  it("refuses an unknown type", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.type = "essay";
      qs[1]!.type = 7;
    });
    const result = validateBankText(text, withCaseStudies(0));
    expect(result.errors).toContainEqual({ code: "question.typeInvalid", question: 1, params: { value: "essay" } });
    expect(result.errors).toContainEqual({ code: "question.typeInvalid", question: 2, params: { value: "7" } });
    expect(result.bank).toBeNull();
  });

  it("counts only the ordinary questions towards the minimum and the expected size", () => {
    // a test of 30 questions with 3 case studies needs 27 ordinary questions
    const few = validateBankText(makeBankJson(26, 4, {}, 10), withCaseStudies(3));
    expect(few.errors).toContainEqual({ code: "bank.standardTooFew", params: { count: 26, required: 27 } });
    expect(validateBankText(makeBankJson(27, 4, {}, 10), withCaseStudies(3)).errors).toEqual([]);
    expect(validateBankText(makeBankJson(0, 4, {}, 30), withCaseStudies(30)).errors).toEqual([]); // case studies only
    const odd = validateBankText(makeBankJson(40, 4, {}, 10), withCaseStudies(3));
    expect(odd.errors).toEqual([]);
    expect(odd.warnings).toContainEqual({ code: "bank.standardSizeDiffers", params: { count: 40, expected: 60 } });
  });

  it("needs at least as many case studies as one test asks", () => {
    const short = validateBankText(makeBankJson(60, 4, {}, 2), withCaseStudies(3));
    expect(short.errors).toContainEqual({ code: "bank.caseStudyTooFew", params: { count: 2, required: 3 } });
    expect(short.bank).toBeNull();
    expect(validateBankText(makeBankJson(60, 4, {}, 3), withCaseStudies(3)).errors).toEqual([]);
    // no case studies are fine when none are asked ("0 questions" is allowed)
    expect(validateBankText(makeBankJson(60), withCaseStudies(0)).errors).toEqual([]);
  });

  it("only warns about case studies in the bank of a test that does not use them", () => {
    const result = validateBankText(makeBankJson(60, 4, {}, 4), rules);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual({ code: "bank.caseStudyUnused", params: { count: 4 } });
  });

  it("allows a longer text for a case study than for an ordinary question", () => {
    const text = bankWith(60, (qs) => {
      qs[0]!.type = "case_study";
      qs[0]!.question = "S".repeat(2500);
      qs[1]!.question = "S".repeat(2500);
    });
    const result = validateBankText(text, withCaseStudies(0));
    expect(result.errors).toEqual([{ code: "question.textTooLong", question: 2, params: { max: 1000 } }]);
  });

  it("keeps the type through editing and download", () => {
    const parsed = validateBankText(makeBankJson(60, 4, {}, 3), withCaseStudies(3));
    const dtos = parsed.bank!.questions.map(questionToDto);
    expect(dtos.filter((q) => q.kind === "case_study")).toHaveLength(3);
    const edited = validateEditedQuestions(dtos, parsed.bank!.info, withCaseStudies(3));
    expect(edited.errors).toEqual([]);
    expect(edited.bank!.questions.filter((q) => q.kind === "case_study")).toHaveLength(3);

    const external = bankToExternal(parsed.bank!) as { questions: Record<string, unknown>[] };
    expect(external.questions.filter((q) => q.type === "case_study")).toHaveLength(3);
    expect(external.questions.filter((q) => "type" in q)).toHaveLength(3); // ordinary questions stay unchanged
  });
});
