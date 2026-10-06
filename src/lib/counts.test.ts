import { describe, expect, it } from "vitest";
import raw from "../../config/certification.json";
import { findTest, validateCertificationConfig } from "./certification";
import { type TestCounts, checkCounts, defaultCounts, isCount, standardBankSize, standardPerTest } from "./counts";

const counts = (extra: Partial<TestCounts> = {}): TestCounts => ({
  bankSize: 60,
  perTest: 30,
  caseStudyBankSize: 6,
  caseStudyPerTest: 3,
  ...extra,
});

describe("the ordinary questions are what is left after the case studies", () => {
  it("e.g. 60 with 10 case studies leaves 50, and a test of 30 with 3 leaves 27", () => {
    expect(standardBankSize(counts({ caseStudyBankSize: 10 }))).toBe(50);
    expect(standardPerTest(counts())).toBe(27);
    expect(standardBankSize(counts({ caseStudyBankSize: 0, caseStudyPerTest: 0 }))).toBe(60);
  });
});

describe("defaultCounts", () => {
  it("are the numbers of the configuration file: 60 / 30, and 6 / 3 case studies for the supervisor test", () => {
    const config = validateCertificationConfig(raw);
    expect(defaultCounts(findTest(config, "participant")!)).toEqual({
      bankSize: 60,
      perTest: 30,
      caseStudyBankSize: 0,
      caseStudyPerTest: 0,
    });
    expect(defaultCounts(findTest(config, "supervisor")!)).toEqual(counts());
  });
});

describe("isCount", () => {
  it("accepts whole numbers in the range of each number and nothing else", () => {
    expect(isCount("bankSize", 60)).toBe(true);
    expect(isCount("bankSize", 0)).toBe(false); // a set has at least one question
    expect(isCount("perTest", 0)).toBe(false);
    expect(isCount("caseStudyBankSize", 0)).toBe(true);
    expect(isCount("perTest", 501)).toBe(false);
    expect(isCount("bankSize", 5001)).toBe(false);
    for (const bad of [1.5, "3", null, undefined, Number.NaN, -1]) expect(isCount("caseStudyPerTest", bad)).toBe(false);
  });
});

describe("checkCounts", () => {
  it("accepts numbers that fit together, with and without case studies", () => {
    expect(checkCounts(counts(), true)).toEqual([]);
    expect(checkCounts(counts({ caseStudyBankSize: 0, caseStudyPerTest: 0 }), true)).toEqual([]);
    expect(checkCounts(counts({ caseStudyBankSize: 0, caseStudyPerTest: 0 }), false)).toEqual([]);
    expect(checkCounts(counts({ perTest: 60, caseStudyPerTest: 6 }), true)).toEqual([]); // a test may ask the whole set
  });

  it("refuses to ask more than the set holds", () => {
    expect(checkCounts(counts({ perTest: 61 }), true)).toEqual(["perTestAboveBank"]);
  });

  it("refuses case studies that are not part of the totals", () => {
    expect(checkCounts(counts({ caseStudyBankSize: 61 }), true)).toContain("caseStudyBankAboveBank");
    expect(checkCounts(counts({ caseStudyPerTest: 31 }), true)).toContain("caseStudyPerTestAbovePerTest");
    expect(checkCounts(counts({ caseStudyBankSize: 2, caseStudyPerTest: 3 }), true)).toEqual(["caseStudyPerTestAboveBank"]);
  });

  it("refuses a set with too few ordinary questions for the ordinary part of a test", () => {
    // 20 ordinary questions in the set (60 - 40), but a test needs 27 (30 - 3)
    expect(checkCounts(counts({ caseStudyBankSize: 40 }), true)).toEqual(["ordinaryShort"]);
    expect(checkCounts(counts({ caseStudyBankSize: 33 }), true)).toEqual([]); // exactly 27
  });

  it("refuses case studies for a test that has none", () => {
    expect(checkCounts(counts(), false)).toEqual(["noCaseStudies"]);
    expect(checkCounts(counts({ caseStudyBankSize: 0, caseStudyPerTest: 1 }), false)).toContain("noCaseStudies");
  });
});
