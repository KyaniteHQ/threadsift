import { useCallback } from "react";

import type { XReaderChoice } from "../../src/core/kinds.ts";
import type { XSettingsView } from "../../src/core/x-settings.ts";
import { Alert } from "./Alert.tsx";
import type { SectionSpec } from "./LoadedSection.tsx";
import { useXForm } from "./use-x-form.ts";
import { BOT_STATES, READER_HELP, READER_LABELS, X_STATES, X_TEXT } from "./x-text.ts";

const LABEL_ID = "x-reader-label";

const NOTE_ID = "x-reader-note";

function Command({ text }: Readonly<{ text: string }>) {
  return <pre className="cmd">{text}</pre>;
}

function Note({ view }: Readonly<{ view: XSettingsView }>) {
  switch (view.state) {
    case "signed-in":
    case "worker":
      return null;
    case "signed-out":
      return (
        <>
          <p className="fld-help">{X_TEXT.noteSignedOut}</p>
          <Command text={X_TEXT.signInCommand} />
        </>
      );
    case "not-installed":
      return (
        <>
          <p className="fld-help">{X_TEXT.noteNotInstalled}</p>
          <Command text={X_TEXT.installCommand} />
          <Command text={X_TEXT.restartCommand} />
          <Command text={X_TEXT.signInCommand} />
        </>
      );
    case "not-proven":
      return (
        <>
          <p className="fld-help">{X_TEXT.noteNotProven}</p>
          <Command text={X_TEXT.restartCommand} />
        </>
      );
    case "unknown":
      return <p className="fld-help">{X_TEXT.noteUnknown}</p>;
    default: {
      const exhaustive: never = view.state;

      return exhaustive;
    }
  }
}

function Choice({
  reader,
  checked,
  busy,
  pick,
}: Readonly<{
  reader: XReaderChoice;
  checked: boolean;
  busy: boolean;
  pick: (reader: XReaderChoice) => void;
}>) {
  const choose = useCallback(() => {
    pick(reader);
  }, [pick, reader]);

  return (
    <label className="st-b" htmlFor={`x-reader-${reader}`}>
      <input
        id={`x-reader-${reader}`}
        type="radio"
        className="st-in"
        name={LABEL_ID}
        checked={checked}
        aria-disabled={busy || undefined}
        onChange={choose}
      />
      {READER_LABELS[reader]}
    </label>
  );
}

function ReaderChoice({
  view,
  changed,
}: Readonly<{ view: XSettingsView; changed: (view: XSettingsView) => void }>) {
  const form = useXForm(changed);

  return (
    <div className="stack" aria-busy={form.busy}>
      <span id={LABEL_ID} className="label">
        {X_TEXT.readerLabel}
      </span>
      <div
        role="radiogroup"
        className="st-seg"
        aria-labelledby={LABEL_ID}
        aria-describedby={NOTE_ID}
      >
        {view.choices.map((reader) => (
          <Choice
            key={reader}
            reader={reader}
            checked={view.reader === reader}
            busy={form.busy}
            pick={form.pick}
          />
        ))}
      </div>
      <p id={NOTE_ID} className="fld-help">
        {READER_HELP[view.reader]}
      </p>
      <output>{form.busy ? X_TEXT.saving : null}</output>
      <Alert text={form.failed ? X_TEXT.failed : null} />
    </div>
  );
}

function CliRows({ view }: Readonly<{ view: XSettingsView }>) {
  if (view.state === "worker") return <p>{X_TEXT.noteWorker}</p>;

  return (
    <>
      <p>
        {X_TEXT.cliLabel}: {X_STATES[view.state]}
      </p>
      {view.version === null ? null : (
        <p>
          {X_TEXT.versionLabel}: {view.version}
        </p>
      )}
      <Note view={view} />
      {view.fetcher === null ? null : <p className="fld-help">{X_TEXT.noteSearch}</p>}
    </>
  );
}

function XRows({
  view,
  changed,
}: Readonly<{ view: XSettingsView; changed: (view: XSettingsView) => void }>) {
  return (
    <>
      <ReaderChoice view={view} changed={changed} />
      <p>
        {X_TEXT.botLabel}: {BOT_STATES[view.bot]}
      </p>
      <CliRows view={view} />
    </>
  );
}

const xForm = (view: XSettingsView, changed: (view: XSettingsView) => void) => (
  <XRows view={view} changed={changed} />
);

export const X_SECTION: SectionSpec<XSettingsView> = {
  id: "x-posts",
  title: X_TEXT.sectionTitle,
  intro: X_TEXT.intro,
  loadFailed: X_TEXT.loadFailed,
  form: xForm,
};
