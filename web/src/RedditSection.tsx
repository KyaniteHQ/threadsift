import { useCallback } from "react";

import type { RedditSettings } from "../../src/core/reddit-contract.ts";
import { Alert } from "./Alert.tsx";
import type { SectionSpec } from "./LoadedSection.tsx";
import { REDDIT_TEXT } from "./reddit-text.ts";
import { useRedditForm } from "./use-reddit-form.ts";

const LABEL_ID = "reddit-archive-label";

const NOTE_ID = "reddit-archive-note";

const OPTIONS = [
  { archiveFill: true, id: "on", label: REDDIT_TEXT.optionOn },
  { archiveFill: false, id: "off", label: REDDIT_TEXT.optionOff },
] as const;

type Option = (typeof OPTIONS)[number];

function Choice({
  option,
  checked,
  busy,
  pick,
}: Readonly<{
  option: Option;
  checked: boolean;
  busy: boolean;
  pick: (archiveFill: boolean) => void;
}>) {
  const choose = useCallback(() => {
    pick(option.archiveFill);
  }, [pick, option.archiveFill]);

  return (
    <label className="st-b" htmlFor={`reddit-archive-${option.id}`}>
      <input
        id={`reddit-archive-${option.id}`}
        type="radio"
        className="st-in"
        name={LABEL_ID}
        checked={checked}
        aria-disabled={busy || undefined}
        onChange={choose}
      />
      {option.label}
    </label>
  );
}

function ArchiveFillRow({
  view,
  changed,
}: Readonly<{ view: RedditSettings; changed: (view: RedditSettings) => void }>) {
  const form = useRedditForm(changed);

  return (
    <div className="stack" aria-busy={form.busy}>
      <span id={LABEL_ID} className="label">
        {REDDIT_TEXT.fieldLabel}
      </span>
      <div
        role="radiogroup"
        className="st-seg"
        aria-labelledby={LABEL_ID}
        aria-describedby={NOTE_ID}
      >
        {OPTIONS.map((option) => (
          <Choice
            key={option.id}
            option={option}
            checked={view.archiveFill === option.archiveFill}
            busy={form.busy}
            pick={form.pick}
          />
        ))}
      </div>
      <p id={NOTE_ID} className="fld-help">
        {view.archiveFill ? REDDIT_TEXT.stateOn : REDDIT_TEXT.stateOff}
      </p>
      <output>{form.busy ? REDDIT_TEXT.saving : null}</output>
      <Alert text={form.failed ? REDDIT_TEXT.failed : null} />
    </div>
  );
}

const archiveFillForm = (view: RedditSettings, changed: (view: RedditSettings) => void) => (
  <ArchiveFillRow view={view} changed={changed} />
);

export const REDDIT_SECTION: SectionSpec<RedditSettings> = {
  id: "reddit",
  title: REDDIT_TEXT.sectionTitle,
  intro: REDDIT_TEXT.intro,
  loadFailed: REDDIT_TEXT.loadFailed,
  form: archiveFillForm,
};
