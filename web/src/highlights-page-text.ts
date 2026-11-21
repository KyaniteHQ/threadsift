import { UNTITLED } from "../../src/core/contract/reader-text.ts";
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
  untitled: UNTITLED,
  loadMoreFailed: "Couldn’t load more highlights and notes.",
} as const;
