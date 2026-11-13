import type { XSettingsView } from "../../src/core/x-settings.ts";
import type { SectionSpec } from "./LoadedSection.tsx";
import { X_STATES, X_TEXT } from "./x-text.ts";

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

function XRows({ view }: Readonly<{ view: XSettingsView }>) {
  if (view.state === "worker") return <p>{X_TEXT.noteWorker}</p>;

  return (
    <>
      <p>
        {X_TEXT.fetcherLabel}: {view.fetcher === null ? X_TEXT.fetcherNone : X_TEXT.fetcherGrok}
      </p>
      <p>
        {X_TEXT.stateLabel}: {X_STATES[view.state]}
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

export const X_SECTION: SectionSpec<XSettingsView> = {
  id: "x-posts",
  title: X_TEXT.sectionTitle,
  intro: X_TEXT.intro,
  loadFailed: X_TEXT.loadFailed,
  form: (view) => <XRows view={view} />,
};
