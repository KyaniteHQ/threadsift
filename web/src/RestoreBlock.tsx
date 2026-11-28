import type { Counts, RestoreStatus } from "../../src/core/contract/restore-contract.ts";
import { Alert } from "./Alert.tsx";
import { Icon } from "./Icon.tsx";
import {
  RESTORE_TEXT,
  doneLabel,
  droppedLabel,
  failureLabel,
  interruptedLabel,
  missingFilesLabel,
  phaseLabel,
  soFarLabel,
  uploadingLabel,
} from "./restore-text.ts";
import type { Progress } from "./restore-upload.ts";
import { SettingsResult } from "./SettingsForm.tsx";
import { SwapButton } from "./SwapButton.tsx";
import { useFilePicker } from "./use-file-picker.ts";
import { useHashTarget } from "./use-hash-target.ts";
import type { useRestore } from "./use-restore.ts";

function total(counts: Counts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function statusLine(view: RestoreStatus, progress: Progress | null): string | null {
  if (progress?.kind === "sending") return uploadingLabel(progress.sent, progress.parts);

  if (progress?.kind === "checking") return RESTORE_TEXT.checking;

  switch (view.state) {
    case "running":
      return RESTORE_TEXT.running;
    case "cancelling":
      return RESTORE_TEXT.cancellingStatus;
    case "done":
      return RESTORE_TEXT.done;
    case "cancelled":
      return view.libraryEmpty ? RESTORE_TEXT.cancelled : RESTORE_TEXT.cancelledKept;
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
          {phaseLabel(view.phase)}
          {view.phase === "tables" ? ` ${soFarLabel(total(view.restored))}` : ""}
        </p>
      );
    case "done":
      return (
        <>
          <p className="ai-meta">{doneLabel(view.restored["items"] ?? 0, total(view.restored))}</p>
          {total(view.dropped) > 0 ? (
            <p className="ai-meta">{droppedLabel(total(view.dropped))}</p>
          ) : null}
          {view.missingFiles > 0 ? (
            <p className="ai-meta">{missingFilesLabel(view.missingFiles)}</p>
          ) : null}
          <p className="ai-meta">{RESTORE_TEXT.enterAgain}</p>
        </>
      );
    case "failed":
      return <Alert text={failureLabel(view.failure, view)} />;
    case "none":
    case "cancelling":
    case "cancelled":
      return null;
    default:
      return view satisfies never;
  }
}

type Ending = Readonly<{
  view: RestoreStatus;
  acting: ReturnType<typeof useRestore>["acting"];
  cancel: () => void;
  resume: () => void;
}>;

function Actions({ view, acting, cancel, resume }: Ending) {
  const canCancel =
    view.state === "uploading" || view.state === "failed" || view.state === "running";

  if (!canCancel) return null;

  const blocked = acting !== null;

  return (
    <div className="ai-actions">
      {view.state === "failed" && view.resumable ? (
        <SwapButton
          label={RESTORE_TEXT.resume}
          busyLabel={RESTORE_TEXT.resuming}
          busy={acting === "resume"}
          blocked={blocked}
          type="button"
          onClick={resume}
        />
      ) : null}
      <SwapButton
        label={RESTORE_TEXT.cancel}
        busyLabel={RESTORE_TEXT.cancelling}
        busy={acting === "cancel"}
        blocked={blocked}
        type="button"
        onClick={cancel}
        secondary
      />
    </div>
  );
}

function Picker({
  acting,
  choose,
}: Readonly<{ acting: Ending["acting"]; choose: (file: Readonly<File>) => void }>) {
  const { picker, open, read } = useFilePicker(choose, acting === null);

  return (
    <div className="imp-file">
      <SwapButton
        label={RESTORE_TEXT.choose}
        busyLabel={RESTORE_TEXT.uploadingButton}
        busy={acting === "choose"}
        blocked={acting !== null}
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

function offersPicker(view: RestoreStatus): boolean {
  if (!view.libraryEmpty) return false;

  switch (view.state) {
    case "running":
    case "cancelling":
      return false;
    case "failed":
      return !view.holdsLibrary;
    case "none":
    case "uploading":
    case "done":
    case "cancelled":
      return true;
    default:
      return view satisfies never;
  }
}

export function RestoreBlock({
  restore,
}: Readonly<{ restore: Readonly<ReturnType<typeof useRestore>> }>) {
  const { view, loadFailed, progress, acting, result, choose, cancel, resume } = restore;
  const busy = acting !== null;

  useHashTarget(view !== null);

  if (view === null) return <Alert text={loadFailed ? RESTORE_TEXT.loadFailed : null} />;

  if (view.state === "none" && !view.libraryEmpty && !busy) return null;

  const line = statusLine(view, progress);
  const working = progress !== null || view.state === "running" || view.state === "cancelling";

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
      {progress === null ? (
        <Actions view={view} acting={acting} cancel={cancel} resume={resume} />
      ) : null}
      {offersPicker(view) ? <Picker acting={acting} choose={choose} /> : null}
      <SettingsResult outcome={result} />
    </div>
  );
}
