import { type CertificationConfig, type TestConfig, findTest } from "@/lib/certification";
import { notFound } from "../http/errors";

/** The test with this id from the configuration, or a 404 error. */
export function requireTest(config: CertificationConfig, testId: string): TestConfig {
  const test = findTest(config, testId);
  if (!test) throw notFound("unknownTest");
  return test;
}
