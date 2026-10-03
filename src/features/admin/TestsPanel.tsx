"use client";

import { useRef, useState } from "react";
import { findTest } from "@/lib/certification";
import { certification } from "@/lib/config";
import { useI18n } from "@/lib/i18n/context";
import type { AdminOverview } from "@/lib/types";
import { BankEditor, type Draft } from "./BankEditor";
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
  const test = findTest(certification, selected) ?? certification.tests[0];
  // Keyed by test so that questions waiting for review in step 3 never carry over to another test.
  return test ? <TestWorkspace key={test.id} overview={overview} reload={reload} testId={test.id} /> : null;
}

function TestWorkspace({
  overview,
  reload,
  testId,
}: {
  overview: AdminOverview;
  reload: () => Promise<void>;
  testId: string;
}) {
  const { t } = useI18n();
  const test = findTest(certification, testId);
  // Questions from an uploaded file that wait in step 3 for review; nothing is stored until they are confirmed there.
  const [draft, setDraft] = useState<Draft | null>(null);
  const editor = useRef<HTMLDivElement>(null);
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
        hasDraft={draft !== null}
        onOpen={(questions, draftInfo) => {
          setDraft((previous) => ({ serial: (previous?.serial ?? 0) + 1, questions, info: draftInfo }));
          // Step 3 is further down the page; take the admin there.
          window.setTimeout(() => editor.current?.scrollIntoView({ block: "start" }), 0);
        }}
      />
      <div ref={editor}>
        <BankEditor
          key={`bank-${test.id}`}
          test={test}
          draft={draft}
          existingCount={info?.questionCount ?? 0}
          onChanged={reload}
          onDraftSaved={() => setDraft(null)}
          onDraftDiscarded={() => setDraft(null)}
        />
      </div>
    </div>
  );
}
