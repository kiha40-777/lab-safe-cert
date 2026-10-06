import type { Issue, QuestionDto, QuestionKind, ValidationSummary } from "@/lib/types";
import type { Bank, BankInfo, BankRules, Question, ValidationOutcome } from "./types";

// ---------------------------------------------------------------------------
// Question-bank JSON format (see docs/QUESTION_FORMAT.md):
//
// {
//   "schema_version": 1,
//   "meta": { "generator": "...", "generated_at": "YYYY-MM-DD", "source": "..." },
//   "questions": [
//     { "id": "q001", "question": "...", "choices": ["...", "..."],
//       "answer": "B", "explanation": "...", "source": "p. 12" }
//   ]
// }
//
// A question may have "type": "case_study" (default "standard"): a situation described in the
// question text. Case studies are drawn separately and always asked after the ordinary questions.
//
// The correct answer is a LETTER (A = first choice, B = second, ...). Numbers
// are refused on purpose: 0-based vs 1-based would be ambiguous, and a silently
// misread answer key would mark correct answers as wrong.
// ---------------------------------------------------------------------------

export const LETTERS = "ABCDEFGH";
const MAX_QUESTION_CHARS = 1000;
/** A case study describes a situation first, so its text may be longer. */
const MAX_CASE_STUDY_CHARS = 3000;
const MAX_CHOICE_CHARS = 500;
const MAX_NOTE_CHARS = 1000;
const MAX_ISSUES_PER_CODE = 8;

export function letterOf(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shorten(value: string, max = 40): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/** Choices that stop making sense once the choices are shuffled ("all of the above"). */
const ALL_OF_THE_ABOVE = [
  /\b(all|none|both|neither)\s+of\s+the\s+(above|following|these)\b/i,
  /\ball\s+(the\s+)?above\b/i,
  /\bnone\s+of\s+(the\s+)?(above|these)\b/i,
  /(上記|以上|前述|右記|下記)\s*(の)?\s*(すべて|全て|いずれも|どれも|両方)/,
  /(どれ|いずれ)(も|に)\s*(当てはまらない|該当しない|正しくない|誤り)/,
  /すべて(当てはまる|正しい|誤り|該当する)/,
];

/** Text that points at other choices by letter/number, which breaks when they are shuffled. */
const REFERS_TO_CHOICES = [
  /\b(choice|option|answer)s?\s+\(?[A-H]\)?(?![a-z])/i,
  /選択肢\s*[（(]?\s*[A-HＡ-Ｈ1-8１-８]/,
  /\b[A-H]\s*(and|&|or|and\/or)\s*[A-H]\s+(are|is|both)\b/i,
  /[A-HＡ-Ｈ]\s*(と|および|及び|かつ)\s*[A-HＡ-Ｈ]\s*(の両方|の(いずれ|どちら)も|が(正しい|誤り))/,
];

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/** "standard" or "case_study"; also reads "case-study" and "Case Study". null when it is neither. */
function parseKind(value: unknown): QuestionKind | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "standard" || normalized === "case_study" ? normalized : null;
}

function parseAnswerLetter(value: string): number | null {
  const match = /^\s*([A-Za-z])\s*[.)]?\s*$/.exec(value);
  if (!match) return null;
  const index = LETTERS.indexOf((match[1] as string).toUpperCase());
  return index >= 0 ? index : null;
}

function readOptionalText(value: unknown, max: number): { value: string | null; tooLong: boolean; badType: boolean } {
  if (value === undefined || value === null) return { value: null, tooLong: false, badType: false };
  if (typeof value !== "string") return { value: null, tooLong: false, badType: true };
  const trimmed = value.trim();
  if (trimmed === "") return { value: null, tooLong: false, badType: false };
  if (trimmed.length > max) return { value: null, tooLong: true, badType: false };
  return { value: trimmed, tooLong: false, badType: false };
}

function readInfo(meta: unknown): BankInfo {
  const info: BankInfo = { generator: null, generatedAt: null, source: null };
  if (!isRecord(meta)) return info;
  const pick = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, 200) : null;
  info.generator = pick(meta.generator);
  info.generatedAt = pick(meta.generated_at);
  info.source = pick(meta.source);
  return info;
}

/** Keeps the first few issues of each kind and replaces the rest with one "and N more" marker. */
function capIssues(issues: Issue[]): Issue[] {
  const seen = new Map<string, number>();
  const kept: Issue[] = [];
  for (const issue of issues) {
    const count = (seen.get(issue.code) ?? 0) + 1;
    seen.set(issue.code, count);
    if (count <= MAX_ISSUES_PER_CODE) kept.push(issue);
  }
  for (const [code, count] of seen) {
    if (count > MAX_ISSUES_PER_CODE) {
      kept.push({ code: "omitted", params: { of: code, count: count - MAX_ISSUES_PER_CODE } });
    }
  }
  return kept;
}

interface Candidate {
  n: number;
  kind: QuestionKind;
  id: string | null;
  text: string;
  choices: string[];
  answerIndex: number;
  explanation: string | null;
  source: string | null;
}

/** Checks a parsed JSON value against the question-bank format and rules. */
export function validateBank(
  parsed: unknown,
  rules: BankRules,
  preInfos: Issue[] = [],
  preWarnings: Issue[] = [],
): ValidationOutcome {
  const errors: Issue[] = [];
  const warnings: Issue[] = [...preWarnings];
  const infos: Issue[] = [...preInfos];

  let rawQuestions: unknown[] = [];
  let info: BankInfo = { generator: null, generatedAt: null, source: null };

  if (Array.isArray(parsed)) {
    rawQuestions = parsed;
    infos.push({ code: "root.array" });
  } else if (isRecord(parsed)) {
    if (parsed.schema_version === undefined) {
      infos.push({ code: "schema.missing" });
    } else if (parsed.schema_version !== 1) {
      errors.push({
        code: "schema.unsupported",
        params: { version: shorten(String(parsed.schema_version), 20) },
      });
    }
    if (Array.isArray(parsed.questions)) rawQuestions = parsed.questions;
    else errors.push({ code: "questions.missing" });
    info = readInfo(parsed.meta);
  } else {
    errors.push({ code: "root.invalid" });
  }

  const candidates: Candidate[] = [];
  const explicitIds = new Map<string, number[]>();
  let standardInput = 0;
  let caseStudyInput = 0;

  for (const [i, item] of rawQuestions.entries()) {
    const n = i + 1;
    if (!isRecord(item)) {
      errors.push({ code: "question.notObject", question: n });
      continue;
    }
    const errorsBefore = errors.length;

    // kind: ordinary question or case study
    let kind: QuestionKind = "standard";
    if (item.type !== undefined && item.type !== null) {
      const parsedKind = parseKind(item.type);
      if (parsedKind === null) {
        errors.push({ code: "question.typeInvalid", question: n, params: { value: shorten(String(item.type), 30) } });
      } else {
        kind = parsedKind;
      }
    }
    if (kind === "case_study") caseStudyInput++;
    else standardInput++;

    // question text
    const maxTextChars = kind === "case_study" ? MAX_CASE_STUDY_CHARS : MAX_QUESTION_CHARS;
    let text: string | null = null;
    if (typeof item.question !== "string" || item.question.trim() === "") {
      errors.push({ code: "question.textMissing", question: n });
    } else {
      text = item.question.trim();
      if (text.length > maxTextChars) {
        errors.push({ code: "question.textTooLong", question: n, params: { max: maxTextChars } });
      } else if ([...text].length < 5) {
        warnings.push({ code: "question.textShort", question: n });
      }
    }

    // choices
    let choices: string[] | null = null;
    if (!Array.isArray(item.choices)) {
      errors.push({ code: "question.choicesMissing", question: n });
    } else {
      const list: string[] = [];
      let choicesOk = true;
      for (const [k, choice] of item.choices.entries()) {
        if (typeof choice !== "string" || choice.trim() === "") {
          errors.push({ code: "question.choiceEmpty", question: n, params: { choice: letterOf(k) } });
          choicesOk = false;
        } else if (choice.trim().length > MAX_CHOICE_CHARS) {
          errors.push({
            code: "question.choiceTooLong",
            question: n,
            params: { choice: letterOf(k), max: MAX_CHOICE_CHARS },
          });
          choicesOk = false;
        } else {
          list.push(choice.trim());
        }
      }
      if (choicesOk) {
        if (rules.minChoices === rules.maxChoices && list.length !== rules.minChoices) {
          errors.push({
            code: "question.choicesNotExact",
            question: n,
            params: { expected: rules.minChoices, count: list.length },
          });
        } else if (list.length < rules.minChoices) {
          errors.push({ code: "question.choicesTooFew", question: n, params: { min: rules.minChoices } });
        } else if (list.length > rules.maxChoices) {
          errors.push({ code: "question.choicesTooMany", question: n, params: { max: rules.maxChoices } });
        } else {
          choices = list;
          const firstAt = new Map<string, number>();
          for (const [k, choice] of list.entries()) {
            const key = choice.normalize("NFKC").toLowerCase();
            const earlier = firstAt.get(key);
            if (earlier !== undefined) {
              errors.push({
                code: "question.choicesDuplicate",
                question: n,
                params: { a: letterOf(earlier), b: letterOf(k) },
              });
            } else {
              firstAt.set(key, k);
            }
          }
          if (list.length !== rules.preferredChoices) {
            warnings.push({
              code: "question.choiceCountDiffers",
              question: n,
              params: { count: list.length, expected: rules.preferredChoices },
            });
          }
          for (const [k, choice] of list.entries()) {
            if (matchesAny(ALL_OF_THE_ABOVE, choice)) {
              warnings.push({ code: "choice.allOfTheAbove", question: n, params: { choice: letterOf(k) } });
            }
            if (matchesAny(REFERS_TO_CHOICES, choice)) {
              warnings.push({ code: "choice.refersToOthers", question: n, params: { choice: letterOf(k) } });
            }
          }
          if (text !== null && matchesAny(REFERS_TO_CHOICES, text)) {
            warnings.push({ code: "question.refersToChoices", question: n });
          }
        }
      }
    }

    // correct answer
    let answerIndex: number | null = null;
    const answer = item.answer;
    if (answer === undefined || answer === null || (typeof answer === "string" && answer.trim() === "")) {
      errors.push({ code: "answer.missing", question: n });
    } else if (typeof answer === "number") {
      errors.push({ code: "answer.isNumber", question: n, params: { value: answer } });
    } else if (typeof answer !== "string") {
      errors.push({ code: "answer.invalid", question: n, params: { value: shorten(JSON.stringify(answer)) } });
    } else {
      const index = parseAnswerLetter(answer);
      if (index === null) {
        errors.push({ code: "answer.invalid", question: n, params: { value: shorten(answer) } });
      } else if (choices !== null && index >= choices.length) {
        errors.push({
          code: "answer.outOfRange",
          question: n,
          params: { letter: letterOf(index), count: choices.length },
        });
      } else {
        answerIndex = index;
      }
    }

    // optional fields
    const explanation = readOptionalText(item.explanation, MAX_NOTE_CHARS);
    if (explanation.badType || explanation.tooLong) {
      errors.push({ code: "question.noteInvalid", question: n, params: { field: "explanation", max: MAX_NOTE_CHARS } });
    }
    const source = readOptionalText(item.source, MAX_NOTE_CHARS);
    if (source.badType || source.tooLong) {
      errors.push({ code: "question.noteInvalid", question: n, params: { field: "source", max: MAX_NOTE_CHARS } });
    }

    // id
    let id: string | null = null;
    if (typeof item.id === "string" && item.id.trim() !== "") id = item.id.trim().slice(0, 64);
    else if (typeof item.id === "number" && Number.isFinite(item.id)) id = String(item.id);
    if (id !== null) {
      const list = explicitIds.get(id) ?? [];
      list.push(n);
      explicitIds.set(id, list);
    }

    if (errors.length === errorsBefore && text !== null && choices !== null && answerIndex !== null) {
      candidates.push({
        n,
        kind,
        id,
        text,
        choices,
        answerIndex,
        explanation: explanation.value,
        source: source.value,
      });
    }
  }

  for (const [id, numbers] of explicitIds) {
    if (numbers.length > 1) {
      errors.push({ code: "bank.duplicateId", params: { id: shorten(id, 30), questions: numbers.join(", ") } });
    }
  }

  // bank-level checks
  const inputCount = rawQuestions.length;
  if (Array.isArray(parsed) || (isRecord(parsed) && Array.isArray(parsed.questions))) {
    // The ordinary questions are counted on their own: case studies are drawn separately.
    const withCaseStudies = rules.caseStudy !== null;
    if (inputCount === 0) {
      errors.push({ code: "bank.empty" });
    } else {
      if (standardInput < rules.minQuestions) {
        errors.push({
          code: withCaseStudies ? "bank.standardTooFew" : "bank.tooFew",
          params: { count: standardInput, required: rules.minQuestions },
        });
      } else if (standardInput !== rules.expectedQuestions) {
        warnings.push({
          code: withCaseStudies ? "bank.standardSizeDiffers" : "bank.sizeDiffers",
          params: { count: standardInput, expected: rules.expectedQuestions },
        });
      }
      if (rules.caseStudy !== null) {
        if (caseStudyInput < rules.caseStudy.perTest) {
          errors.push({
            code: "bank.caseStudyTooFew",
            params: { count: caseStudyInput, required: rules.caseStudy.perTest },
          });
        } else if (caseStudyInput !== rules.caseStudy.expected) {
          warnings.push({
            code: "bank.caseStudySizeDiffers",
            params: { count: caseStudyInput, expected: rules.caseStudy.expected },
          });
        }
      } else if (caseStudyInput > 0) {
        warnings.push({ code: "bank.caseStudyUnused", params: { count: caseStudyInput } });
      }
    }
  }

  const byText = new Map<string, number[]>();
  for (const c of candidates) {
    const key = c.text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    const list = byText.get(key) ?? [];
    list.push(c.n);
    byText.set(key, list);
  }
  for (const numbers of byText.values()) {
    if (numbers.length > 1) {
      warnings.push({ code: "bank.duplicateQuestion", params: { questions: numbers.join(", ") } });
    }
  }

  const answerDistribution: Record<string, number> = {};
  const choiceCounts: Record<string, number> = {};
  for (const c of candidates) {
    const letter = letterOf(c.answerIndex);
    answerDistribution[letter] = (answerDistribution[letter] ?? 0) + 1;
    const count = String(c.choices.length);
    choiceCounts[count] = (choiceCounts[count] ?? 0) + 1;
  }
  if (candidates.length >= 20) {
    for (const [letter, count] of Object.entries(answerDistribution)) {
      const share = count / candidates.length;
      if (share > 0.5) {
        warnings.push({ code: "bank.answerSkew", params: { letter, percent: Math.round(share * 100) } });
      }
    }
  }

  const summary: ValidationSummary | null =
    candidates.length > 0
      ? {
          questionCount: candidates.length,
          caseStudyCount: candidates.filter((c) => c.kind === "case_study").length,
          choiceCounts,
          answerDistribution,
        }
      : null;

  if (errors.length > 0) {
    return { errors: capIssues(errors), warnings: capIssues(warnings), infos, bank: null, summary };
  }

  // assign ids to questions that have none (q001, q002, ...), avoiding collisions
  const taken = new Set(explicitIds.keys());
  const questions: Question[] = candidates.map((c) => {
    let id = c.id;
    if (id === null) {
      let candidate = `q${String(c.n).padStart(3, "0")}`;
      let suffix = 2;
      while (taken.has(candidate)) candidate = `q${String(c.n).padStart(3, "0")}-${suffix++}`;
      taken.add(candidate);
      id = candidate;
    }
    return {
      id,
      kind: c.kind,
      text: c.text,
      choices: c.choices,
      answerIndex: c.answerIndex,
      explanation: c.explanation,
      source: c.source,
    };
  });

  return { errors: [], warnings: capIssues(warnings), infos, bank: { info, questions }, summary };
}

function extractJsonRegion(text: string): string | null {
  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const starts = [firstObject, firstArray].filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const closer = text[start] === "{" ? "}" : "]";
  const end = text.lastIndexOf(closer);
  return end > start ? text.slice(start, end + 1) : null;
}

function describeSyntaxError(error: unknown): Issue {
  const message = error instanceof Error ? error.message : String(error);
  const params: Record<string, string | number> = { message: shorten(message, 160) };
  const lineColumn = /line (\d+) column (\d+)/.exec(message);
  if (lineColumn) {
    params.line = Number(lineColumn[1]);
    params.column = Number(lineColumn[2]);
  } else {
    const position = /position (\d+)/.exec(message);
    if (position) params.position = Number(position[1]);
  }
  return { code: "json.syntax", params };
}

/**
 * Checks the text of a question-bank file. Tolerates what chat AIs like to add:
 * a byte-order mark, a ```json code fence, or a sentence before/after the JSON.
 */
export function validateBankText(text: string, rules: BankRules): ValidationOutcome {
  const infos: Issue[] = [];
  const warnings: Issue[] = [];
  let source = text.replace(/^﻿/, "").trim();
  if (source === "") {
    return { errors: [{ code: "json.empty" }], warnings, infos, bank: null, summary: null };
  }

  const fenced = /^```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```\s*$/.exec(source);
  if (fenced) {
    source = (fenced[1] as string).trim();
    infos.push({ code: "input.fenceStripped" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const region = extractJsonRegion(source);
    let recovered = false;
    if (region !== null && region !== source) {
      try {
        parsed = JSON.parse(region);
        warnings.push({ code: "input.extraTextIgnored" });
        recovered = true;
      } catch {
        // fall through to the syntax error of the original text
      }
    }
    if (!recovered) {
      return { errors: [describeSyntaxError(error)], warnings, infos, bank: null, summary: null };
    }
  }
  return validateBank(parsed, rules, infos, warnings);
}

// ------------------------------------------------------- editor <-> stored form

export function questionToDto(question: Question): QuestionDto {
  return {
    id: question.id,
    kind: question.kind,
    text: question.text,
    choices: [...question.choices],
    answerIndex: question.answerIndex,
    explanation: question.explanation ?? "",
    source: question.source ?? "",
  };
}

/** Runs questions edited in the admin screen through the same checks as an uploaded file. */
export function validateEditedQuestions(
  questions: QuestionDto[],
  info: BankInfo,
  rules: BankRules,
): ValidationOutcome {
  const raw = {
    schema_version: 1,
    meta: { generator: info.generator, generated_at: info.generatedAt, source: info.source },
    questions: questions.map((q) => ({
      id: q.id.trim() === "" ? undefined : q.id,
      type: q.kind === "case_study" ? "case_study" : undefined,
      question: q.text,
      choices: q.choices,
      answer: q.answerIndex >= 0 ? letterOf(q.answerIndex) : undefined,
      explanation: q.explanation.trim() === "" ? undefined : q.explanation,
      source: q.source.trim() === "" ? undefined : q.source,
    })),
  };
  return validateBank(raw, rules);
}

/** The bank in the documented JSON file format (letters for answers), e.g. for download. */
export function bankToExternal(bank: Bank): Record<string, unknown> {
  return {
    schema_version: 1,
    meta: {
      ...(bank.info.generator ? { generator: bank.info.generator } : {}),
      ...(bank.info.generatedAt ? { generated_at: bank.info.generatedAt } : {}),
      ...(bank.info.source ? { source: bank.info.source } : {}),
    },
    questions: bank.questions.map((q) => ({
      id: q.id,
      ...(q.kind === "case_study" ? { type: "case_study" } : {}),
      question: q.text,
      choices: q.choices,
      answer: letterOf(q.answerIndex),
      ...(q.explanation ? { explanation: q.explanation } : {}),
      ...(q.source ? { source: q.source } : {}),
    })),
  };
}
