import type { LogAction } from "../../src/core/contract/log-actions.ts";
import { filled } from "./filled.ts";
import { plural } from "./plural.ts";
import { NEWEST_FIRST } from "./text.ts";

export const LOG_PAGE = {
  masthead: "Log",
  title: "Log",
  loading: "Loading the log…",
  loadFailed: "Couldn’t load the log.",
  emptyHeading: "Nothing in the log yet",
  loadMoreFailed: "Couldn’t load more of the log.",
  sort: NEWEST_FIRST,
} as const;

const EMPTY_LINE = "The log began on {date}. Changes the agent makes from then on appear here.";
const SINCE = "Since {date}";

export function logEmptyLine(date: string): string {
  return filled(EMPTY_LINE, { date });
}

export function logSince(date: string): string {
  return filled(SINCE, { date });
}

export const LOG_COLUMNS = {
  time: "Time",
  change: "Change",
  subject: "Subject",
  details: "Details",
} as const;

export const LOG_CHANGES = {
  ingest: "Digest written",
  digest: "Digest refreshed",
  topic: "Topic created",
  overview: "Overview updated",
  related: "Related items picked",
  merge: "Tag merged",
  "merge-topic": "Topic merged",
  "vault-file-skipped": "Vault file skipped",
  "vault-file-conflict": "Vault file blocked",
} as const satisfies Readonly<Record<LogAction, string>>;

export function addedRemoved(added: number, removed: number): string {
  return `${String(added)} added, ${String(removed)} removed`;
}

export function mergeLabel(from: string, into: string): string {
  return filled("{from} into {into}", { from, into });
}

export function logItemsLabel(items: number): string {
  return plural(items, "1 item", "{count} items");
}
