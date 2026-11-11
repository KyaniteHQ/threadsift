import { filled } from "./text.ts";

export const LOG_PAGE = {
  masthead: "Log",
  title: "Log",
  loading: "Loading the log…",
  loadFailed: "Couldn’t load the log.",
  emptyHeading: "Nothing in the log yet",
  loadMoreFailed: "Couldn’t load more of the log.",
  sort: "Newest first",
} as const;

const EMPTY_LINE = "The log began on {date}. Changes the agent makes from then on appear here.";
const SINCE = "Since {date}";

export function logEmptyLine(date: string): string {
  return filled(EMPTY_LINE, { date });
}

export function logSince(date: string): string {
  return filled(SINCE, { date });
}

export const LOG_WORDS = {
  topic: "topic:",
  tags: "tags:",
} as const;

export function addedRemoved(added: number, removed: number): string {
  return `${String(added)} added, ${String(removed)} removed`;
}

export function picksLabel(picks: number): string {
  return picks === 1 ? "1 pick" : `${String(picks)} picks`;
}
