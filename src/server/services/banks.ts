import type { CertificationConfig, TestConfig } from "@/lib/certification";
import type { BankMetaDto } from "@/lib/types";
import type { Bank, BankRules, Question } from "../bank/types";
import type { AppContext } from "../context";
import type { Db, Row } from "../db/types";
import { badRequest } from "../http/errors";

/** The limits a test's question bank is checked against, derived from the certification config. */
export function rulesFor(config: CertificationConfig, test: TestConfig): BankRules {
  return {
    minQuestions: test.questionsPerTest,
    expectedQuestions: test.expectedBankSize,
    minChoices: config.questionBank.minChoices,
    maxChoices: config.questionBank.maxChoices,
    preferredChoices: config.questionBank.preferredChoices,
  };
}

interface BankRow extends Row {
  test_id: string;
  questions_json: string;
  meta_json: string;
  question_count: number;
}

export interface StoredBank {
  questions: Question[];
  meta: BankMetaDto;
}

function parseRow(row: BankRow): StoredBank {
  return {
    questions: JSON.parse(row.questions_json) as Question[],
    meta: JSON.parse(row.meta_json) as BankMetaDto,
  };
}

export async function loadBank(db: Db, testId: string): Promise<StoredBank | null> {
  const row = await db.get<BankRow>(
    "SELECT test_id, questions_json, meta_json, question_count FROM banks WHERE test_id = ?",
    [testId],
  );
  return row ? parseRow(row) : null;
}

/** Question counts and metadata of every stored bank, without loading the questions. */
export async function loadBankMetas(db: Db): Promise<Map<string, { count: number; meta: BankMetaDto }>> {
  const rows = await db.all<{ test_id: string; meta_json: string; question_count: number }>(
    "SELECT test_id, meta_json, question_count FROM banks",
  );
  return new Map(
    rows.map((r) => [r.test_id, { count: r.question_count, meta: JSON.parse(r.meta_json) as BankMetaDto }]),
  );
}

export type SaveMode = { kind: "import" | "edit"; reviewConfirmed: boolean };

/**
 * Stores the (already validated) bank as the active one for the test.
 * Every save, whether of freshly imported questions or of edits to the stored
 * bank, must be confirmed as reviewed by a person.
 */
export async function saveBank(
  ctx: AppContext,
  testId: string,
  bank: Bank,
  mode: SaveMode,
): Promise<BankMetaDto> {
  return ctx.db.transaction(async (tx) => {
    const existing = await loadBank(tx, testId);
    if (!mode.reviewConfirmed) throw badRequest("reviewNotConfirmed");
    const now = ctx.now().toISOString();
    const meta: BankMetaDto = {
      generator: bank.info.generator,
      generatedAt: bank.info.generatedAt,
      source: bank.info.source,
      importedAt: mode.kind === "import" ? now : (existing?.meta.importedAt ?? now),
      updatedAt: now,
      reviewConfirmedAt: now,
    };
    await tx.run(
      `INSERT INTO banks (test_id, questions_json, meta_json, question_count, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(test_id) DO UPDATE SET
         questions_json = excluded.questions_json, meta_json = excluded.meta_json,
         question_count = excluded.question_count, updated_at = excluded.updated_at`,
      [testId, JSON.stringify(bank.questions), JSON.stringify(meta), bank.questions.length, now],
    );
    return meta;
  });
}
