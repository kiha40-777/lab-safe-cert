"use client";

import { useMemo, useState } from "react";
import { DownloadIcon } from "@/components/ButtonIcons";
import { Notice } from "@/components/Notice";
import { certification } from "@/lib/config";
import { useI18n } from "@/lib/i18n/context";
import type { AdminOverview, MemberDto, MemberOverview, MemberTestStats } from "@/lib/types";
import { AttemptDialog, MemberAttemptsDialog } from "./AttemptDialogs";

type SortKey = "name" | "role" | "activity";

const normalize = (text: string) => text.normalize("NFKC").toLowerCase();

/** Progress of everybody: who has which role, how the tests went, and what needs attention. */
export function Dashboard({ overview, goto }: { overview: AdminOverview; goto: (hash: string) => void }) {
  const { t, compareNames, formatDateTime } = useI18n();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "name", direction: 1 });
  const [detail, setDetail] = useState<MemberDto | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  const selfRegistered = overview.members.filter((m) => m.selfRegistered).length;
  const tests = certification.tests;

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    const list = overview.members.filter(
      (m) => (roleFilter === "" || m.role === roleFilter) && (q === "" || normalize(m.name).includes(q)),
    );
    const compare = (a: MemberOverview, b: MemberOverview): number => {
      if (sort.key === "role") {
        return certification.roles.indexOf(a.role) - certification.roles.indexOf(b.role) || compareNames(a.name, b.name);
      }
      if (sort.key === "activity") {
        if (a.lastActivityAt === b.lastActivityAt) return compareNames(a.name, b.name);
        if (a.lastActivityAt === null) return 1; // people without activity go last
        if (b.lastActivityAt === null) return -1;
        return a.lastActivityAt < b.lastActivityAt ? -1 : 1;
      }
      return compareNames(a.name, b.name);
    };
    return [...list].sort((a, b) => compare(a, b) * sort.direction);
  }, [overview.members, query, roleFilter, sort, compareNames]);

  const sortHeader = (key: SortKey, label: string, rowSpan = 1) => (
    <th
      rowSpan={rowSpan}
      aria-sort={sort.key === key ? (sort.direction === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, direction: s.key === key && s.direction === 1 ? -1 : 1 }))}
      >
        {label}
        {sort.key === key ? (sort.direction === 1 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  const roleCount = (role: string) => overview.members.filter((m) => m.role === role).length;
  const statsOf = (member: MemberOverview, testId: string): MemberTestStats | undefined =>
    member.stats.find((s) => s.testId === testId);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div className="page-head-text">
          <h1>{t("admin.dashboard.title")}</h1>
        </div>
        <div className="page-head-actions">
          <a className="btn btn-sm" href="/api/admin/export?type=results" download>
            {t("admin.dashboard.exportResults")}
            <DownloadIcon />
          </a>
          <a className="btn btn-sm" href="/api/admin/export?type=attempts" download>
            {t("admin.dashboard.exportAttempts")}
            <DownloadIcon />
          </a>
        </div>
      </header>

      {selfRegistered > 0 ? (
        <Notice kind="warning">
          <div className="row-wrap">
            <span>{t("admin.dashboard.selfRegistered", { count: selfRegistered })}</span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" onClick={() => goto("members/review")}>
              {t("admin.dashboard.review")}
            </button>
          </div>
        </Notice>
      ) : null}

      <section aria-labelledby="people-heading" className="stack-sm">
        <h2 id="people-heading" className="small muted">
          {t("admin.dashboard.peopleByRole")}
        </h2>
        <div className="stats">
          {certification.roles.map((role) => (
            <div key={role} className="stat">
              <span className="stat-label">{t.dynamic("roles", role)}</span>
              <span className="stat-value">{t("common.people", { count: roleCount(role) })}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="stats">
        {overview.tests.map((info) => {
          const ready = info.ready;
          return (
            <section key={info.testId} className="stat" aria-labelledby={`test-${info.testId}`}>
              <div className="row-wrap">
                <h2 id={`test-${info.testId}`} style={{ fontSize: "0.9375rem" }}>
                  {t.dynamic("tests", `${info.testId}.name`)}
                </h2>
                <span className="spacer" />
                <span className={`badge ${ready ? "badge-success" : "badge-warning"}`}>
                  {ready ? t("admin.dashboard.ready") : t("admin.dashboard.notReady")}
                </span>
              </div>
              <p className="small muted">
                {info.bank ? t("common.questions", { count: info.questionCount }) : t("admin.dashboard.bankMissing")}
                {" / "}
                {info.material ? t("admin.dashboard.pdfUploaded") : t("admin.dashboard.pdfMissing")}
              </p>
              {info.caseStudyAvailable !== null ? (
                <p className="small muted">{t("admin.counts.available", { count: info.caseStudyAvailable })}</p>
              ) : null}
              <div>
                <button type="button" className="btn btn-sm" onClick={() => goto(`tests/${info.testId}`)}>
                  {t("admin.nav.tests")}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="stack" aria-label={t("admin.dashboard.title")}>
        <div className="row-wrap" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 14rem", maxWidth: "24rem" }}>
            <label htmlFor="member-search">{t("admin.dashboard.search")}</label>
            <input id="member-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="role-filter">{t("admin.dashboard.roleFilter")}</label>
            <select id="role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">{t("common.all")}</option>
              {certification.roles.map((role) => (
                <option key={role} value={role}>
                  {t.dynamic("roles", role)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {overview.members.length === 0 ? (
          <Notice kind="info">{t("admin.dashboard.noMembers")}</Notice>
        ) : (
          <div className="table-wrap">
            <table className="table table-sortable">
              <thead>
                <tr>
                  {sortHeader("name", t("common.name"), 2)}
                  {sortHeader("role", t("common.role"), 2)}
                  {tests.map((test) => (
                    <th key={test.id} colSpan={3} scope="colgroup">
                      {t.dynamic("tests", `${test.id}.name`)}
                    </th>
                  ))}
                  {sortHeader("activity", t("admin.dashboard.lastActivity"), 2)}
                  <th rowSpan={2}>
                    <span className="visually-hidden">{t("common.actions")}</span>
                  </th>
                </tr>
                <tr>
                  {tests.flatMap((test) => [
                    <th key={`${test.id}-a`} scope="col">
                      {t("admin.dashboard.attempts")}
                    </th>,
                    <th key={`${test.id}-b`} scope="col">
                      {t("admin.dashboard.best")}
                    </th>,
                    <th key={`${test.id}-l`} scope="col">
                      {t("admin.dashboard.last")}
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4 + tests.length * 3}>{t("admin.dashboard.noMatch")}</td>
                  </tr>
                ) : null}
                {rows.map((member) => (
                  <tr key={member.id}>
                    <th scope="row" style={{ fontWeight: 500 }}>
                      <button type="button" className="link-button" style={{ font: "inherit", textAlign: "left", color: "inherit" }} onClick={() => setDetail(member)}>
                        {member.name}
                      </button>
                      {member.selfRegistered ? (
                        <>
                          {" "}
                          <span className="badge badge-warning">{t("admin.members.selfRegistered")}</span>
                        </>
                      ) : null}
                    </th>
                    <td>
                      <span className="badge badge-info">{t.dynamic("roles", member.role)}</span>
                    </td>
                    {tests.flatMap((test) => {
                      const s = statsOf(member, test.id);
                      return [
                        <td key={`${test.id}-a`} className="num">
                          {s?.attempts ?? 0}
                        </td>,
                        <td key={`${test.id}-b`} className="num nowrap">
                          {s && s.bestScore !== null ? `${s.bestScore}/${s.bestTotal}` : "—"}
                        </td>,
                        <td key={`${test.id}-l`} className="nowrap">
                          {s && s.lastScore !== null ? (
                            <>
                              {s.lastScore}/{s.lastTotal}{" "}
                              <span className={`badge ${s.lastPassed ? "badge-success" : "badge-danger"}`}>
                                {s.lastPassed ? t("home.passed") : t("home.failed")}
                              </span>
                              {s.passedAt && !s.lastPassed ? (
                                <span className="small muted" title={t("admin.dashboard.passedAt", { date: formatDateTime(s.passedAt) })}>
                                  {" "}
                                  ✓
                                </span>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>,
                      ];
                    })}
                    <td className="small nowrap">{member.lastActivityAt ? formatDateTime(member.lastActivityAt) : "—"}</td>
                    <td>
                      <button type="button" className="btn btn-sm" onClick={() => setDetail(member)}>
                        {t("admin.dashboard.details")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack">
        <h2>{t("admin.dashboard.recent")}</h2>
        {overview.recentAttempts.length === 0 ? (
          <p className="muted">{t("admin.dashboard.noRecent")}</p>
        ) : (
          <ul className="rows">
            {overview.recentAttempts.map((attempt) => (
              <li key={attempt.id}>
                <span style={{ fontWeight: 500 }}>{attempt.memberName}</span>
                <span className="muted">
                  {t.dynamic("tests", `${attempt.testId}.name`)} / {attempt.score}/{attempt.total}
                </span>
                <span className={`badge ${attempt.passed ? "badge-success" : "badge-danger"}`}>
                  {attempt.passed ? t("home.passed") : t("home.failed")}
                </span>
                <span className="muted small">{attempt.submittedAt ? formatDateTime(attempt.submittedAt) : ""}</span>
                <span className="spacer" />
                <button type="button" className="btn btn-sm" onClick={() => setAttemptId(attempt.id)}>
                  {t("admin.dashboard.viewAttempt")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MemberAttemptsDialog member={detail} onClose={() => setDetail(null)} />
      <AttemptDialog attemptId={attemptId} onClose={() => setAttemptId(null)} />
    </div>
  );
}
