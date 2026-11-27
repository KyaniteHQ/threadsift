import { UNTITLED } from "../../src/core/contract/reader-text.ts";
import { NEWEST_FIRST } from "./text.ts";

export const HIGHLIGHTS_PAGE = {
  masthead: "Highlights",
  title: "Highlights",
  searchLabel: "Search highlights and notes",
  searchPlaceholder: "Highlights and notes",
  loading: "Loading highlights and notes…",
  loadFailed: "Couldn’t load highlights and notes.",
  emptyHeading: "No highlights or notes yet",
  emptyLine:
    "Highlights and notes from the reader appear here; select a passage and choose Keep, or write in the Note box.",
  sort: NEWEST_FIRST,
  noResults: "No highlights or notes match",
  kindHighlight: "Highlight",
  kindNote: "Note",
  untitled: UNTITLED,
  loadMoreFailed: "Couldn’t load more highlights and notes.",
} as const;
