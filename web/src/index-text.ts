import { plural } from "./plural.ts";

export const INDEX_PAGE = {
  masthead: "Index",
  title: "Index",
  loading: "Loading Topics…",
  loadFailed: "Couldn’t load the Topics.",
  emptyHeading: "No Topics yet",
  emptyLine: "Topics appear here once Items are saved and sorted.",
  loadMoreFailed: "Couldn’t load more Topics.",
  sort: "Alphabetical",
} as const;

const HEAD_ONE = "1 Topic";
const HEAD_MANY = "{count} Topics";

export function indexHeadLabel(total: number): string {
  return plural(total, HEAD_ONE, HEAD_MANY);
}
