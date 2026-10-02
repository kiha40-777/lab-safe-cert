"use client";

import { Notice } from "@/components/Notice";
import { useI18n } from "@/lib/i18n/context";
import type { Issue } from "@/lib/types";

/** The findings of the question-bank check: problems (must fix), things to look at, and notes. */
export function IssueList({
  errors,
  warnings,
  infos,
}: {
  errors: Issue[];
  warnings: Issue[];
  infos: Issue[];
}) {
  const { t } = useI18n();

  const text = (issue: Issue) => {
    const message = t.dynamic("issues", issue.code, issue.params, issue.code);
    return issue.question === undefined ? message : t("admin.bank.questionIssue", { n: issue.question, message });
  };

  const group = (kind: "danger" | "warning" | "info", title: string, issues: Issue[]) =>
    issues.length === 0 ? null : (
      <Notice kind={kind}>
        <strong>{title}</strong>
        <ul>
          {issues.map((issue, i) => (
            <li key={i}>{text(issue)}</li>
          ))}
        </ul>
      </Notice>
    );

  return (
    <div className="stack-sm">
      {group("danger", t("admin.bank.resultErrors", { count: errors.length }), errors)}
      {group("warning", t("admin.bank.resultWarnings", { count: warnings.length }), warnings)}
      {group("info", t("admin.bank.resultInfos"), infos)}
    </div>
  );
}
