import { testForRole } from "@/lib/certification";
import { defaultCounts } from "@/lib/counts";
import type { MemberDto, ParticipantHome } from "@/lib/types";
import { type SessionRecord, setSessionMember } from "../auth/sessions";
import type { AppContext } from "../context";
import { conflict } from "../http/errors";
import { findActiveAttempt, listSubmittedAttempts } from "./attempts";
import { loadBankMetas } from "./banks";
import { isBankReady, loadAllCounts } from "./counts";
import { listMaterialInfos } from "./materials";
import { type MemberRow, createMember, findMemberRow, listMemberRows, requireMemberRow, toMemberDto } from "./members";

/** Everybody's name and role, for the "who are you?" drop-down. */
export async function listRoster(ctx: AppContext): Promise<MemberDto[]> {
  return (await listMemberRows(ctx.db)).map(toMemberDto);
}

/** The person this participant session is acting as (they must have picked their name first). */
export async function requireSessionMember(ctx: AppContext, session: SessionRecord | null): Promise<MemberRow> {
  if (!session?.memberId) throw conflict("memberNotSelected");
  const row = await findMemberRow(ctx.db, session.memberId);
  if (!row) throw conflict("memberNotSelected");
  return row;
}

export type IdentifyInput = { memberId: string } | { newName: string } | { clear: true };

/**
 * Picks who this session is: an existing person from the list, a new person who
 * typed their own name ("Other" -> registered as a candidate), or nobody (clear).
 */
export async function identify(
  ctx: AppContext,
  session: SessionRecord,
  input: IdentifyInput,
): Promise<MemberDto | null> {
  if ("clear" in input) {
    await setSessionMember(ctx, session.tokenHash, null);
    return null;
  }
  const row =
    "memberId" in input
      ? await requireMemberRow(ctx.db, input.memberId)
      : await createMember(ctx, { name: input.newName, selfRegistered: true });
  await setSessionMember(ctx, session.tokenHash, row.id);
  return toMemberDto(row);
}

/** What the participant's start screen needs: their role, which test is next, study PDFs, recent results. */
export async function getParticipantHome(ctx: AppContext, member: MemberRow): Promise<ParticipantHome> {
  const [banks, allCounts, materials, activeAttempt, recentAttempts] = await Promise.all([
    loadBankMetas(ctx.db),
    loadAllCounts(ctx.db, ctx.config),
    listMaterialInfos(ctx.db),
    findActiveAttempt(ctx, member.id),
    listSubmittedAttempts(ctx.db, member.id, 5),
  ]);
  const nextTestId = testForRole(ctx.config, member.role)?.id ?? null;
  return {
    member: toMemberDto(member),
    tests: ctx.config.tests.map((test) => {
      const counts = allCounts.get(test.id) ?? defaultCounts(test);
      const bank = banks.get(test.id);
      return {
        testId: test.id,
        ready: isBankReady(counts, { total: bank?.count ?? 0, caseStudy: bank?.caseStudyCount ?? 0 }),
        questionCount: counts.perTest,
        caseStudyCount: counts.caseStudyPerTest,
        material: materials.get(test.id) ?? null,
      };
    }),
    nextTestId,
    // An unfinished attempt only counts while the person still has the level that test is for
    // (an admin may have changed their level in the meantime).
    activeAttempt: activeAttempt && activeAttempt.testId === nextTestId ? activeAttempt : null,
    recentAttempts,
  };
}
