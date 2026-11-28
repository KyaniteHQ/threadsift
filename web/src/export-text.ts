import {
  EXPORT_KEEP_MS,
  type ShownExportFailure,
} from "../../src/core/contract/export-contract.ts";
import { MAX_ATTEMPTS } from "../../src/core/contract/job-contract.ts";
import { HOUR_MS } from "../../src/core/contract/time-units.ts";
import { plural } from "./plural.ts";

export const EXPORT_TEXT = {
  sectionTitle: "Backup",
  intro: `An export makes one zip file of the whole library: every item and the records around it. It works best when no import is running. This instance keeps a finished export for ${String(EXPORT_KEEP_MS / HOUR_MS)} hours and then deletes it.`,
  caution:
    "The zip is not encrypted. In a viewer that renders raw HTML, a saved page’s text could run code its author wrote.",
  loadFailed: "Couldn’t load the export status. Reload the page.",
  start: "Start export",
  starting: "Starting…",
  stop: "Stop export",
  stopping: "Stopping…",
  remove: "Delete export",
  removing: "Deleting…",
  download: "Download",
  running: "Exporting…",
  ready: "Export ready",
  startFailed: "Couldn’t start the export. Try again.",
  startRestoring:
    "Couldn’t start the export because a restore isn’t finished. Try again after it finishes, or use Resume restore or Cancel restore first if it stopped.",
  stopFailed: "Couldn’t stop the export. It may still be running. Try again.",
  removeFailed: "Couldn’t delete the export. Try again.",
} as const;

const PROGRESS = { one: "1 file, {size} so far", many: "{count} files, {size} so far" } as const;

const READY_DETAIL = { one: "1 file, {size}", many: "{count} files, {size}" } as const;

const FAILURE_TEXT = {
  "gave-up": `The export failed after ${String(MAX_ATTEMPTS)} tries on one step. Start export runs it from the beginning.`,
  "list-changed": "The export stopped because this instance was updated while it ran.",
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
  return plural(entries, texts.one, texts.many, { size: byteLabel(bytes) });
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
