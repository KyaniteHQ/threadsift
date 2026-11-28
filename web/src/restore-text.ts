import { groupedNumber } from "../../src/core/contract/format.ts";
import { MAX_ATTEMPTS } from "../../src/core/contract/job-contract.ts";
import type {
  RestoreErrorCode,
  RestoreFailure,
  RestoreRefusal,
  RunningPhase,
} from "../../src/core/contract/restore-contract.ts";
import { filled } from "./filled.ts";
import { plural } from "./plural.ts";

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

const UPLOADING_ONE = "Uploading: {done} of 1 part sent…";

const UPLOADING_MANY = "Uploading: {done} of {count} parts sent…";

const INTERRUPTED_ONE =
  "The upload stopped with {done} of 1 part received. Choose the same zip again to send what’s missing.";

const INTERRUPTED_MANY =
  "The upload stopped with {done} of {count} parts received. Choose the same zip again to send what’s missing.";

const PHASE_TEXT = {
  check: "Checking the zip…",
  tables: "Restoring records…",
  files: "Restoring files…",
  search: "Rebuilding search…",
  highlights: "Checking highlights…",
  finish: "Finishing…",
} as const satisfies Record<RunningPhase, string>;

const SO_FAR = "{records} so far";

const DONE_ONE_RECORD = "1 item (1 record total)";

const DONE_ONE = "1 item ({records} records total)";

const DONE_MANY_ONE_RECORD = "{count} items (1 record total)";

const DONE_MANY = "{count} items ({records} records total)";

const DROPPED_ONE =
  "{count} record was left out. It repeated an earlier one or belonged to a record missing from the zip.";

const DROPPED_MANY =
  "{count} records were left out. Each repeated an earlier one or belonged to a record missing from the zip.";

const MISSING_FILES_ONE =
  "{count} file was missing from the zip. The reader links a missing image to its original web address. An item missing its post text file has no post text.";

const MISSING_FILES_MANY =
  "{count} files were missing from the zip. The reader links missing images to their original web addresses. Items missing their post text file have no post text.";

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

const OTHER_RELEASE_HELD =
  "The restore stopped partway because this instance now runs a different release of Threadsift from the one that made the zip. Nothing new can be saved in the library until the restore is cancelled. Cancel restore removes anything the restore wrote. Then restore a new export made with this release.";

function heldRefusalLabel(failure: RestoreRefusal): string {
  switch (failure) {
    case "other-release":
      return OTHER_RELEASE_HELD;
    case "incomplete-upload":
    case "not-a-zip":
    case "unsupported-compression":
    case "bad-entry-name":
    case "no-manifest":
    case "format":
    case "unknown-table":
    case "unknown-column":
    case "missing-column":
    case "crc":
      return REFUSAL_TEXT[failure];
    default:
      return failure satisfies never;
  }
}

export function refusalLabel(code: RestoreErrorCode): string {
  return REFUSAL_TEXT[code];
}

export function failureLabel(
  failure: RestoreFailure,
  {
    resumable,
    cancelFailed,
    libraryEmpty,
    holdsLibrary,
  }: Readonly<{
    resumable: boolean;
    cancelFailed: boolean;
    libraryEmpty: boolean;
    holdsLibrary: boolean;
  }>,
): string {
  if (failure !== "gave-up")
    return holdsLibrary ? heldRefusalLabel(failure) : REFUSAL_TEXT[failure];

  if (cancelFailed) return CANCEL_STOPPED;

  if (libraryEmpty) return resumable ? GAVE_UP_EMPTY : GAVE_UP_EMPTY_NO_ZIP;

  return resumable ? GAVE_UP : GAVE_UP_NO_ZIP;
}

export function uploadingLabel(sent: number, parts: number): string {
  return plural(parts, UPLOADING_ONE, UPLOADING_MANY, { done: groupedNumber(sent) });
}

export function interruptedLabel(received: number, parts: number): string {
  return plural(parts, INTERRUPTED_ONE, INTERRUPTED_MANY, { done: groupedNumber(received) });
}

export function phaseLabel(phase: RunningPhase): string {
  return PHASE_TEXT[phase];
}

export function soFarLabel(records: number): string {
  return filled(SO_FAR, { records: groupedNumber(records) });
}

export function doneLabel(items: number, records: number): string {
  if (records === 1)
    return items === 1
      ? DONE_ONE_RECORD
      : filled(DONE_MANY_ONE_RECORD, { count: groupedNumber(items) });

  return plural(items, DONE_ONE, DONE_MANY, { records: groupedNumber(records) });
}

export function droppedLabel(dropped: number): string {
  return plural(dropped, DROPPED_ONE, DROPPED_MANY);
}

export function missingFilesLabel(missing: number): string {
  return plural(missing, MISSING_FILES_ONE, MISSING_FILES_MANY);
}
