import { filled } from "./filled.ts";
import { plural } from "./plural.ts";

export const TOPIC_PAGE = {
  overviewHeading: "Overview",
  overviewPending: "Writing overview…",
  overviewFailed: "Couldn’t write the overview.",
  overviewNone: "No overview yet.",
  writeOverview: "Write overview",
  noProvider:
    "No overview is written until a Provider is set in Instance settings. The Items still show below.",
  builtFromOne: "Built from 1 Item",
  notInOverview: "Not in overview yet",
  loading: "Loading Topic…",
  loadFailed: "Couldn’t load this Topic.",
  notFoundHeading: "Topic not found",
  notFoundLine: "Go back to the library to see the Items.",
  emptyHeading: "No Items in this Topic",
  emptyLine: "This Topic has no Items in the library.",
  loadMoreFailed: "Couldn’t load more Items.",
  openPage: "Open Topic page",
  disagreementsHeading: "Known disagreements",
  disagreementsEntryLabel: "Items in this disagreement",
} as const;

const BUILT_FROM_SOME = "Built from {built} of {total} Items";
const BUILT_FROM_ALL = "Built from all {total} Items";
const ITEMS_ONE = "1 Item";
const ITEMS_MANY = "{count} Items";
const CITATION_LABEL = "Open Item {title}";
const TOPIC_LINK = "Open Topic page for {name}";

export function builtFromLabel(built: number, total: number): string {
  if (total === 1) return TOPIC_PAGE.builtFromOne;

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
