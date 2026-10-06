import { defaultCounts } from "@/lib/counts";
import type { AdminOverview, MemberOverview, MemberTestStats } from "@/lib/types";
import type { AppContext } from "../context";
import type { Db } from "../db/types";
import { SUMMARY_COLUMNS, type SummaryRow, toSummary } from "./attempts";
import { loadBankMetas } from "./banks";
import { isBankReady, loadAllCounts } from "./counts";
import { listMaterialInfos } from "./materials";
import { listMemberRows, toMemberDto } from "./members";

/** Every submitted attempt, oldest first (without the question snapshots). */
export async function loadSubmittedAttempts(db: Db): Promise<SummaryRow[]> {
  return db.all<SummaryRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM attempts WHERE status = 'submitted' ORDER BY submitted_at, id`,
  );
}

/** Statistics of one person for one test, from their submitted attempts (oldest first). */
export function statsFor(testId: string, attempts: SummaryRow[]): MemberTestStats {
  const last = attempts.at(-1);
  let best: SummaryRow | undefined;
  for (const attempt of attempts) {
    const ratio = (a: SummaryRow) => (a.score ?? 0) / (a.total || 1);
    if (!best || ratio(attempt) >= ratio(best)) best = attempt;
  }
  return {
    testId,
    attempts: attempts.length,
    bestScore: best?.score ?? null,
    bestTotal: best?.total ?? null,
    lastScore: last?.score ?? null,
    lastTotal: last?.total ?? null,
    lastPassed: last ? last.passed === 1 : null,
    lastAt: last?.submitted_at ?? null,
    passedAt: attempts.find((a) => a.passed === 1)?.submitted_at ?? null,
  };
}

/** Everything the admin dashboard shows: members with their progress, the state of each test, recent activity. */
export async function getAdminOverview(ctx: AppContext): Promise<AdminOverview> {
  const [memberRows, attempts, banks, allCounts, materials] = await Promise.all([
    listMemberRows(ctx.db),
    loadSubmittedAttempts(ctx.db),
    loadBankMetas(ctx.db),
    loadAllCounts(ctx.db, ctx.config),
    listMaterialInfos(ctx.db),
  ]);

  const byMember = new Map<string, SummaryRow[]>();
  for (const attempt of attempts) {
    const list = byMember.get(attempt.member_id) ?? [];
    list.push(attempt);
    byMember.set(attempt.member_id, list);
  }
  const names = new Map(memberRows.map((m) => [m.id, m.name]));

  const members: MemberOverview[] = memberRows.map((row) => {
    const own = byMember.get(row.id) ?? [];
    return {
      ...toMemberDto(row),
      createdAt: row.created_at,
      stats: ctx.config.tests.map((test) =>
        statsFor(
          test.id,
          own.filter((a) => a.test_id === test.id),
        ),
      ),
      lastActivityAt: own.at(-1)?.submitted_at ?? null,
    };
  });

  return {
    members,
    tests: ctx.config.tests.map((test) => {
      const bank = banks.get(test.id);
      const counts = allCounts.get(test.id) ?? defaultCounts(test);
      const caseStudy = bank?.caseStudyCount ?? 0;
      return {
        testId: test.id,
        questionCount: bank?.count ?? 0,
        ready: isBankReady(counts, { total: bank?.count ?? 0, caseStudy }),
        bank: bank?.meta ?? null,
        material: materials.get(test.id) ?? null,
        counts,
        caseStudyAvailable: test.caseStudy ? caseStudy : null,
      };
    }),
    recentAttempts: attempts
      .slice(-10)
      .reverse()
      .map((a) => ({ ...toSummary(a), memberId: a.member_id, memberName: names.get(a.member_id) ?? "?" })),
  };
}
