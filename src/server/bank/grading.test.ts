import { describe, expect, it } from "vitest";
import { makeQuestions, seededRng } from "../test-utils";
import { drawAttempt, drawQuestions, gradeAnswers, requiredScore } from "./grading";

const both = { shuffleQuestions: true, shuffleChoices: true };

describe("drawQuestions", () => {
  const bank = makeQuestions(60);

  it("draws the requested number of different questions", () => {
    const drawn = drawQuestions(bank, 30, both, seededRng(1));
    expect(drawn).toHaveLength(30);
    expect(new Set(drawn.map((q) => q.id)).size).toBe(30);
  });

  it("keeps the correct answer attached to the right choice after shuffling", () => {
    const byId = new Map(bank.map((q) => [q.id, q]));
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const drawn of drawQuestions(bank, 30, both, seededRng(seed))) {
        const original = byId.get(drawn.id);
        expect(original).toBeDefined();
        expect(drawn.choices[drawn.answerIndex]).toBe(original!.choices[original!.answerIndex]);
        expect([...drawn.choices].sort()).toEqual([...original!.choices].sort());
      }
    }
  });

  it("really changes the order of questions and choices", () => {
    const drawn = drawQuestions(bank, 30, both, seededRng(7));
    const ids = drawn.map((q) => q.id);
    expect(ids).not.toEqual([...ids].sort());
    expect(drawn.some((q) => q.choices[0] !== q.choices.slice().sort()[0])).toBe(true);
  });

  it("gives different draws for different random seeds, and the same draw for the same seed", () => {
    const a = drawQuestions(bank, 30, both, seededRng(10)).map((q) => q.id);
    const b = drawQuestions(bank, 30, both, seededRng(11)).map((q) => q.id);
    const again = drawQuestions(bank, 30, both, seededRng(10)).map((q) => q.id);
    expect(a).not.toEqual(b);
    expect(a).toEqual(again);
  });

  it("selects every question about equally often", () => {
    const rng = seededRng(99);
    const counts = new Map<string, number>();
    const rounds = 3000;
    for (let i = 0; i < rounds; i++) {
      for (const q of drawQuestions(bank, 30, both, rng)) counts.set(q.id, (counts.get(q.id) ?? 0) + 1);
    }
    // each question is expected in half of the draws: 1500 of 3000
    for (const count of counts.values()) expect(Math.abs(count - rounds / 2)).toBeLessThan(200);
    expect(counts.size).toBe(60);
  });

  it("puts the correct answer at every position about equally often", () => {
    const rng = seededRng(5);
    const positions = [0, 0, 0, 0];
    for (let i = 0; i < 500; i++) {
      for (const q of drawQuestions(bank, 30, both, rng)) positions[q.answerIndex]!++;
    }
    const total = positions.reduce((a, b) => a + b, 0);
    for (const count of positions) expect(Math.abs(count / total - 0.25)).toBeLessThan(0.03);
  });

  it("keeps bank order when question shuffling is switched off", () => {
    const drawn = drawQuestions(bank, 30, { shuffleQuestions: false, shuffleChoices: true }, seededRng(3));
    const ids = drawn.map((q) => q.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("keeps the choice order when choice shuffling is switched off", () => {
    const drawn = drawQuestions(bank, 30, { shuffleQuestions: true, shuffleChoices: false }, seededRng(3));
    const byId = new Map(bank.map((q) => [q.id, q]));
    for (const q of drawn) {
      expect(q.choices).toEqual(byId.get(q.id)!.choices);
      expect(q.answerIndex).toBe(byId.get(q.id)!.answerIndex);
    }
  });

  it("refuses to draw more questions than the bank holds", () => {
    expect(() => drawQuestions(bank.slice(0, 10), 30, both, seededRng(1))).toThrow(RangeError);
    expect(() => drawQuestions(bank, 0, both, seededRng(1))).toThrow(RangeError);
  });

  it("does not change the bank it draws from", () => {
    const before = JSON.stringify(bank);
    drawQuestions(bank, 30, both, seededRng(1));
    expect(JSON.stringify(bank)).toBe(before);
  });
});

describe("requiredScore", () => {
  it("needs every answer when the pass rate is 100%", () => {
    expect(requiredScore(30, 1)).toBe(30);
  });

  it("rounds up and is not thrown off by floating point error", () => {
    expect(requiredScore(30, 0.9)).toBe(27);
    expect(requiredScore(10, 0.7)).toBe(7); // 0.7 * 10 = 7.000000000000001 in floating point
    expect(requiredScore(30, 0.8)).toBe(24);
    expect(requiredScore(7, 0.5)).toBe(4);
    expect(requiredScore(3, 0.01)).toBe(1);
  });
});

describe("gradeAnswers", () => {
  const questions = drawQuestions(makeQuestions(10), 10, { shuffleQuestions: false, shuffleChoices: false }, seededRng(1));
  const perfect = questions.map((q) => q.answerIndex);

  it("passes when everything is right", () => {
    const grade = gradeAnswers(questions, perfect, 1);
    expect(grade).toMatchObject({ score: 10, total: 10, passed: true });
    expect(grade.correct.every(Boolean)).toBe(true);
  });

  it("fails on a single wrong answer at 100%", () => {
    const answers = [...perfect];
    answers[3] = (answers[3]! + 1) % 4;
    expect(gradeAnswers(questions, answers, 1)).toMatchObject({ score: 9, passed: false });
  });

  it("counts unanswered questions as wrong", () => {
    const answers: (number | null)[] = [...perfect];
    answers[0] = null;
    const grade = gradeAnswers(questions, answers, 1);
    expect(grade.score).toBe(9);
    expect(grade.correct[0]).toBe(false);
    expect(grade.passed).toBe(false);
  });

  it("applies a lower pass rate", () => {
    const answers = perfect.map((a, i) => (i < 2 ? (a + 1) % 4 : a)); // 8 of 10 right
    expect(gradeAnswers(questions, answers, 0.8).passed).toBe(true);
    expect(gradeAnswers(questions, answers, 0.9).passed).toBe(false);
  });

  it("never passes an empty test", () => {
    expect(gradeAnswers([], [], 1).passed).toBe(false);
  });
});

describe("drawAttempt", () => {
  const bank = [...makeQuestions(60), ...makeQuestions(10, 4, "case_study")];
  const plan = { standard: 27, caseStudy: 3 };

  it("draws the ordinary questions first and the case studies last, all together", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const drawn = drawAttempt(bank, plan, both, seededRng(seed));
      expect(drawn).toHaveLength(30);
      expect(drawn.slice(0, 27).every((q) => q.kind === "standard")).toBe(true);
      expect(drawn.slice(27).every((q) => q.kind === "case_study")).toBe(true);
      expect(new Set(drawn.map((q) => q.id)).size).toBe(30);
    }
  });

  it("keeps the case studies last when the question order is not shuffled", () => {
    const drawn = drawAttempt(bank, plan, { shuffleQuestions: false, shuffleChoices: true }, seededRng(3));
    expect(drawn.map((q) => q.kind)).toEqual([...Array(27).fill("standard"), ...Array(3).fill("case_study")]);
    const ids = (kind: string) => drawn.filter((q) => q.kind === kind).map((q) => q.id);
    expect(ids("standard")).toEqual([...ids("standard")].sort());
    expect(ids("case_study")).toEqual([...ids("case_study")].sort());
  });

  it("chooses the case studies at random: every one is picked, in changing order", () => {
    const rng = seededRng(21);
    const seen = new Map<string, number>();
    const firstPlaces = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const drawn = drawAttempt(bank, plan, both, rng).slice(27);
      firstPlaces.add(drawn[0]!.id);
      for (const q of drawn) seen.set(q.id, (seen.get(q.id) ?? 0) + 1);
    }
    expect(seen.size).toBe(10);
    // each of the 10 case studies is expected in 3 of 10 draws, i.e. about 120 of 400
    for (const count of seen.values()) expect(Math.abs(count - 120)).toBeLessThan(45);
    expect(firstPlaces.size).toBeGreaterThan(5);
  });

  it("keeps the correct answer attached to the right choice of a case study", () => {
    const byId = new Map(bank.map((q) => [q.id, q]));
    for (const q of drawAttempt(bank, plan, both, seededRng(9)).slice(27)) {
      const original = byId.get(q.id)!;
      expect(q.choices[q.answerIndex]).toBe(original.choices[original.answerIndex]);
    }
  });

  it("asks no case studies when none are wanted, even if the bank has some", () => {
    const drawn = drawAttempt(bank, { standard: 30, caseStudy: 0 }, both, seededRng(4));
    expect(drawn).toHaveLength(30);
    expect(drawn.every((q) => q.kind === "standard")).toBe(true);
  });

  it("can draw case studies only", () => {
    const drawn = drawAttempt(bank, { standard: 0, caseStudy: 10 }, both, seededRng(2));
    expect(drawn).toHaveLength(10);
    expect(drawn.every((q) => q.kind === "case_study")).toBe(true);
  });

  it("draws ordinary questions exactly as before when the bank has no case studies", () => {
    const plain = makeQuestions(60);
    expect(drawAttempt(plain, { standard: 30, caseStudy: 0 }, both, seededRng(5))).toEqual(
      drawQuestions(plain, 30, both, seededRng(5)),
    );
  });

  it("refuses when the bank has too few case studies or ordinary questions", () => {
    expect(() => drawAttempt(bank, { standard: 30, caseStudy: 11 }, both, seededRng(1))).toThrow(RangeError);
    expect(() => drawAttempt(bank, { standard: 61, caseStudy: 0 }, both, seededRng(1))).toThrow(RangeError);
  });
});
