"use client";

import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { LogoutIcon } from "@/components/ButtonIcons";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Loading } from "@/components/Loading";
import { LoginForm } from "@/components/LoginForm";
import { api } from "@/lib/api";
import { findTest } from "@/lib/certification";
import { certification } from "@/lib/config";
import { useHash, useLoad, useUnauthorized } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/context";
import type { AdminOverview, AuthStatus } from "@/lib/types";
import { type AdminTab, AdminSidebar } from "./AdminSidebar";
import { Dashboard } from "./Dashboard";
import { MembersPanel } from "./MembersPanel";
import { SettingsPanel } from "./SettingsPanel";
import { TestsPanel } from "./TestsPanel";

const TABS: readonly AdminTab[] = ["dashboard", "members", "tests", "settings"];

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
            <LogoutIcon />
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
  const overview = useLoad(() => api.get<AdminOverview>("/api/admin/overview"));
  const hash = useHash();
  const [first = "", second = ""] = hash.split("/");
  const tab = TABS.find((name) => name === first) ?? "dashboard";

  // A new section starts at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, second]);

  const pending = overview.data?.members.filter((m) => m.selfRegistered).length ?? 0;
  // An unknown or missing test in the address means the first test.
  const test = findTest(certification, second) ?? certification.tests[0];

  return (
    <div className="admin-shell">
      <AdminSidebar tab={tab} testId={test?.id ?? ""} pendingMembers={pending} />
      <main id="main" className="admin-main stack-lg">
        <ErrorNotice error={overview.error} />
        {!overview.data && overview.loading ? <Loading /> : null}

        {overview.data ? (
          tab === "dashboard" ? (
            <Dashboard overview={overview.data} goto={goto} />
          ) : tab === "members" ? (
            <MembersPanel members={overview.data.members} reload={overview.reload} reviewOnly={second === "review"} goto={goto} />
          ) : tab === "tests" ? (
            <TestsPanel overview={overview.data} reload={overview.reload} selected={test?.id ?? ""} />
          ) : (
            <SettingsPanel />
          )
        ) : null}
      </main>
    </div>
  );
}
