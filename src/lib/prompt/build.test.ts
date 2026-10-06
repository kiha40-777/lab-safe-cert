import { describe, expect, it } from "vitest";
import { validateBankText } from "@/server/bank/validate";
import { type PromptOptions, buildPrompt } from "./build";

const options = (extra: Partial<PromptOptions> = {}): PromptOptions => ({
  questionLanguage: "same",
  testName: "Participant Certification Test",
  questionCount: 60,
  choiceCount: 4,
  ...extra,
});

/** The JSON object shown as the example inside a prompt. */
function exampleOf(prompt: string): string {
  const start = prompt.indexOf("{\n");
  const end = prompt.lastIndexOf("\n}\n");
  return prompt.slice(start, end + 2);
}

const rules = (choices: number) => ({
  minQuestions: 1,
  expectedQuestions: 2,
  caseStudy: null,
  minChoices: 2,
  maxChoices: 6,
  preferredChoices: choices,
});

describe("buildPrompt", () => {
  it("asks for the configured number of questions and choices", () => {
    const prompt = buildPrompt(options());
    expect(prompt).toContain("exactly 60 multiple-choice questions");
    expect(prompt).toContain("exactly 4 choices");
    expect(prompt).toContain("Participant Certification Test");
    const other = buildPrompt(options({ testName: "Supervisor Certification Test", questionCount: 30, choiceCount: 5 }));
    expect(other).toContain("exactly 30 multiple-choice questions");
    expect(other).toContain("exactly 5 choices");
  });

  it("is written in English only, whatever language the questions are requested in", () => {
    for (const questionLanguage of ["same", "ja", "en"] as const) {
      expect(buildPrompt(options({ questionLanguage }))).not.toMatch(/[\u3000-\u30ff\u4e00-\u9fff]/);
    }
  });

  it("names the language of the questions", () => {
    expect(buildPrompt(options({ questionLanguage: "same" }))).toContain("in the same language as the PDF");
    expect(buildPrompt(options({ questionLanguage: "ja" }))).toContain("in Japanese");
    expect(buildPrompt(options({ questionLanguage: "en" }))).toContain("in English");
  });

  it("forbids inventing content and asks for checkable sources (responsible AI use)", () => {
    const prompt = buildPrompt(options());
    expect(prompt).toMatch(/ONLY the content of the attached PDF/);
    expect(prompt).toMatch(/do not invent facts/);
    expect(prompt).toMatch(/"source"/);
    expect(prompt).toMatch(/no Markdown code fence/);
  });

  it("asks for the JSON both as a file and as plain text", () => {
    const prompt = buildPrompt(options());
    expect(prompt).toContain('a downloadable file named "questions.json"');
    expect(prompt).toContain("As plain text");
    expect(prompt).toContain("in BOTH of these forms");
  });

  it("tells the AI to answer with a letter, never a number", () => {
    expect(buildPrompt(options())).toContain("Never use a number");
  });

  it("tells the AI not to write choices that break when shuffled", () => {
    expect(buildPrompt(options())).toContain('"all of the above"');
  });
});

describe("buildPrompt with case-study questions", () => {
  it("does not mention case studies when none are wanted", () => {
    for (const caseStudyCount of [undefined, 0]) {
      const prompt = buildPrompt(options({ caseStudyCount }));
      expect(prompt).not.toMatch(/case[- _]study/i);
      expect(prompt).not.toContain('"type"');
    }
  });

  it("asks for the total, made of the ordinary questions and the case studies (60 = 50 + 10)", () => {
    const prompt = buildPrompt(options({ questionCount: 50, caseStudyCount: 10 }));
    expect(prompt).toContain('exactly 60 multiple-choice questions in all: 50 "standard" questions');
    expect(prompt).toContain('and 10 case-study questions (described under "Case-study questions" below)');
    expect(prompt).toContain("The 60 questions are made of 50 standard questions and 10 case-study questions");
    expect(prompt).toContain('"type": "case_study"');
    expect(prompt).toContain("exactly 60 questions in all: 50 standard questions and 10 case-study questions");
  });

  it("says \"1 case-study question\", not \"1 case-study questions\"", () => {
    const prompt = buildPrompt(options({ questionCount: 3, caseStudyCount: 1 }));
    expect(prompt).toContain('exactly 4 multiple-choice questions in all: 3 "standard" questions');
    expect(prompt).toContain("and 1 case-study question (described");
    expect(prompt).toContain("The 4 questions are made of 3 standard questions and 1 case-study question.");
    expect(prompt).toContain("exactly 4 questions in all: 3 standard questions and 1 case-study question");
    expect(prompt).not.toMatch(/\b1 (case-study|standard|multiple-choice) questions\b/);
  });

  it("still forbids inventing content for case studies", () => {
    const prompt = buildPrompt(options({ caseStudyCount: 3 }));
    expect(prompt).toContain("every rule and fact that is needed to answer it must come from the PDF");
    expect(prompt).toContain("Do not invent rules, numbers, names or procedures");
  });

  it("is written in English only", () => {
    expect(buildPrompt(options({ caseStudyCount: 3, questionLanguage: "ja" }))).not.toMatch(/[\u3000-\u30ff\u4e00-\u9fff]/);
  });

  it("has an example that passes the checks, with one case study", () => {
    const example = exampleOf(buildPrompt(options({ caseStudyCount: 3 })));
    const result = validateBankText(example, { ...rules(4), caseStudy: { perTest: 1, expected: 1 } });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.bank?.questions.map((q) => q.kind)).toEqual(["standard", "standard", "case_study"]);
  });
});

describe("the JSON example inside the prompt", () => {
  for (const choiceCount of [2, 4, 6]) {
    it(`is valid JSON that passes the bank checks (${choiceCount} choices)`, () => {
      const example = exampleOf(buildPrompt(options({ choiceCount })));
      expect(() => JSON.parse(example)).not.toThrow();
      const result = validateBankText(example, rules(choiceCount));
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]); // no placeholder trips a heuristic warning
      expect(result.bank?.questions).toHaveLength(2);
      // the second example question uses the LAST letter for the configured choice count
      expect(result.bank?.questions[1]?.answerIndex).toBe(choiceCount - 1);
    });
  }
});
