import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { HIGHLIGHTS_HEAD, headLabel } from "./head-label.ts";
import { matchedCount } from "./list-counts.ts";
import { NEWEST_FIRST } from "./text.ts";
import type { Ready } from "./use-highlights-page.ts";

export const HIGHLIGHTS_PAGE = {
  masthead: "Highlights",
  title: "Highlights",
  searchLabel: "Search highlights and notes",
  searchPlaceholder: "Search highlights and notes",
  loading: "Loading highlights and notes…",
  loadFailed: "Couldn’t load your highlights and notes.",
  emptyHeading: "No highlights or notes yet",
  emptyLine: "Select text in the Reader and keep it as a highlight, or write a note.",
  sort: NEWEST_FIRST,
  noResults: "No highlights or notes match",
  kindHighlight: "Highlight",
  kindNote: "Note",
  untitled: "Untitled",
  loadMoreFailed: "Couldn’t load more highlights and notes.",
} as const;

function pageHeadLabel(total: number, shown: number | null, text: string): string {
  return headLabel(HIGHLIGHTS_HEAD, { total, shown }, text);
}

export function highlightsHeadText(state: Readonly<Ready>, filters: Readonly<Filters>): string {
  if (state.counts.total === 0) return "";
  const shown = isFiltered(filters) ? matchedCount(state.counts, filters) : null;
  const text = isSearching(filters) ? filters.q.trim() : "";

  return pageHeadLabel(state.counts.total, shown, text);
}
