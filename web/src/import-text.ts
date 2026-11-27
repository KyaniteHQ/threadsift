import { groupedNumber } from "../../src/core/contract/format.ts";
import type { SkipReason } from "../../src/core/contract/import-list.ts";
import { REDDIT_WINDOW_REQUESTS } from "../../src/core/contract/limits.ts";
import type { CliProvider } from "../../src/core/contract/provider-families.ts";
import { filled } from "./filled.ts";
import { plural } from "./plural.ts";
import { RETRY_LABEL } from "./text.ts";

export const IMPORT = {
  settingsLink: "Import",
  title: "Import",
  boxLabel: "Links",
  boxHint: "Paste one link per line.",
  fileLabel: "From a file",
  fileHint:
    "Threadsift reads links from a .csv or .txt file into the Links field. A Reddit saved_posts.csv works as it is. Other CSV files need a permalink or url column.",
  fileButton: "Choose file",
  fileFailed: "Couldn’t read the file.",
  noLinks: "No links found",
  checking: "Checking this list…",
  checkFailed: "Couldn’t check whether this list was imported before.",
  retry: RETRY_LABEL,
  resumeComplete: "This whole list was already imported.",
  start: "Start import",
  resume: "Continue",
  again: "Import again",
  progressLabel: "Import progress",
  countsNote:
    "Known links are already in the library and stay as they are. Refused links lead to addresses that can’t be reached from the public internet, so the instance won’t fetch them.",
  stop: "Stop",
  stopping: "Stopping…",
  stoppingStatus: "The import stops after the current batch.",
  waiting: "The instance is slow to answer. Waiting to confirm whether the last batch was saved…",
  finished: "Import finished.",
  noProvider: "Imported links are added now. Save a provider so Threadsift can make their digests.",
  redditUnreadableFilled:
    "Threadsift can no longer open your saved Reddit session. Until you connect the account again, Threadsift tries to fill Reddit links from the Arctic Shift archive. Any link it can’t fill stays a link-only item, saved without its thread.",
  redditUnreadableLinkOnly:
    "Threadsift can no longer open your saved Reddit session. Reddit links stay link-only items, saved without their threads. Connect the account again, or save threads from your tab with the browser extension.",
  redditSettingsLink: "Reddit account settings",
} as const;

const REDDIT_WAIT_ONE = `Reddit allows about ${String(REDDIT_WINDOW_REQUESTS)} requests every 10 minutes. If a long thread uses them up, Threadsift waits up to 10 minutes, or up to an hour if Reddit reports too many requests. If the link waits, the library shows the time of its next check.`;

const REDDIT_WAIT_MANY = `Reddit allows about ${String(REDDIT_WINDOW_REQUESTS)} requests every 10 minutes. When those run out, Threadsift waits up to 10 minutes, or up to an hour if Reddit reports too many requests. The library shows each waiting link with the time of its next check.`;

const REDDIT_NOTE_ONE = `1 link is a Reddit post or comment. Threadsift reads it with the connected Reddit account. ${REDDIT_WAIT_ONE}`;

const REDDIT_NOTE_MANY = `{count} links are Reddit posts or comments. Threadsift reads them one at a time with the connected Reddit account. ${REDDIT_WAIT_MANY}`;

const REDDIT_DONE_ONE =
  "1 Reddit link is saved. Threadsift continues reading it in the background, and the library shows the link’s wait.";

const REDDIT_DONE_MANY =
  "{count} Reddit links are saved. Threadsift continues reading them one at a time in the background, and the library shows each link’s wait.";

const READY_SINGULAR = "{count} link ready";
const READY_PLURAL = "{count} links ready";

const SKIPPED: Readonly<Record<SkipReason, { singular: string; plural: string; lead: string }>> = {
  noLink: {
    singular: "1 line has no link and was skipped.",
    plural: "{count} lines have no link and were skipped.",
    lead: "Skipped lines",
  },
  tooLong: {
    singular: "1 link is too long to send and was skipped.",
    plural: "{count} links are too long to send and were skipped.",
    lead: "Skipped links",
  },
};

const SKIPPED_LINE = "Line {line}";
const SKIPPED_MORE = "and {count} more";

const RESUME_PARTIAL =
  "Threadsift already imported {done} of {total} links from this list. Continue starts at the next link.";

const PROGRESS_ONE = "{done} of {count} link";
const PROGRESS_MANY = "{done} of {count} links";
const STOPPED = "Import stopped at {done} of {total}.";

const PLAN_NOTICE =
  "Your provider is {provider}, so an import can use up your plan’s limits. A provider with an API key is a better fit.";

const FAILED = {
  restoring:
    "Import stopped at {done} of {total} because a restore is running. Start the import again when the restore finishes.",
  network: "Import stopped at {done} of {total} because the instance couldn’t be reached.",
  rejected: "Import stopped at {done} of {total} because the instance didn’t accept a batch.",
  unconfirmed:
    "Import stopped at {done} of {total} because the instance didn’t confirm that the last batch was saved. Continue sends that batch again, and links already saved count as known.",
} as const;

const UNCOUNTED_ONE =
  "The outcome of {count} link is missing from these counts because the instance was slow to answer.";

const UNCOUNTED_MANY =
  "The outcomes of {count} links are missing from these counts because the instance was slow to answer.";

const COUNTS = {
  added: "{count} added",
  known: "{count} known",
  refused: "{count} refused",
} as const;

const PLAN_NAMES: Readonly<Record<CliProvider, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

export type FailedEnding = keyof typeof FAILED;

export function readyLabel(count: number): string {
  return plural(count, READY_SINGULAR, READY_PLURAL);
}

export function skippedLabel(reason: SkipReason, count: number): string {
  const { singular, plural: many } = SKIPPED[reason];

  return plural(count, singular, many);
}

export function skippedLead(reason: SkipReason): string {
  return SKIPPED[reason].lead;
}

export function skippedLineLabel(line: number): string {
  return filled(SKIPPED_LINE, { line: groupedNumber(line) });
}

export function skippedMoreLabel(count: number): string {
  return filled(SKIPPED_MORE, { count: groupedNumber(count) });
}

export function resumePartialLabel(done: number, total: number): string {
  return filled(RESUME_PARTIAL, { done: groupedNumber(done), total: groupedNumber(total) });
}

export function progressLabel(done: number, total: number): string {
  return plural(total, PROGRESS_ONE, PROGRESS_MANY, { done: groupedNumber(done) });
}

export function stoppedLabel(done: number, total: number): string {
  return filled(STOPPED, { done: groupedNumber(done), total: groupedNumber(total) });
}

export function failedLabel(ending: FailedEnding, done: number, total: number): string {
  return filled(FAILED[ending], { done: groupedNumber(done), total: groupedNumber(total) });
}

export function uncountedLabel(count: number): string {
  return plural(count, UNCOUNTED_ONE, UNCOUNTED_MANY);
}

export function countLabel(count: number, kind: keyof typeof COUNTS): string {
  return filled(COUNTS[kind], { count: groupedNumber(count) });
}

export function planNoticeLabel(provider: CliProvider): string {
  return filled(PLAN_NOTICE, { provider: PLAN_NAMES[provider] });
}

export function redditNoteLabel(count: number, finished: boolean): string {
  return finished
    ? plural(count, REDDIT_DONE_ONE, REDDIT_DONE_MANY)
    : plural(count, REDDIT_NOTE_ONE, REDDIT_NOTE_MANY);
}
