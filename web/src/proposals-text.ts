import type { MergeKind, ProposalKind } from "../../src/core/kinds.ts";
import type { Proposal } from "../../src/core/proposal-contract.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { filled } from "./text.ts";

export const PROPOSALS_PAGE = {
  masthead: "Proposals",
  title: "Proposals",
  loading: "Loading proposals…",
  loadFailed: "Couldn’t load proposals.",
  emptyHeading: "No proposals yet",
  loadMoreFailed: "Couldn’t load more proposals.",
  sort: "Newest first",
  head: "Accepting a merge can’t be undone in this release; accepting removes a highlight for good. Rejecting is final: that tag or topic pair or highlight stays as it is and won’t be proposed again.",
} as const;

const EMPTY_NO_PROVIDER = "Save a provider in the instance settings to run the weekly check.";
const EMPTY_NOT_CHECKED = "Proposals appear here once the weekly check runs.";
const EMPTY_CHECKED = "The last check started on {date}. No proposals are open now.";

export function proposalsEmptyLine(provider: boolean, checkedDate: string | null): string {
  if (!provider) return EMPTY_NO_PROVIDER;

  return checkedDate === null ? EMPTY_NOT_CHECKED : filled(EMPTY_CHECKED, { date: checkedDate });
}

type Wording =
  | "effect"
  | "acceptNamed"
  | "acceptRetryNamed"
  | "accepted"
  | "rejectNamed"
  | "rejectRetryNamed"
  | "rejected";

const WORDS = {
  "tag-merge": {
    effect: "Merge {from} into {into}",
    acceptNamed: "Accept merging {from} into {into}",
    acceptRetryNamed: "Try again to accept merging {from} into {into}",
    accepted: "Accepted merging {from} into {into}.",
    rejectNamed: "Reject merging {from} into {into}",
    rejectRetryNamed: "Try again to reject merging {from} into {into}",
    rejected: "Rejected merging {from} into {into}.",
  },
  "topic-merge": {
    effect: "Merge topic {from} into {into}",
    acceptNamed: "Accept merging topic {from} into {into}",
    acceptRetryNamed: "Try again to accept merging topic {from} into {into}",
    accepted: "Accepted merging topic {from} into {into}.",
    rejectNamed: "Reject merging topic {from} into {into}",
    rejectRetryNamed: "Try again to reject merging topic {from} into {into}",
    rejected: "Rejected merging topic {from} into {into}.",
  },
  "highlight-lost": {
    effect: "Remove this highlight",
    acceptNamed: "Accept removing highlight from {title}",
    acceptRetryNamed: "Try again to accept removing highlight from {title}",
    accepted: "Accepted removing highlight from {title}.",
    rejectNamed: "Reject removing highlight from {title}",
    rejectRetryNamed: "Try again to reject removing highlight from {title}",
    rejected: "Rejected removing highlight from {title}.",
  },
} as const satisfies Record<ProposalKind, Record<Wording, string>>;

export const PROPOSAL_WORDS = {
  itemsOne: "1 item",
  itemsMany: "{count} items",
  accept: "Accept",
  acceptFailed: "Couldn’t accept this proposal.",
  applying: "Applying…",
  mergeBusy: "Another merge is already running.",
  topicBusy: "One of these topics has an overview or another merge running.",
  topicOverviewEffect:
    "The surviving topic’s overview is written again later and counts the moved items.",
  reject: "Reject",
  rejectFailed: "Couldn’t reject this proposal.",
  alreadyDecided: "This proposal was already decided or is no longer in the list.",
  reasonLabel: "Reason",
  notCurrent: "Passage found in the item’s text again. The highlight stays; nothing was removed.",
} as const;

export function mergeEffect(kind: MergeKind): string {
  return WORDS[kind].effect;
}

export const LOST_HIGHLIGHT_EFFECT = WORDS["highlight-lost"].effect;

export function itemCount(count: number): string {
  return count === 1
    ? PROPOSAL_WORDS.itemsOne
    : filled(PROPOSAL_WORDS.itemsMany, { count: String(count) });
}

function slotsOf(proposal: Readonly<Proposal>): Readonly<Record<string, string>> {
  return proposal.kind === "highlight-lost"
    ? { title: proposal.highlight.item.title ?? HIGHLIGHTS_PAGE.untitled }
    : { from: proposal.from.name, into: proposal.into.name };
}

function wordedBy(wording: Wording) {
  return (proposal: Readonly<Proposal>): string =>
    filled(WORDS[proposal.kind][wording], slotsOf(proposal));
}

export const rejectLabel = wordedBy("rejectNamed");

export const rejectRetryLabel = wordedBy("rejectRetryNamed");

export const rejectedAnnouncement = wordedBy("rejected");

export const acceptLabel = wordedBy("acceptNamed");

export const acceptRetryLabel = wordedBy("acceptRetryNamed");

export const acceptedAnnouncement = wordedBy("accepted");
