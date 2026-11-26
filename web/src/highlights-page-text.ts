import { UNTITLED } from "../../src/core/contract/reader-text.ts";
import { NEWEST_FIRST } from "./text.ts";

export const HIGHLIGHTS_PAGE = {
  masthead: "Highlights",
  title: "Highlights",
  searchLabel: "Search Highlights and Notes",
  searchPlaceholder: "Search Highlights and Notes",
  loading: "Loading Highlights and Notes…",
  loadFailed: "Couldn’t load Highlights and Notes.",
  emptyHeading: "No Highlights or Notes yet",
  emptyLine: "Select text in the Reader and keep it as a Highlight, or write a Note.",
  sort: NEWEST_FIRST,
  noResults: "No Highlights or Notes match",
  kindHighlight: "Highlight",
  kindNote: "Note",
  untitled: UNTITLED,
  loadMoreFailed: "Couldn’t load more Highlights and Notes.",
} as const;
