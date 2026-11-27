import { groupedNumber } from "../../src/core/contract/format.ts";
import { MAX_ATTEMPTS } from "../../src/core/contract/job-contract.ts";
import type {
  RestoreErrorCode,
  RestoreFailure,
  RunningPhase,
} from "../../src/core/contract/restore-contract.ts";
import { filled } from "./filled.ts";

export const RESTORE_TEXT = {
  lede: "A restore reads an export zip into this instance and brings back every item and the records around it. It works only while the library is empty.",
  choose: "Choose export zip",
  uploadingButton: "Uploading…",
  uploadProgress: "Upload progress",
  wrongFile: "That file isn’t the zip you started uploading. Choose the same zip.",
  uploadFailed: "Couldn’t upload a part of the zip. Choose the same zip to continue.",
  checking: "Checking the export zip…",
  running: "Restoring…",
  done: "Restore finished",
  enterAgain:
    "The zip holds no provider key, password or agent tokens. This instance keeps its current password. Set the provider and make new agent tokens in Settings.",
  loadFailed: "Couldn’t load the restore status. Reload the page.",
  failed: "Couldn’t upload the zip or start the restore. Try again.",
  cancel: "Cancel restore",
  cancelling: "Cancelling…",
  cancellingStatus: "Removing restored records and files…",
  cancelled: "Restore cancelled. The library is empty again and ready for a new restore.",
  cancelledKept:
    "Restore cancelled. The library is not empty, so it stays as it is. A new restore can’t start until the library is empty.",
  resume: "Resume restore",
  resuming: "Resuming…",
  cancelFailed: "Couldn’t cancel the restore. Try again.",
  resumeFailed: "Couldn’t resume the restore. Try again.",
} as const;

const UPLOADING = "Uploading part {sent} of {parts}…";

const INTERRUPTED =
  "The upload stopped after {received} of {parts} parts. Choose the same zip to send the rest.";

const PHASE_TEXT = {
  check: "Checking the zip…",
  tables: "Restoring records…",
  files: "Restoring files…",
  search: "Rebuilding search…",
  highlights: "Checking highlights…",
  finish: "Finishing…",
} as const satisfies Record<RunningPhase, string>;

const SO_FAR = "{records} so far";

const DONE_ONE = "1 item ({records} records total)";

const DONE_MANY = "{items} items ({records} records total)";

const DROPPED =
  "Records left out: {dropped}. Each belonged to a record missing from the zip or used the same key as an earlier one.";

const MISSING_FILES_TEXT =
  "Files missing from the zip: {missing}. The reader links a missing image to its original web address. An item whose post text file is missing has no post text.";

const REFUSAL_TEXT = {
  "incomplete-upload":
    "Not every part of the zip arrived. Nothing was restored. Choose the same zip to upload it again.",
  "not-a-zip": "That file isn’t an export zip. Nothing was restored.",
  "unsupported-compression":
    "The zip is compressed, and export zips are uncompressed. Nothing was restored. Choose the export zip as it was downloaded.",
  "bad-entry-name": "A file name inside the zip isn’t allowed. Nothing was restored.",
  "no-manifest": "The zip is missing threadsift.json. Nothing was restored.",
  format:
    "The zip isn’t in the export format, or a record file in it is damaged. Nothing was restored.",
  "other-release": "The zip was made by another release of Threadsift. Nothing was restored.",
  "unknown-table":
    "The zip holds a kind of data this instance doesn’t recognize. Nothing was restored.",
  "unknown-column": "The zip holds a field this instance doesn’t recognize. Nothing was restored.",
  "missing-column":
    "A record in the zip is missing a field this instance needs. Nothing was restored.",
  crc: "A file inside the zip is damaged. Nothing was restored.",
  "library-not-empty":
    "This instance already holds items or other library records. A restore needs an empty library.",
  "restore-open":
    "Another restore is waiting for an upload, running, or stopped after a failed step. Reload the page to finish or cancel it first.",
  "not-uploading":
    "The restore is already past its upload. This attempt stopped. Check the restore status.",
  "vault-busy":
    "The vault mirror is still writing. Wait a moment, then choose the same zip again to start the restore.",
} as const satisfies Record<RestoreErrorCode, string>;

const GAVE_UP = `The restore stopped after a step failed ${String(MAX_ATTEMPTS)} times. Some records are already restored. Resume restore continues from the last finished step. Cancel restore removes those records.`;

const CANCEL_STOPPED = `Cancelling the restore stopped after a step failed ${String(MAX_ATTEMPTS)} times. Some restored records are still in the library. Use Cancel restore again to remove them from where it stopped.`;

const GAVE_UP_NO_ZIP = `The restore stopped after a step failed ${String(MAX_ATTEMPTS)} times. Some records are already restored, and the export zip is no longer on this instance. Cancel restore removes the restored records so you can choose the zip again.`;

const GAVE_UP_EMPTY = `The restore stopped after a step failed ${String(MAX_ATTEMPTS)} times. The library is still empty. Resume restore tries again from the last finished step. Cancel restore ends the restore so you can choose the zip again.`;

const GAVE_UP_EMPTY_NO_ZIP = `The restore stopped after a step failed ${String(MAX_ATTEMPTS)} times. The library is still empty, and the export zip is no longer on this instance. Cancel restore ends the restore so you can choose the zip again.`;

export function refusalLabel(code: RestoreErrorCode): string {
  return REFUSAL_TEXT[code];
}

export function failureLabel(
  failure: RestoreFailure,
  {
    resumable,
    cancelFailed,
    libraryEmpty,
  }: Readonly<{ resumable: boolean; cancelFailed: boolean; libraryEmpty: boolean }>,
): string {
  if (failure !== "gave-up") return REFUSAL_TEXT[failure];

  if (cancelFailed) return CANCEL_STOPPED;

  if (libraryEmpty) return resumable ? GAVE_UP_EMPTY : GAVE_UP_EMPTY_NO_ZIP;

  return resumable ? GAVE_UP : GAVE_UP_NO_ZIP;
}

export function uploadingLabel(sent: number, parts: number): string {
  return filled(UPLOADING, { sent: groupedNumber(sent), parts: groupedNumber(parts) });
}

export function interruptedLabel(received: number, parts: number): string {
  return filled(INTERRUPTED, { received: groupedNumber(received), parts: groupedNumber(parts) });
}

export function phaseLabel(phase: RunningPhase): string {
  return PHASE_TEXT[phase];
}

export function soFarLabel(records: number): string {
  return filled(SO_FAR, { records: groupedNumber(records) });
}

export function doneLabel(items: number, records: number): string {
  return filled(items === 1 ? DONE_ONE : DONE_MANY, {
    items: groupedNumber(items),
    records: groupedNumber(records),
  });
}

export function droppedLabel(dropped: number): string {
  return filled(DROPPED, { dropped: groupedNumber(dropped) });
}

export function missingFilesLabel(missing: number): string {
  return filled(MISSING_FILES_TEXT, { missing: groupedNumber(missing) });
}
