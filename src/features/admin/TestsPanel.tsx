"use client";

import { useRef, useState } from "react";
import { findTest } from "@/lib/certification";
import { certification } from "@/lib/config";
import { defaultCounts } from "@/lib/counts";
import { useI18n } from "@/lib/i18n/context";
import type { AdminOverview } from "@/lib/types";
import { BankEditor, type Draft } from "./BankEditor";
import { CountsSection } from "./CountsSection";
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
  const counts = info?.counts ?? defaultCounts(test);

  /** Step 3 is further down the page; take the admin there. */
  const showEditor = () => window.setTimeout(() => editor.current?.scrollIntoView({ block: "start" }), 0);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div className="page-head-text">
          <p className="eyebrow">{t("admin.tests.title")}</p>
          <h1>{t.dynamic("tests", `${test.id}.name`)}</h1>
          <p className="page-sub">{t("admin.tests.intro")}</p>
        </div>
      </header>

      <div>
        <CountsSection key={`counts-${test.id}`} test={test} counts={counts} onChanged={reload} />
        <MaterialSection key={`material-${test.id}`} testId={test.id} material={info?.material ?? null} onChanged={reload} />
        <PromptSection key={`prompt-${test.id}`} test={test} counts={counts} />
        <ImportSection
          key={`import-${test.id}`}
          test={test}
          hasDraft={draft !== null}
          onOpen={(questions, draftInfo) => {
            setDraft((previous) => ({ serial: (previous?.serial ?? 0) + 1, questions, info: draftInfo }));
            showEditor();
          }}
        />
        <div ref={editor} className="section">
          <BankEditor
            key={`bank-${test.id}`}
            test={test}
            draft={draft}
            existingCount={info?.questionCount ?? 0}
            counts={counts}
            supportsCaseStudy={test.caseStudy !== undefined}
            onWriteByHand={() => {
              // No questions yet: they are written in the editor, one by one.
              setDraft((previous) => ({
                serial: (previous?.serial ?? 0) + 1,
                questions: [],
                info: { generator: "", generatedAt: "", source: "" },
              }));
              showEditor();
            }}
            onChanged={reload}
            onDraftSaved={() => setDraft(null)}
            onDraftDiscarded={() => setDraft(null)}
          />
        </div>
      </div>
    </div>
  );
}
