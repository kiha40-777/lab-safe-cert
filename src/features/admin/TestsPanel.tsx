"use client";

import { useState } from "react";
import { findTest } from "@/lib/certification";
import { certification } from "@/lib/config";
import { useI18n } from "@/lib/i18n/context";
import type { AdminOverview } from "@/lib/types";
import { BankEditor } from "./BankEditor";
import { ImportSection } from "./ImportSection";
import { MaterialSection } from "./MaterialSection";
import { PromptSection } from "./PromptSection";

/** Per test: study PDF, AI prompt, import of the question file, review and editing. */
export function TestsPanel({
  overview,
  reload,
  selected,
}: {
  overview: AdminOverview;
  reload: () => Promise<void>;
  /** id of the test that is open (chosen in the sidebar) */
  selected: string;
}) {
  const { t } = useI18n();
  const test = findTest(certification, selected) ?? certification.tests[0];
  // Bumped after an import so the editor below reloads the new bank.
  const [bankVersion, setBankVersion] = useState(0);
  if (!test) return null;
  const info = overview.tests.find((x) => x.testId === test.id);

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h2>{t("admin.tests.title")}</h2>
        <p className="muted">{t("admin.tests.intro")}</p>
      </div>

      <h3 style={{ fontSize: "1.2rem" }}>{t.dynamic("tests", `${test.id}.name`)}</h3>

      <MaterialSection key={`material-${test.id}`} testId={test.id} material={info?.material ?? null} onChanged={reload} />
      <PromptSection key={`prompt-${test.id}`} test={test} />
      <ImportSection
        key={`import-${test.id}`}
        test={test}
        existingCount={info?.questionCount ?? 0}
        onSaved={async () => {
          setBankVersion((v) => v + 1);
          await reload();
        }}
      />
      <BankEditor key={`bank-${test.id}-${bankVersion}`} test={test} onChanged={reload} />
    </div>
  );
}
