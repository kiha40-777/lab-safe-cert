"use client";

import type { ReactNode } from "react";
import { certification } from "@/lib/config";
import { useI18n } from "@/lib/i18n/context";

type IconName = "progress" | "members" | "tests" | "settings";

const ICONS: Record<IconName, ReactNode> = {
  progress: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.3c2.1.7 3.5 2.6 3.5 5.7" />
    </>
  ),
  tests: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="sidenav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

export type AdminTab = "dashboard" | "members" | "tests" | "settings";

/** The sections of the admin screen, down the left side. The tests are listed under "Tests and questions". */
export function AdminSidebar({
  tab,
  testId,
  pendingMembers,
}: {
  tab: AdminTab;
  /** id of the test that is open (only meaningful on the tests section) */
  testId: string;
  pendingMembers: number;
}) {
  const { t } = useI18n();

  return (
    <nav className="sidenav" aria-label={t("admin.nav.label")}>
      <ul>
        <li>
          <a className="sidenav-link" href="#dashboard" aria-current={tab === "dashboard" ? "page" : undefined}>
            <Icon name="progress" />
            {t("admin.nav.dashboard")}
          </a>
        </li>
        <li>
          <a className="sidenav-link" href="#members" aria-current={tab === "members" ? "page" : undefined}>
            <Icon name="members" />
            {t("admin.nav.members")}
            {pendingMembers > 0 ? <span className="badge badge-warning">{pendingMembers}</span> : null}
          </a>
        </li>
        <li className="sidenav-group" data-open={tab === "tests" ? "true" : undefined}>
          <span className="sidenav-heading">
            <Icon name="tests" />
            {t("admin.nav.tests")}
          </span>
          <ul>
            {certification.tests.map((test) => (
              <li key={test.id}>
                <a
                  className="sidenav-link sidenav-sub"
                  href={`#tests/${test.id}`}
                  aria-current={tab === "tests" && test.id === testId ? "page" : undefined}
                >
                  {t.dynamic("tests", `${test.id}.name`)}
                </a>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <a className="sidenav-link" href="#settings" aria-current={tab === "settings" ? "page" : undefined}>
            <Icon name="settings" />
            {t("admin.nav.settings")}
          </a>
        </li>
      </ul>
    </nav>
  );
}
