import { plural } from "./plural.ts";

export const INDEX_PAGE = {
  masthead: "Index",
  title: "Index",
  loading: "Loading topics…",
  loadFailed: "Couldn’t load topics.",
  emptyHeading: "No topics yet",
  emptyLine:
    "Topics appear here when Threadsift makes an item’s digest, which needs a saved provider.",
  loadMoreFailed: "Couldn’t load more topics.",
  sort: "Alphabetical",
} as const;

const HEAD_ONE = "1 topic";
const HEAD_MANY = "{count} topics";

export function indexHeadLabel(total: number): string {
  return plural(total, HEAD_ONE, HEAD_MANY);
}
