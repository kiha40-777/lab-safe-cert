import type { AppContext } from "../context";
import { loadSubmittedAttempts, getAdminOverview } from "./overview";
import { listMemberRows } from "./members";

/**
 * One CSV cell. Text that starts with = + - @ (or a tab/CR) is prefixed with an
 * apostrophe so spreadsheet programs show it as text instead of running it as a
 * formula (CSV injection). Values are quoted when they contain a comma, quote or line break.
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number | null)[][]): string {
  // BOM so that Excel opens the file as UTF-8 (needed for Japanese names)
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** One row per person: role and, for each test, the number of attempts, best/last score and dates. */
export async function resultsCsv(ctx: AppContext): Promise<string> {
  const overview = await getAdminOverview(ctx);
  const header: string[] = ["name", "role", "self_registered", "registered_at", "last_activity_at"];
  for (const test of ctx.config.tests) {
    header.push(
      `${test.id}_attempts`,
      `${test.id}_best`,
      `${test.id}_last`,
      `${test.id}_last_at`,
      `${test.id}_passed_at`,
    );
  }
  const rows: (string | number | null)[][] = [header];
  for (const member of overview.members) {
    const row: (string | number | null)[] = [
      member.name,
      member.role,
      member.selfRegistered ? "yes" : "no",
      member.createdAt,
      member.lastActivityAt,
    ];
    for (const test of ctx.config.tests) {
      const s = member.stats.find((x) => x.testId === test.id);
      row.push(
        s?.attempts ?? 0,
        s && s.bestScore !== null ? `${s.bestScore}/${s.bestTotal}` : null,
        s && s.lastScore !== null ? `${s.lastScore}/${s.lastTotal}` : null,
        s?.lastAt ?? null,
        s?.passedAt ?? null,
      );
    }
    rows.push(row);
  }
  return toCsv(rows);
}

/** One row per submitted attempt. */
export async function attemptsCsv(ctx: AppContext): Promise<string> {
  const [attempts, members] = await Promise.all([loadSubmittedAttempts(ctx.db), listMemberRows(ctx.db)]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const rows: (string | number | null)[][] = [
    ["name", "test", "submitted_at", "score", "total", "passed", "promoted_to"],
  ];
  for (const a of attempts) {
    rows.push([
      names.get(a.member_id) ?? "",
      a.test_id,
      a.submitted_at,
      a.score,
      a.total,
      a.passed === 1 ? "yes" : "no",
      a.promoted_to,
    ]);
  }
  return toCsv(rows);
}
