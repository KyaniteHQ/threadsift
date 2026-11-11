import { filled } from "./text.ts";

export const PROPOSALS_PAGE = {
  masthead: "Proposals",
  title: "Proposals",
  loading: "Loading proposals…",
  loadFailed: "Couldn’t load proposals.",
  emptyHeading: "No proposals yet",
  loadMoreFailed: "Couldn’t load more proposals.",
  sort: "Newest first",
  head: "Rejecting is final: that pair of tags won’t be proposed again.",
} as const;

const EMPTY_NO_PROVIDER = "Save a provider in the instance settings to run the weekly check.";
const EMPTY_NOT_CHECKED = "Proposals appear here once the weekly check runs.";
const EMPTY_CHECKED = "The last check started on {date}. No proposals are open now.";

export function proposalsEmptyLine(provider: boolean, checkedDate: string | null): string {
  if (!provider) return EMPTY_NO_PROVIDER;

  return checkedDate === null ? EMPTY_NOT_CHECKED : filled(EMPTY_CHECKED, { date: checkedDate });
}

export const PROPOSAL_WORDS = {
  effect: "Merge {from} into {into}",
  itemsOne: "1 item",
  itemsMany: "{count} items",
  reject: "Reject",
  rejectNamed: "Reject merging {from} into {into}",
  rejectRetryNamed: "Try again to reject merging {from} into {into}",
  rejected: "Rejected merging {from} into {into}.",
  rejectFailed: "Couldn’t reject this proposal.",
  alreadyDecided: "This proposal was already rejected or is no longer in the list.",
  reasonLabel: "Reason",
} as const;

export function itemsOfTag(count: number): string {
  return count === 1
    ? PROPOSAL_WORDS.itemsOne
    : filled(PROPOSAL_WORDS.itemsMany, { count: String(count) });
}

export function rejectLabel(from: string, into: string): string {
  return filled(PROPOSAL_WORDS.rejectNamed, { from, into });
}

export function rejectRetryLabel(from: string, into: string): string {
  return filled(PROPOSAL_WORDS.rejectRetryNamed, { from, into });
}

export function rejectedAnnouncement(from: string, into: string): string {
  return filled(PROPOSAL_WORDS.rejected, { from, into });
}
