import { filled } from "./text.ts";

export const INDEX_PAGE = {
  masthead: "Index",
  title: "Index",
  loading: "Loading topics…",
  loadFailed: "Couldn’t load your topics.",
  emptyHeading: "No topics yet",
  emptyLine: "Topics appear here once items are saved and sorted.",
  loadMoreFailed: "Couldn’t load more topics.",
  sort: "Alphabetical",
} as const;

const HEAD_ONE = "1 topic";
const HEAD_MANY = "{total} topics";

export function indexHeadLabel(total: number): string {
  return total === 1 ? HEAD_ONE : filled(HEAD_MANY, { total: String(total) });
}
