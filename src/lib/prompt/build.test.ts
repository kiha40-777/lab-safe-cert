import { describe, expect, it } from "vitest";
import { validateBankText } from "@/server/bank/validate";
import { type PromptOptions, buildPrompt } from "./build";

const options = (extra: Partial<PromptOptions> = {}): PromptOptions => ({
  promptLanguage: "en",
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
  minChoices: 2,
  maxChoices: 6,
  preferredChoices: choices,
});

describe("buildPrompt", () => {
  it("asks for the configured number of questions and choices, in either language", () => {
    const en = buildPrompt(options());
    expect(en).toContain("exactly 60 multiple-choice questions");
    expect(en).toContain("exactly 4 choices");
    expect(en).toContain("Participant Certification Test");
    const ja = buildPrompt(options({ promptLanguage: "ja", testName: "実験参加者認定テスト", questionCount: 30, choiceCount: 5 }));
    expect(ja).toContain("ちょうど 30 問");
    expect(ja).toContain("選択肢はちょうど 5 個");
    expect(ja).toContain("実験参加者認定テスト");
  });

  it("names the language of the questions", () => {
    expect(buildPrompt(options({ questionLanguage: "same" }))).toContain("in the same language as the PDF");
    expect(buildPrompt(options({ questionLanguage: "ja" }))).toContain("in Japanese");
    expect(buildPrompt(options({ questionLanguage: "en" }))).toContain("in English");
    expect(buildPrompt(options({ promptLanguage: "ja", questionLanguage: "same" }))).toContain("PDF と同じ言語で書いてください");
    expect(buildPrompt(options({ promptLanguage: "ja", questionLanguage: "en" }))).toContain("英語で書いてください");
  });

  it("forbids inventing content and asks for checkable sources (responsible AI use)", () => {
    const en = buildPrompt(options());
    expect(en).toMatch(/ONLY the content of the attached PDF/);
    expect(en).toMatch(/do not invent facts/);
    expect(en).toMatch(/"source"/);
    expect(en).toMatch(/no Markdown code fence/);
    const ja = buildPrompt(options({ promptLanguage: "ja" }));
    expect(ja).toContain("創作したりしないでください");
    expect(ja).toContain("コードブロック記号は付けないでください");
  });

  it("tells the AI to answer with a letter, never a number", () => {
    expect(buildPrompt(options())).toContain('Never use a number');
    expect(buildPrompt(options({ promptLanguage: "ja" }))).toContain("数字は使わないでください");
  });

  it("tells the AI not to write choices that break when shuffled", () => {
    expect(buildPrompt(options())).toContain('"all of the above"');
    expect(buildPrompt(options({ promptLanguage: "ja" }))).toContain("上記のすべて");
  });
});

describe("the JSON example inside the prompt", () => {
  for (const promptLanguage of ["en", "ja"] as const) {
    for (const choiceCount of [2, 4, 6]) {
      it(`is valid JSON that passes the bank checks (${promptLanguage}, ${choiceCount} choices)`, () => {
        const prompt = buildPrompt(options({ promptLanguage, choiceCount }));
        const example = exampleOf(prompt);
        expect(() => JSON.parse(example)).not.toThrow();
        const result = validateBankText(example, rules(choiceCount));
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]); // no placeholder trips a heuristic warning
        expect(result.bank?.questions).toHaveLength(2);
        // the second example question uses the LAST letter for the configured choice count
        expect(result.bank?.questions[1]?.answerIndex).toBe(choiceCount - 1);
      });
    }
  }
});
