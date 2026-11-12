import type { ProposalKind } from "../../src/core/kinds.ts";
import type { Proposal } from "../../src/core/proposal-contract.ts";
import { filled } from "./text.ts";

export const PROPOSALS_PAGE = {
  masthead: "Proposals",
  title: "Proposals",
  loading: "Loading proposals…",
  loadFailed: "Couldn’t load proposals.",
  emptyHeading: "No proposals yet",
  loadMoreFailed: "Couldn’t load more proposals.",
  sort: "Newest first",
  head: "Accepting a tag merge can’t be undone in this release. Rejecting is final: that pair of tags or topics won’t be proposed again.",
} as const;

const EMPTY_NO_PROVIDER = "Save a provider in the instance settings to run the weekly check.";
const EMPTY_NOT_CHECKED = "Proposals appear here once the weekly check runs.";
const EMPTY_CHECKED = "The last check started on {date}. No proposals are open now.";

export function proposalsEmptyLine(provider: boolean, checkedDate: string | null): string {
  if (!provider) return EMPTY_NO_PROVIDER;

  return checkedDate === null ? EMPTY_NOT_CHECKED : filled(EMPTY_CHECKED, { date: checkedDate });
}

const MERGE_WORDS = {
  "tag-merge": {
    effect: "Merge {from} into {into}",
    rejectNamed: "Reject merging {from} into {into}",
    rejectRetryNamed: "Try again to reject merging {from} into {into}",
    rejected: "Rejected merging {from} into {into}.",
  },
  "topic-merge": {
    effect: "Merge topic {from} into {into}",
    rejectNamed: "Reject merging topic {from} into {into}",
    rejectRetryNamed: "Try again to reject merging topic {from} into {into}",
    rejected: "Rejected merging topic {from} into {into}.",
  },
} as const satisfies Record<ProposalKind, Record<string, string>>;

export const PROPOSAL_WORDS = {
  itemsOne: "1 item",
  itemsMany: "{count} items",
  accept: "Accept",
  acceptNamed: "Accept merging {from} into {into}",
  acceptRetryNamed: "Try again to accept merging {from} into {into}",
  accepted: "Accepted merging {from} into {into}.",
  acceptFailed: "Couldn’t accept this proposal.",
  applying: "Applying…",
  busy: "Another merge is already running.",
  reject: "Reject",
  rejectFailed: "Couldn’t reject this proposal.",
  alreadyDecided: "This proposal was already decided or is no longer in the list.",
  reasonLabel: "Reason",
} as const;

export function mergeEffect(kind: ProposalKind): string {
  return MERGE_WORDS[kind].effect;
}

export function itemCount(count: number): string {
  return count === 1
    ? PROPOSAL_WORDS.itemsOne
    : filled(PROPOSAL_WORDS.itemsMany, { count: String(count) });
}

function merging(wording: "rejectNamed" | "rejectRetryNamed" | "rejected") {
  return ({ kind, from, into }: Readonly<Proposal>): string =>
    filled(MERGE_WORDS[kind][wording], { from: from.name, into: into.name });
}

export const rejectLabel = merging("rejectNamed");

export const rejectRetryLabel = merging("rejectRetryNamed");

export const rejectedAnnouncement = merging("rejected");

export function acceptLabel(from: string, into: string): string {
  return filled(PROPOSAL_WORDS.acceptNamed, { from, into });
}

export function acceptRetryLabel(from: string, into: string): string {
  return filled(PROPOSAL_WORDS.acceptRetryNamed, { from, into });
}

export function acceptedAnnouncement(from: string, into: string): string {
  return filled(PROPOSAL_WORDS.accepted, { from, into });
}
