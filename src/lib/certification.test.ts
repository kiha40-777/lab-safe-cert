import { describe, expect, it } from "vitest";
import raw from "../../config/certification.json";
import { findTest, testForRole, validateCertificationConfig } from "./certification";

interface Loose {
  schemaVersion: unknown;
  roles: unknown[];
  defaultRole: unknown;
  questionBank: Record<string, unknown>;
  shuffle: Record<string, unknown>;
  tests: Record<string, unknown>[];
}

const clone = () => structuredClone(raw) as unknown as Loose;

describe("config/certification.json", () => {
  it("is valid and describes the two certification tests", () => {
    const config = validateCertificationConfig(raw);
    expect(config.roles).toEqual(["candidate", "participant", "supervisor"]);
    expect(config.tests.map((t) => t.id)).toEqual(["participant", "supervisor"]);
    for (const test of config.tests) {
      expect(test.questionsPerTest).toBe(30);
      expect(test.expectedBankSize).toBe(60);
      expect(test.passRate).toBe(1);
    }
  });

  it("allows case-study questions on the supervisor test only: 6 in the set of 60, 3 in a test of 30", () => {
    const config = validateCertificationConfig(raw);
    expect(findTest(config, "supervisor")?.caseStudy).toEqual({ bankSize: 6, perTest: 3 });
    expect(findTest(config, "participant")?.caseStudy).toBeUndefined();
  });

  it("finds tests by id and by the role that can take them", () => {
    const config = validateCertificationConfig(raw);
    expect(findTest(config, "supervisor")?.grantsRole).toBe("supervisor");
    expect(findTest(config, "nope")).toBeUndefined();
    expect(testForRole(config, "candidate")?.id).toBe("participant");
    expect(testForRole(config, "participant")?.id).toBe("supervisor");
    expect(testForRole(config, "supervisor")).toBeUndefined();
  });
});

describe("validateCertificationConfig", () => {
  const rejects = (change: (config: Loose) => void, message: RegExp) => {
    const config = clone();
    change(config);
    expect(() => validateCertificationConfig(config)).toThrow(message);
  };

  it("rejects input that is not an object", () => {
    expect(() => validateCertificationConfig([])).toThrow(/JSON object/);
    expect(() => validateCertificationConfig(null)).toThrow(/JSON object/);
  });

  it("rejects an unknown schema version", () => rejects((c) => (c.schemaVersion = 2), /schemaVersion/));
  it("rejects a default role that does not exist", () => rejects((c) => (c.defaultRole = "boss"), /defaultRole/));
  it("rejects duplicate roles", () => rejects((c) => c.roles.push("candidate"), /Duplicate role/));
  it("rejects invalid role ids", () => rejects((c) => c.roles.push("Bad Role"), /Invalid role id/));

  it("rejects a test that uses an unknown role", () =>
    rejects((c) => (c.tests[0]!.grantsRole = "ghost"), /grantsRole/));
  it("rejects a test that grants the role it requires", () =>
    rejects((c) => (c.tests[0]!.grantsRole = "candidate"), /must differ/));
  it("rejects a pass rate outside (0, 1]", () => {
    rejects((c) => (c.tests[0]!.passRate = 0), /passRate/);
    rejects((c) => (c.tests[0]!.passRate = 1.2), /passRate/);
  });
  it("rejects a non-positive question count", () => rejects((c) => (c.tests[0]!.questionsPerTest = 0), /questionsPerTest/));
  it("rejects a bank size smaller than the questions per test", () =>
    rejects((c) => (c.tests[0]!.expectedBankSize = 10), /questionsPerTest must not be larger than expectedBankSize/));
  it("accepts any bank size and test size that fit together", () => {
    const config = clone();
    config.tests[0]!.expectedBankSize = 200;
    config.tests[0]!.questionsPerTest = 20;
    const test = validateCertificationConfig(config).tests[0];
    expect([test?.expectedBankSize, test?.questionsPerTest]).toEqual([200, 20]);
  });
  it("rejects a malformed caseStudy setting", () => {
    rejects((c) => (c.tests[1]!.caseStudy = { bankSize: 5, perTest: 6 }), /perTest must not be larger/);
    rejects((c) => (c.tests[1]!.caseStudy = { bankSize: 50, perTest: 31 }), /perTest must not be larger than questionsPerTest/);
    rejects((c) => (c.tests[1]!.caseStudy = { bankSize: 61, perTest: 3 }), /caseStudy.bankSize must not be larger than expectedBankSize/);
    rejects((c) => (c.tests[1]!.caseStudy = { bankSize: 40, perTest: 3 }), /ordinary questions/);
    rejects((c) => (c.tests[1]!.caseStudy = { bankSize: 5, perTest: -1 }), /caseStudy/);
    rejects((c) => (c.tests[1]!.caseStudy = { bankSize: 2.5, perTest: 1 }), /caseStudy/);
    rejects((c) => (c.tests[1]!.caseStudy = "three"), /caseStudy/);
    rejects((c) => (c.tests[1]!.caseStudy = { perTest: 1 }), /caseStudy/);
  });
  it("accepts a case-study setting on any test", () => {
    const config = clone();
    config.tests[0]!.caseStudy = { bankSize: 10, perTest: 3 };
    expect(validateCertificationConfig(config).tests[0]?.caseStudy).toEqual({ bankSize: 10, perTest: 3 });
  });
  it("rejects duplicate test ids", () => rejects((c) => (c.tests[1]!.id = "participant"), /Duplicate test id/));

  it("rejects two tests that require the same role", () =>
    rejects((c) => (c.tests[1]!.requiresRole = "candidate"), /More than one test requires/));

  it("rejects a ladder that loops", () =>
    rejects((c) => (c.tests[1]!.grantsRole = "candidate"), /loop/));

  it("rejects inconsistent choice limits", () =>
    rejects((c) => (c.questionBank.preferredChoices = 9), /preferredChoices|minChoices/));

  it("reports every problem at once", () => {
    const config = clone();
    config.defaultRole = "boss";
    config.tests[0]!.passRate = 0;
    expect(() => validateCertificationConfig(config)).toThrow(/defaultRole[\s\S]*passRate/);
  });
});
