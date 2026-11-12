import { filled } from "./text.ts";

export const TOPIC_PAGE = {
  back: "Back to library",
  overviewHeading: "Overview",
  overviewPending: "Writing overview…",
  overviewFailed: "Couldn’t write the overview.",
  overviewNone: "No overview yet.",
  writeOverview: "Write overview",
  noProvider:
    "No overview is written until a Provider is set in Instance settings. The items still show below.",
  builtFromOne: "Built from 1 item",
  itemsOne: "1 item",
  notInOverview: "Not in overview yet",
  loading: "Loading topic…",
  loadFailed: "Couldn’t load this topic.",
  notFoundHeading: "Topic not found",
  notFoundLine: "Go back to the library to see your items.",
  emptyHeading: "No items in this topic",
  emptyLine: "This topic has no items in your library.",
  loadingMore: "Loading more…",
  loadMoreFailed: "Couldn’t load more items.",
  openPage: "Open topic page",
  disagreementsHeading: "Known disagreements",
  disagreementsEntryLabel: "Items in this disagreement",
} as const;

const BUILT_FROM_SOME = "Built from {built} of {total} items";
const BUILT_FROM_ALL = "Built from all {total} items";
const ITEMS_MANY = "{count} items";
const CITATION_LABEL = "Open item {title}";
const TOPIC_LINK = "Open topic page for {name}";

export function builtFromLabel(built: number, total: number): string {
  if (total === 1) return TOPIC_PAGE.builtFromOne;

  const values = { built: String(built), total: String(total) };

  return filled(built === total ? BUILT_FROM_ALL : BUILT_FROM_SOME, values);
}

export function itemsLabel(count: number): string {
  return count === 1 ? TOPIC_PAGE.itemsOne : filled(ITEMS_MANY, { count: String(count) });
}

export function citationLabel(title: string): string {
  return filled(CITATION_LABEL, { title });
}

export function topicLinkLabel(name: string): string {
  return filled(TOPIC_LINK, { name });
}
