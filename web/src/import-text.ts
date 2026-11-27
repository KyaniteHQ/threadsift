import { groupedNumber } from "../../src/core/contract/format.ts";
import type { SkipReason } from "../../src/core/contract/import-list.ts";
import { REDDIT_WINDOW_REQUESTS } from "../../src/core/contract/limits.ts";
import type { CliProvider } from "../../src/core/contract/provider-families.ts";
import { filled } from "./filled.ts";
import { RETRY_LABEL } from "./text.ts";

export const IMPORT = {
  settingsLink: "Import",
  title: "Import",
  lede: "Paste one link per line, or choose a .csv or .txt file. A Reddit saved_posts.csv works as it is, and other CSV files can use a permalink or url column.",
  boxLabel: "Links",
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
    "Known links are already in the library and stay as they are. Refused links point to private addresses, which the instance won’t fetch.",
  stop: "Stop",
  stopping: "Stopping…",
  stoppingStatus: "The import stops after the current batch.",
  waiting: "The instance is slow to answer. Waiting to confirm whether the last batch was saved…",
  finished: "Import finished.",
  aiSettingsLink: "AI settings",
  noProvider:
    "No provider is saved yet. Each item is saved now and gets its digest once you save a provider.",
  redditExpired:
    "Your Reddit session has expired. Reddit links are filled from the archive until you connect the account again.",
  redditUnreadableFilled:
    "Threadsift can no longer open your Reddit session because this instance’s secret key changed. Reddit links are filled from the archive until you connect the account again.",
  redditUnreadableLinkOnly:
    "Threadsift can no longer open your Reddit session because this instance’s secret key changed. Reddit links stay link-only items, saved without their threads. Connect the account again, or save the threads with the extension.",
  redditSettingsLink: "Reddit account settings",
} as const;

const REDDIT_WAIT_ONE = `Reddit allows about ${String(REDDIT_WINDOW_REQUESTS)} requests every 10 minutes, so a long thread can take up to 10 minutes. The library shows that link’s wait.`;

const REDDIT_WAIT_MANY = `Reddit allows about ${String(REDDIT_WINDOW_REQUESTS)} requests every 10 minutes, so a long thread can take up to 10 minutes. The library shows each link’s wait.`;

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

const PROGRESS_ONE = "{done} of {total} link";
const PROGRESS_MANY = "{done} of {total} links";
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
  return filled(count === 1 ? READY_SINGULAR : READY_PLURAL, { count: groupedNumber(count) });
}

export function skippedLabel(reason: SkipReason, count: number): string {
  const { singular, plural } = SKIPPED[reason];

  return count === 1 ? singular : filled(plural, { count: groupedNumber(count) });
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
  return filled(total === 1 ? PROGRESS_ONE : PROGRESS_MANY, {
    done: groupedNumber(done),
    total: groupedNumber(total),
  });
}

export function stoppedLabel(done: number, total: number): string {
  return filled(STOPPED, { done: groupedNumber(done), total: groupedNumber(total) });
}

export function failedLabel(ending: FailedEnding, done: number, total: number): string {
  return filled(FAILED[ending], { done: groupedNumber(done), total: groupedNumber(total) });
}

export function uncountedLabel(count: number): string {
  return filled(count === 1 ? UNCOUNTED_ONE : UNCOUNTED_MANY, { count: groupedNumber(count) });
}

export function countLabel(count: number, kind: keyof typeof COUNTS): string {
  return filled(COUNTS[kind], { count: groupedNumber(count) });
}

export function planNoticeLabel(provider: CliProvider): string {
  return filled(PLAN_NOTICE, { provider: PLAN_NAMES[provider] });
}

export function redditNoteLabel(count: number, finished: boolean): string {
  if (finished) {
    return count === 1
      ? REDDIT_DONE_ONE
      : filled(REDDIT_DONE_MANY, { count: groupedNumber(count) });
  }

  return count === 1 ? REDDIT_NOTE_ONE : filled(REDDIT_NOTE_MANY, { count: groupedNumber(count) });
}
