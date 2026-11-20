import { groupedNumber } from "../../src/core/contract/format.ts";
import { MAX_ATTEMPTS } from "../../src/core/contract/job-contract.ts";
import type {
  RestoreErrorCode,
  RestoreFailure,
  RunningPhase,
} from "../../src/core/contract/restore-contract.ts";
import { filled } from "./text.ts";

export const RESTORE_TEXT = {
  lede: "A Restore reads an Export zip into this Instance and brings every Item and the records around it back. It works only while the library is empty.",
  choose: "Choose Export zip",
  uploadingButton: "Uploading…",
  uploadProgress: "Upload progress",
  wrongFile: "This isn’t the zip that was being uploaded. Choose the same file.",
  uploadFailed: "Couldn’t send a part of the zip. Choose the same zip to carry on.",
  checking: "Checking the Export zip…",
  running: "Restore running.",
  done: "Restore finished.",
  enterAgain:
    "The zip holds no Provider key, password or agent tokens. Set the Provider and make agent tokens again in Settings.",
  loadFailed: "Couldn’t read the Restore state. Reload the page.",
  failed: "Couldn’t send the part or start the Restore. Try again.",
  cancel: "Cancel Restore",
  cancelling: "Cancelling…",
  cancellingStatus: "Removing restored records and files…",
  cancelled:
    "The Restore is cancelled and the library is empty again, so you can start a new Restore.",
  resume: "Resume Restore",
  resuming: "Resuming…",
  cancelFailed: "Couldn’t cancel the Restore. Try again.",
  resumeFailed: "Couldn’t resume the Restore. Try again.",
} as const;

const UPLOADING = "Uploading part {sent} of {parts}.";

const INTERRUPTED =
  "The upload stopped after {received} of {parts} parts. Choose the same zip to send the rest.";

const PHASE_TEXT = {
  check: "Checking the zip…",
  tables: "Restoring records…",
  files: "Restoring files…",
  search: "Rebuilding search…",
  highlights: "Checking Highlights…",
  finish: "Finishing Restore…",
} as const satisfies Record<RunningPhase, string>;

const SO_FAR = "Records restored so far: {records}.";

const DONE_ONE = "Restored 1 Item ({records} records in all).";

const DONE_MANY = "Restored {items} Items ({records} records in all).";

const DROPPED =
  "Records left out because the record they belong to wasn’t in the zip or an earlier record in the zip already holds the same key: {dropped}.";

const MISSING_FILES_TEXT =
  "Files missing from the zip: {missing}; the Reader links a missing image to its original web address, and a missing post text file leaves the Item without its text.";

const REFUSAL_TEXT = {
  "incomplete-upload":
    "A part of the zip didn’t arrive, so nothing was restored. Choose the same zip to send it again.",
  "not-a-zip": "That file isn’t an Export zip. Nothing was restored.",
  "unsupported-compression":
    "The zip was packed again with compression, so nothing was restored. Use the zip the Export made.",
  "bad-entry-name": "A file name inside the zip isn’t allowed. Nothing was restored.",
  "no-manifest": "The zip has no threadsift.json. Nothing was restored.",
  format:
    "The zip isn’t in the format of an Export, or a record file in it is damaged. Nothing was restored.",
  "other-release": "The zip was made by another release of Threadsift. Nothing was restored.",
  "unknown-table": "The zip holds a table this Instance doesn’t know. Nothing was restored.",
  "unknown-column": "The zip holds a column this Instance doesn’t know. Nothing was restored.",
  "missing-column":
    "A record in the zip is missing a column this Instance needs. Nothing was restored.",
  crc: "A file inside the zip is damaged because its checksum doesn’t match. Nothing was restored.",
  "library-not-empty":
    "This Instance already holds Items or other library records. A Restore needs an empty library.",
  "restore-open": "Another Restore is waiting for its upload or is running. Reload the page.",
  "vault-busy":
    "The Vault mirror is finishing a write. Wait a moment and choose the same zip again to start the Restore.",
} as const satisfies Record<RestoreErrorCode, string>;

const GAVE_UP = `The Restore stopped because a step failed ${String(MAX_ATTEMPTS)} times. Some records are already restored. Resume continues from the last finished step, and Cancel removes them.`;

const CANCEL_STOPPED = `The Cancel stopped because a step failed ${String(MAX_ATTEMPTS)} times. Some restored records are still in the library. Cancel again removes them from where it stopped.`;

const GAVE_UP_NO_ZIP = `The Restore stopped because a step failed ${String(MAX_ATTEMPTS)} times. Some records are already restored, and the Export zip is no longer on the Instance. Cancel removes the restored records so you can choose the zip again.`;

export function refusalLabel(code: RestoreErrorCode): string {
  return REFUSAL_TEXT[code];
}

export function failureLabel(
  failure: RestoreFailure,
  { resumable, cancelFailed }: Readonly<{ resumable: boolean; cancelFailed: boolean }>,
): string {
  if (failure !== "gave-up") return REFUSAL_TEXT[failure];

  if (cancelFailed) return CANCEL_STOPPED;

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
