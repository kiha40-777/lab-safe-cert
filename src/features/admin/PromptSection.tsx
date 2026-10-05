"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/Notice";
import type { TestConfig } from "@/lib/certification";
import { certification } from "@/lib/config";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n/context";
import { lookup } from "@/lib/i18n/messages";
import { type QuestionLanguage, buildPrompt } from "@/lib/prompt/build";

/** The ready-to-paste prompt for an external AI chat, together with the study PDF. */
export function PromptSection({ test }: { test: TestConfig }) {
  const { t } = useI18n();
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [questionLanguage, setQuestionLanguage] = useState<QuestionLanguage>("same");
  const [copied, setCopied] = useState<"idle" | "yes" | "no">("idle");

  const prompt = useMemo(
    () =>
      buildPrompt({
        questionLanguage,
        // The prompt is always English, so the test is named in English too.
        testName: lookup("en", `tests.${test.id}.name`) ?? test.id,
        questionCount: test.expectedBankSize,
        choiceCount: certification.questionBank.preferredChoices,
      }),
    [questionLanguage, test],
  );

  async function copy() {
    const ok = await copyText(prompt, area.current);
    setCopied(ok ? "yes" : "no");
    window.setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <section className="section section-split" aria-labelledby={`${id}-title`}>
      <div className="section-intro">
        <h2 id={`${id}-title`}>{t("admin.prompt.title")}</h2>
        <p>{t("admin.prompt.help")}</p>
      </div>
      <div className="stack">
        <Notice kind="warning">{t("admin.prompt.warning")}</Notice>

        <div className="field">
          <label htmlFor={`${id}-qlang`}>{t("admin.prompt.questionLanguage")}</label>
          <select id={`${id}-qlang`} value={questionLanguage} onChange={(e) => setQuestionLanguage(e.target.value as QuestionLanguage)}>
            <option value="same">{t("admin.prompt.sameAsPdf")}</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>

        <p className="hint">
          {t("admin.prompt.info", { count: test.expectedBankSize, choices: certification.questionBank.preferredChoices })}
        </p>

        <div className="field">
          <label htmlFor={`${id}-text`}>{t("admin.prompt.textLabel")}</label>
          <textarea id={`${id}-text`} ref={area} className="mono" rows={14} readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" onClick={() => void copy()}>
            {copied === "yes" ? t("common.copied") : t("common.copy")}
          </button>
          {copied === "no" ? <span className="hint">{t("admin.prompt.copyFailed")}</span> : null}
        </div>
      </div>
    </section>
  );
}
