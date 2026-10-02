"use client";

import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Loading } from "@/components/Loading";
import { LoginForm } from "@/components/LoginForm";
import { api } from "@/lib/api";
import { certification } from "@/lib/config";
import { useHash, useLoad, useUnauthorized } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { AdminOverview, AuthStatus } from "@/lib/types";
import { Dashboard } from "./Dashboard";
import { MembersPanel } from "./MembersPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TestsPanel } from "./TestsPanel";

const TABS = ["dashboard", "members", "tests", "settings"] as const;
type Tab = (typeof TABS)[number];

function goto(hash: string) {
  window.location.hash = hash;
}

/** The admin screen: password, then progress / members / tests and questions / settings. */
export function AdminApp() {
  const { t } = useI18n();
  const status = useLoad(() => api.get<AuthStatus>("/api/auth/status"));
  useUnauthorized(() => void status.reload());

  async function logout() {
    await api.post("/api/auth/logout", { scope: "admin" });
    await status.reload();
  }

  const s = status.data;
  return (
    <>
      <AppHeader admin>
        {s?.admin ? (
          <button type="button" className="btn btn-sm" onClick={() => void logout()}>
            {t("common.logout")}
          </button>
        ) : null}
      </AppHeader>
      {!s ? (
        <main id="main" className="container">
          {status.error ? <ErrorNotice error={status.error} /> : <Loading />}
        </main>
      ) : !s.admin ? (
        <LoginForm scope="admin" onLoggedIn={() => void status.reload()} />
      ) : (
        <AdminShell />
      )}
    </>
  );
}

function AdminShell() {
  const { t } = useI18n();
  const overview = useLoad(() => api.get<AdminOverview>("/api/admin/overview"));
  const hash = useHash();
  const [first = "", second = ""] = hash.split("/");
  const tab: Tab = (TABS as readonly string[]).includes(first) ? (first as Tab) : "dashboard";

  // A new section starts at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, second]);

  const tabLabel: Record<Tab, string> = {
    dashboard: t("admin.nav.dashboard"),
    members: t("admin.nav.members"),
    tests: t("admin.nav.tests"),
    settings: t("admin.nav.settings"),
  };
  const pending = overview.data?.members.filter((m) => m.selfRegistered).length ?? 0;

  return (
    <main id="main" className="container container-wide">
      <div className="stack-lg">
        <nav className="tabs" aria-label={t("admin.nav.label")}>
          {TABS.map((name) => (
            <a
              key={name}
              className="tab"
              href={name === "tests" ? `#tests/${certification.tests[0]?.id ?? ""}` : `#${name}`}
              aria-current={tab === name ? "page" : undefined}
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              {tabLabel[name]}
              {name === "members" && pending > 0 ? <span className="badge badge-warning">{pending}</span> : null}
            </a>
          ))}
        </nav>

        <ErrorNotice error={overview.error} />
        {!overview.data && overview.loading ? <Loading /> : null}

        {overview.data ? (
          tab === "dashboard" ? (
            <Dashboard overview={overview.data} goto={goto} />
          ) : tab === "members" ? (
            <MembersPanel members={overview.data.members} reload={overview.reload} reviewOnly={second === "review"} goto={goto} />
          ) : tab === "tests" ? (
            <TestsPanel overview={overview.data} reload={overview.reload} selected={second} />
          ) : (
            <SettingsPanel />
          )
        ) : null}
      </div>
    </main>
  );
}
