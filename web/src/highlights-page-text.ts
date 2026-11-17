import { HIGHLIGHTS_HEAD, headLabel } from "./head-label.ts";
import { NEWEST_FIRST } from "./text.ts";

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

export function pageHeadLabel(total: number, shown: number | null, text: string): string {
  return headLabel(HIGHLIGHTS_HEAD, { total, shown }, text);
}
