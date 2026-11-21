import { collapsed } from "../../src/core/contract/format.ts";
import type {
  MergeKind,
  ProposalKind,
  MergeProposal,
  Proposal,
} from "../../src/core/contract/proposal-contract.ts";
import { ADDED_READ_LIMIT } from "../../src/core/contract/topic-overview-contract.ts";
import { filled } from "./filled.ts";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { plural } from "./plural.ts";
import { NEWEST_FIRST } from "./text.ts";

export const PROPOSALS_PAGE = {
  masthead: "Proposals",
  title: "Proposals",
  loading: "Loading proposals…",
  loadFailed: "Couldn’t load proposals.",
  emptyHeading: "No proposals yet",
  loadMoreFailed: "Couldn’t load more proposals.",
  sort: NEWEST_FIRST,
  head: "Accepting a merge can’t be undone in this release, and accepting removes a highlight for good. Accepting an overview update starts a model run for that topic, and accepting a disagreement keeps the pair on the topic page. Rejecting is final: that tag, topic or item pair, highlight or topic stays as it is and won’t be proposed again.",
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

const ALREADY_DECIDED = "This proposal was already decided or is no longer in the list.";

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
    acceptNamed: "Accept removing highlight “{quote}” from {title}",
    acceptRetryNamed: "Try again to accept removing highlight “{quote}” from {title}",
    accepted: "Accepted removing highlight “{quote}” from {title}.",
    rejectNamed: "Reject removing highlight “{quote}” from {title}",
    rejectRetryNamed: "Try again to reject removing highlight “{quote}” from {title}",
    rejected: "Rejected removing highlight “{quote}” from {title}.",
  },
  "overview-gap": {
    effect: "Update the overview of topic {topic}",
    acceptNamed: "Accept updating the overview of topic {topic}",
    acceptRetryNamed: "Try again to accept updating the overview of topic {topic}",
    accepted: "Accepted updating the overview of topic {topic}.",
    rejectNamed: "Reject updating the overview of topic {topic}",
    rejectRetryNamed: "Try again to reject updating the overview of topic {topic}",
    rejected: "Rejected updating the overview of topic {topic}.",
  },
  "items-disagree": {
    effect: "These two items disagree in topic {topic}",
    acceptNamed:
      "Accept keeping the disagreement between {first} “{firstSummary}” and {second} “{secondSummary}”",
    acceptRetryNamed:
      "Try again to accept keeping the disagreement between {first} “{firstSummary}” and {second} “{secondSummary}”",
    accepted:
      "Accepted keeping the disagreement between {first} “{firstSummary}” and {second} “{secondSummary}”.",
    rejectNamed:
      "Reject the disagreement between {first} “{firstSummary}” and {second} “{secondSummary}”",
    rejectRetryNamed:
      "Try again to reject the disagreement between {first} “{firstSummary}” and {second} “{secondSummary}”",
    rejected:
      "Rejected the disagreement between {first} “{firstSummary}” and {second} “{secondSummary}”.",
  },
} as const satisfies Record<ProposalKind, Record<Wording, string>>;

export function isMerge(proposal: Readonly<Proposal>): proposal is MergeProposal {
  return proposal.kind === "tag-merge" || proposal.kind === "topic-merge";
}

export const PROPOSAL_WORDS = {
  accept: "Accept",
  acceptFailed: "Couldn’t accept this proposal.",
  applying: "Applying…",
  applyFailedOnce:
    "Applying this merge failed once. The server log has a merge-unit-failed line with the error class and any database code.",
  applyFailedMany:
    "Applying this merge failed {count} times. The server log has a merge-unit-failed line with the error class and any database code.",
  mergeBusy: "Another merge is already running.",
  topicOverviewEffect:
    "The surviving topic’s overview is written again later and counts the moved items.",
  reject: "Reject",
  rejectFailed: "Couldn’t reject this proposal.",
  alreadyDecided: ALREADY_DECIDED,
  overviewCounts: "Items not in the overview: {uncovered} of {items}",
  overviewCost: `Accept writes the topic’s overview again: each call covers up to ${String(ADDED_READ_LIMIT)} items, so many items can take several calls, and the run stops when a call fails.`,
  noProvider:
    "Save a provider in the instance settings to update the overview; this row stays and Accept works after that.",
  disagreementKept:
    "Accept keeps this pair on the topic page under Known disagreements, and changes nothing in the items.",
  reasonLabel: "Reason",
  summaryLabel: "Summary",
  sideNamed: "disagrees with {other}",
} as const;

export function mergeEffect(kind: MergeKind): string {
  return WORDS[kind].effect;
}

export const LOST_HIGHLIGHT_EFFECT = WORDS["highlight-lost"].effect;

const [EFFECT_BEFORE = "", EFFECT_AFTER = ""] = WORDS["overview-gap"].effect.split("{topic}");

export const OVERVIEW_GAP_EFFECT = { before: EFFECT_BEFORE, after: EFFECT_AFTER } as const;

const [DISAGREE_BEFORE = "", DISAGREE_AFTER = ""] = WORDS["items-disagree"].effect.split("{topic}");

export const ITEMS_DISAGREE_EFFECT = { before: DISAGREE_BEFORE, after: DISAGREE_AFTER } as const;

export function sideNamedWords(other: string): string {
  return filled(PROPOSAL_WORDS.sideNamed, { other });
}

export function applyFailedNote(failedRuns: number): string {
  return plural(failedRuns, PROPOSAL_WORDS.applyFailedOnce, PROPOSAL_WORDS.applyFailedMany);
}

const TEXT_CUT = 40;

function textCut(text: string): string {
  const letters = Array.from(collapsed(text));

  return letters.length > TEXT_CUT
    ? `${letters.slice(0, TEXT_CUT).join("").trimEnd()}…`
    : letters.join("");
}

function slotsOf(proposal: Readonly<Proposal>) {
  switch (proposal.kind) {
    case "tag-merge":
    case "topic-merge":
      return { from: proposal.from.name, into: proposal.into.name };
    case "highlight-lost":
      return {
        quote: textCut(proposal.highlight.quote),
        title: proposal.highlight.item.title ?? HIGHLIGHTS_PAGE.untitled,
      };
    case "overview-gap":
      return { topic: proposal.topic.name };
    case "items-disagree":
      return {
        first: proposal.first.title,
        firstSummary: textCut(proposal.first.summary),
        second: proposal.second.title,
        secondSummary: textCut(proposal.second.summary),
      };
    default:
      return proposal satisfies never;
  }
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

export function overviewCounts({
  uncovered,
  items,
}: Readonly<{ uncovered: number; items: number }>) {
  return filled(PROPOSAL_WORDS.overviewCounts, {
    uncovered: String(uncovered),
    items: String(items),
  });
}
