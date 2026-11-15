import { type ChangeEvent, useCallback, useRef } from "react";

import type { RestoreStatus } from "../../src/core/restore-contract.ts";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";
import {
  RESTORE_TEXT,
  doneLabel,
  droppedLabel,
  failureLabel,
  interruptedLabel,
  phaseLabel,
  soFarLabel,
  uploadingLabel,
} from "./restore-text.ts";
import type { Progress } from "./restore-upload.ts";
import { SettingsResult } from "./SettingsForm.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useRestore } from "./use-restore.ts";

type Counts = Readonly<Record<string, number>>;

function total(counts: Counts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function statusLine(view: RestoreStatus, progress: Progress | null): string | null {
  if (progress?.kind === "sending") return uploadingLabel(progress.sent, progress.parts);

  if (progress?.kind === "checking") return RESTORE_TEXT.checking;

  switch (view.state) {
    case "running":
      return RESTORE_TEXT.running;
    case "done":
      return RESTORE_TEXT.done;
    case "none":
    case "uploading":
    case "failed":
      return null;
    default:
      return view satisfies never;
  }
}

function Detail({ view, progress }: Readonly<{ view: RestoreStatus; progress: Progress | null }>) {
  if (progress !== null) return null;

  switch (view.state) {
    case "uploading":
      return <p className="ai-meta">{interruptedLabel(view.received.length, view.parts)}</p>;
    case "running":
      return (
        <p className="ai-meta">
          {phaseLabel(view.phase)} {soFarLabel(total(view.restored))}
        </p>
      );
    case "done":
      return (
        <>
          <p className="ai-meta">{doneLabel(view.restored["items"] ?? 0, total(view.restored))}</p>
          {total(view.dropped) > 0 ? (
            <p className="ai-meta">{droppedLabel(total(view.dropped))}</p>
          ) : null}
          <p className="ai-meta">{RESTORE_TEXT.enterAgain}</p>
        </>
      );
    case "failed":
      return <Alert text={failureLabel(view.failure)} />;
    case "none":
      return null;
    default:
      return view satisfies never;
  }
}

function Picker({
  busy,
  choose,
}: Readonly<{ busy: boolean; choose: (file: Readonly<File>) => void }>) {
  const picker = useRef<HTMLInputElement>(null);

  const open = useCallback(() => {
    if (!busy) picker.current?.click();
  }, [busy]);

  const read = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      event.target.value = "";

      if (file !== undefined) choose(file);
    },
    [choose],
  );

  return (
    <div className="imp-file">
      <SwapButton
        label={RESTORE_TEXT.choose}
        busyLabel={RESTORE_TEXT.uploadingButton}
        busy={busy}
        type="button"
        onClick={open}
        secondary
      />
      <input
        ref={picker}
        type="file"
        hidden
        accept=".zip,application/zip"
        tabIndex={-1}
        onChange={read}
      />
    </div>
  );
}

export function RestoreBlock() {
  const { view, loadFailed, progress, busy, result, choose } = useRestore();

  if (view === null) return <Alert text={loadFailed ? RESTORE_TEXT.loadFailed : null} />;

  if (view.state === "none" && !view.libraryEmpty && !busy) return null;

  const line = statusLine(view, progress);
  const working = progress !== null || view.state === "running";

  return (
    <div className="sec">
      <p>{RESTORE_TEXT.lede}</p>
      <output className="bk-state">
        {working ? <Icon name="spin" className="ic ic-s spin" /> : null}
        {line}
      </output>
      {progress?.kind === "sending" ? (
        <progress
          className="imp-bar"
          aria-label={RESTORE_TEXT.uploadProgress}
          max={progress.parts}
          value={progress.sent}
        />
      ) : null}
      <Detail view={view} progress={progress} />
      {view.libraryEmpty && view.state !== "running" ? (
        <Picker busy={busy} choose={choose} />
      ) : null}
      <SettingsResult outcome={result} />
    </div>
  );
}
