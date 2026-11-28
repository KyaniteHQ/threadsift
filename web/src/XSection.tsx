import { useCallback, useState } from "react";

import type { XReaderChoice, XSettingsView } from "../../src/core/contract/x-settings-contract.ts";
import { Alert } from "./Alert.tsx";
import { Command } from "./Command.tsx";
import type { SectionSpec } from "./LoadedSection.tsx";
import { RadioChoice } from "./RadioChoice.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { type Saved, useSaveOnPick } from "./use-save-on-pick.ts";
import { fetchXSettings, saveXReader } from "./x-api.ts";
import {
  BOT_STATES,
  READER_HELP,
  READER_LABELS,
  REFUSED_REASONS,
  X_STATES,
  X_TEXT,
} from "./x-text.ts";

const LABEL_ID = "x-reader-label";

const NOTE_ID = "x-reader-note";

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

async function saveReader(reader: XReaderChoice): Promise<Saved<XSettingsView>> {
  return { kind: "saved", view: await saveXReader(reader) };
}

function ReaderChoice({
  view,
  changed,
}: Readonly<{ view: XSettingsView; changed: (view: XSettingsView) => void }>) {
  const form = useSaveOnPick(saveReader, changed, X_TEXT.failed);

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
          <RadioChoice
            key={reader}
            id={`x-reader-${reader}`}
            name={LABEL_ID}
            value={reader}
            label={READER_LABELS[reader]}
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
      <Alert text={form.error} />
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
      {view.refusedUpdate === null ? null : (
        <>
          <p>
            {X_TEXT.refusedLabel}: {view.refusedUpdate.version}
          </p>
          <p className="fld-help">{REFUSED_REASONS[view.refusedUpdate.reason]}</p>
        </>
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

export const X_SECTION: SectionSpec<XSettingsView> = {
  id: "x-posts",
  title: X_TEXT.sectionTitle,
  intro: X_TEXT.intro,
  loadFailed: X_TEXT.loadFailed,
  Form: XRows,
};

export function useXRefresh(initial: Loaded<XSettingsView>) {
  const [x, setX] = useState(initial);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    void fetchXSettings().then(
      (view) => {
        setX({ kind: "ready", view });
        setVersion((current) => current + 1);

        return null;
      },
      () => null,
    );
  }, []);

  return { x, version, refresh };
}
