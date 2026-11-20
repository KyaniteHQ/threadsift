import type { RedditSettings } from "../../src/core/contract/reddit-contract.ts";
import { Alert } from "./Alert.tsx";
import { LoadedSection, type SectionSpec } from "./LoadedSection.tsx";
import { RadioChoice } from "./RadioChoice.tsx";
import { saveRedditSettings } from "./reddit-api.ts";
import { REDDIT_TEXT } from "./reddit-text.ts";
import { REDDIT_ACCOUNT_SECTION } from "./RedditAccountSection.tsx";
import type { SettingsLoad } from "./settings-load-types.ts";
import { useSaveOnPick } from "./use-save-on-pick.ts";

const saveArchiveFill = (archiveFill: boolean) => saveRedditSettings({ archiveFill });

const LABEL_ID = "reddit-archive-label";

const NOTE_ID = "reddit-archive-note";

const OPTIONS = [
  { archiveFill: true, id: "on", label: REDDIT_TEXT.optionOn },
  { archiveFill: false, id: "off", label: REDDIT_TEXT.optionOff },
] as const;

function ArchiveFillRow({
  view,
  changed,
}: Readonly<{ view: RedditSettings; changed: (view: RedditSettings) => void }>) {
  const form = useSaveOnPick(saveArchiveFill, changed, REDDIT_TEXT.failed);

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
          <RadioChoice
            key={option.id}
            id={`reddit-archive-${option.id}`}
            name={LABEL_ID}
            value={option.archiveFill}
            label={option.label}
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

const REDDIT_SECTION: SectionSpec<RedditSettings> = {
  id: "reddit",
  title: REDDIT_TEXT.sectionTitle,
  intro: REDDIT_TEXT.intro,
  loadFailed: REDDIT_TEXT.loadFailed,
  Form: ArchiveFillRow,
};

export function RedditSections({ loaded }: Readonly<{ loaded: SettingsLoad }>) {
  return (
    <>
      <LoadedSection {...REDDIT_SECTION} initial={loaded.reddit} />
      <LoadedSection {...REDDIT_ACCOUNT_SECTION} initial={loaded.redditAccount} />
    </>
  );
}
