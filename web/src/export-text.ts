import {
  EXPORT_KEEP_MS,
  type ShownExportFailure,
} from "../../src/core/contract/export-contract.ts";
import { groupedNumber } from "../../src/core/contract/format.ts";
import { MAX_ATTEMPTS } from "../../src/core/contract/job-contract.ts";
import { HOUR_MS } from "../../src/core/contract/time-units.ts";
import { filled } from "./text.ts";

export const EXPORT_TEXT = {
  sectionTitle: "Backup",
  intro: `The Export makes one zip file of the whole library, every Item and the records around it, and runs best when no Import is running. A finished Export is kept on this Instance for ${String(EXPORT_KEEP_MS / HOUR_MS)} hours and then deleted.`,
  caution:
    "The zip is not encrypted, and a viewer that renders raw HTML would run what a page author wrote.",
  loadFailed: "Couldn’t load the Export state. Reload the page.",
  start: "Start export",
  starting: "Starting…",
  stop: "Stop export",
  stopping: "Stopping…",
  remove: "Delete export",
  removing: "Deleting…",
  download: "Download",
  running: "Export running.",
  ready: "Export ready.",
  failed: "Couldn’t start, stop or delete the Export. Try again.",
} as const;

const PROGRESS = { one: "1 file, {size} so far", many: "{files} files, {size} so far" } as const;

const READY_DETAIL = { one: "1 file, {size}", many: "{files} files, {size}" } as const;

const FAILURE_TEXT = {
  "gave-up": `The Export failed because a step failed ${String(MAX_ATTEMPTS)} times. Start it again.`,
  "list-changed":
    "The Instance was updated while the Export ran, so the Export stopped. Start it again.",
} as const satisfies Record<ShownExportFailure, string>;

const UNITS = ["B", "kB", "MB", "GB", "TB"] as const;

const TENTH = 10;

const STEP = 1000;

function rounded(value: number): number {
  return Math.round(value * TENTH) / TENTH;
}

function scaled(value: number, unit: number): string {
  if (unit < UNITS.length - 1 && rounded(value) >= STEP) return scaled(value / STEP, unit + 1);

  return `${unit === 0 ? String(value) : rounded(value).toFixed(1)} ${UNITS[unit] ?? "B"}`;
}

function byteLabel(bytes: number): string {
  return scaled(bytes, 0);
}

function sizedLabel(
  texts: Readonly<{ one: string; many: string }>,
  entries: number,
  bytes: number,
): string {
  return filled(entries === 1 ? texts.one : texts.many, {
    files: groupedNumber(entries),
    size: byteLabel(bytes),
  });
}

export function progressLabel(entries: number, bytes: number): string {
  return sizedLabel(PROGRESS, entries, bytes);
}

export function readyDetailLabel(entries: number, bytes: number): string {
  return sizedLabel(READY_DETAIL, entries, bytes);
}

export function failureLabel(failure: ShownExportFailure): string {
  return FAILURE_TEXT[failure];
}
