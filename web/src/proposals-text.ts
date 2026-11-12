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
  head: "Accepting a merge can’t be undone in this release, and accepting removes a highlight for good. Accepting an overview update starts a model run for that topic. Rejecting is final: that tag, topic or item pair, highlight or topic stays as it is and won’t be proposed again.",
} as const;

const EMPTY_NO_PROVIDER = "Save a provider in the instance settings to run the weekly check.";
const EMPTY_NOT_CHECKED = "Proposals appear here once the weekly check runs.";
const EMPTY_CHECKED = "The last check started on {date}. No proposals are open now.";

export function proposalsEmptyLine(provider: boolean, checkedDate: string | null): string {
  if (!provider) return EMPTY_NO_PROVIDER;

  return checkedDate === null ? EMPTY_NOT_CHECKED : filled(EMPTY_CHECKED, { date: checkedDate });
}

type Wording = "effect" | "rejectNamed" | "rejectRetryNamed" | "rejected";

type AcceptWording = "acceptNamed" | "acceptRetryNamed" | "accepted" | "notCurrent";

const ALREADY_DECIDED = "This proposal was already decided or is no longer in the list.";

const WORDS = {
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
  "highlight-lost": {
    effect: "Remove this highlight",
    rejectNamed: "Reject removing highlight “{quote}” from {title}",
    rejectRetryNamed: "Try again to reject removing highlight “{quote}” from {title}",
    rejected: "Rejected removing highlight “{quote}” from {title}.",
  },
  "overview-gap": {
    effect: "Update the overview of topic {topic}",
    rejectNamed: "Reject updating the overview of topic {topic}",
    rejectRetryNamed: "Try again to reject updating the overview of topic {topic}",
    rejected: "Rejected updating the overview of topic {topic}.",
  },
  "items-disagree": {
    effect: "These two items disagree in topic {topic}",
    rejectNamed: "Reject the disagreement between {first} and {second}",
    rejectRetryNamed: "Try again to reject the disagreement between {first} and {second}",
    rejected: "Rejected the disagreement between {first} and {second}.",
  },
} as const satisfies Record<ProposalKind, Record<Wording, string>>;

const ACCEPT_WORDS = {
  "tag-merge": {
    acceptNamed: "Accept merging {from} into {into}",
    acceptRetryNamed: "Try again to accept merging {from} into {into}",
    accepted: "Accepted merging {from} into {into}.",
    notCurrent: ALREADY_DECIDED,
  },
  "topic-merge": {
    acceptNamed: "Accept merging topic {from} into {into}",
    acceptRetryNamed: "Try again to accept merging topic {from} into {into}",
    accepted: "Accepted merging topic {from} into {into}.",
    notCurrent: ALREADY_DECIDED,
  },
  "highlight-lost": {
    acceptNamed: "Accept removing highlight “{quote}” from {title}",
    acceptRetryNamed: "Try again to accept removing highlight “{quote}” from {title}",
    accepted: "Accepted removing highlight “{quote}” from {title}.",
    notCurrent: "Passage found in the item’s text again. The highlight stays; nothing was removed.",
  },
  "overview-gap": {
    acceptNamed: "Accept updating the overview of topic {topic}",
    acceptRetryNamed: "Try again to accept updating the overview of topic {topic}",
    accepted: "Accepted updating the overview of topic {topic}.",
    notCurrent:
      "Every item of this topic is in the overview now, or a run for the topic is already open; nothing was started.",
  },
} as const satisfies Partial<Record<ProposalKind, Record<AcceptWording, string>>>;

type AcceptableKind = keyof typeof ACCEPT_WORDS;

export type AcceptableProposal = Extract<Proposal, { readonly kind: AcceptableKind }>;

export function isAcceptable(proposal: Readonly<Proposal>): proposal is AcceptableProposal {
  return proposal.kind in ACCEPT_WORDS;
}

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
  alreadyDecided: ALREADY_DECIDED,
  overviewCounts: "Items not in the overview: {uncovered} of {items}",
  overviewCost:
    "Accept writes the topic’s overview again: each call covers up to 40 items, so many items can take several calls, and the run stops when a call fails.",
  noProvider:
    "Save a provider in the instance settings to update the overview; this row stays and Accept works after that.",
  reasonLabel: "Reason",
  summaryLabel: "Summary",
} as const;

export function mergeEffect(kind: MergeKind): string {
  return WORDS[kind].effect;
}

export const LOST_HIGHLIGHT_EFFECT = WORDS["highlight-lost"].effect;

const [EFFECT_BEFORE = "", EFFECT_AFTER = ""] = WORDS["overview-gap"].effect.split("{topic}");

export const OVERVIEW_GAP_EFFECT = { before: EFFECT_BEFORE, after: EFFECT_AFTER } as const;

const [DISAGREE_BEFORE = "", DISAGREE_AFTER = ""] = WORDS["items-disagree"].effect.split("{topic}");

export const ITEMS_DISAGREE_EFFECT = { before: DISAGREE_BEFORE, after: DISAGREE_AFTER } as const;

export function itemCount(count: number): string {
  return count === 1
    ? PROPOSAL_WORDS.itemsOne
    : filled(PROPOSAL_WORDS.itemsMany, { count: String(count) });
}

const QUOTE_CUT = 40;

function quoteCut(quote: string): string {
  const letters = Array.from(quote.replaceAll(/\s+/gu, " ").trim());

  return letters.length > QUOTE_CUT
    ? `${letters.slice(0, QUOTE_CUT).join("").trimEnd()}…`
    : letters.join("");
}

function slotsOf(proposal: Readonly<Proposal>) {
  switch (proposal.kind) {
    case "tag-merge":
    case "topic-merge":
      return { from: proposal.from.name, into: proposal.into.name };
    case "highlight-lost":
      return {
        quote: quoteCut(proposal.highlight.quote),
        title: proposal.highlight.item.title ?? HIGHLIGHTS_PAGE.untitled,
      };
    case "overview-gap":
      return { topic: proposal.topic.name };
    case "items-disagree":
      return { first: proposal.first.title, second: proposal.second.title };
    default:
      return proposal satisfies never;
  }
}

function wordedBy<Kind extends ProposalKind, Word extends string>(
  words: Readonly<Record<Kind, Readonly<Record<Word, string>>>>,
  wording: Word,
) {
  return (proposal: Readonly<Extract<Proposal, { readonly kind: Kind }>>): string =>
    filled(words[proposal.kind][wording], slotsOf(proposal));
}

export const rejectLabel = wordedBy(WORDS, "rejectNamed");

export const rejectRetryLabel = wordedBy(WORDS, "rejectRetryNamed");

export const rejectedAnnouncement = wordedBy(WORDS, "rejected");

export const acceptLabel = wordedBy(ACCEPT_WORDS, "acceptNamed");

export const acceptRetryLabel = wordedBy(ACCEPT_WORDS, "acceptRetryNamed");

export const acceptedAnnouncement = wordedBy(ACCEPT_WORDS, "accepted");

export const notCurrentNote = wordedBy(ACCEPT_WORDS, "notCurrent");

export function overviewCounts({
  uncovered,
  items,
}: Readonly<{ uncovered: number; items: number }>) {
  return filled(PROPOSAL_WORDS.overviewCounts, {
    uncovered: String(uncovered),
    items: String(items),
  });
}
