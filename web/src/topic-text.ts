import { filled } from "./filled.ts";
import { plural } from "./plural.ts";

export const TOPIC_PAGE = {
  backToIndex: "Back to Index",
  overviewHeading: "Overview",
  overviewPending: "Writing overview…",
  overviewFailed: "Couldn’t write the overview.",
  overviewNone: "No overview yet",
  writeOverview: "Write overview",
  noProvider:
    "Save a provider so Threadsift can write an overview. This topic’s items still show on this page.",
  builtFromOne: "Built from 1 item",
  builtFromNoneOfOne: "Built from 0 of 1 item",
  notInOverview: "Not in overview yet",
  loading: "Loading topic…",
  loadFailed: "Couldn’t load this topic.",
  notFoundHeading: "Topic not found",
  notFoundLine: "No topic has this address. Open Index to see all topics.",
  emptyHeading: "No items in this topic",
  emptyLine: "An item appears here when its digest puts it in this topic.",
  loadMoreFailed: "Couldn’t load more items.",
  openPage: "Open topic page",
  disagreementsHeading: "Known disagreements",
  disagreementsEntryLabel: "Items in this disagreement",
} as const;

const BUILT_FROM_SOME = "Built from {built} of {total} items";
const BUILT_FROM_ALL = "Built from all {total} items";
const ITEMS_ONE = "1 item";
const ITEMS_MANY = "{count} items";
const CITATION_LABEL = "Open item: {title}";
const TOPIC_LINK = "{name}, topic page";

export function builtFromLabel(built: number, total: number): string {
  if (total === 1) return built === 1 ? TOPIC_PAGE.builtFromOne : TOPIC_PAGE.builtFromNoneOfOne;

  const values = { built: String(built), total: String(total) };

  return filled(built === total ? BUILT_FROM_ALL : BUILT_FROM_SOME, values);
}

export function itemsLabel(count: number): string {
  return plural(count, ITEMS_ONE, ITEMS_MANY);
}

export function citationLabel(title: string): string {
  return filled(CITATION_LABEL, { title });
}

export function topicLinkLabel(name: string): string {
  return filled(TOPIC_LINK, { name });
}
