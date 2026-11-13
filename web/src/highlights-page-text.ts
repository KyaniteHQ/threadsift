import { NEWEST_FIRST, filled } from "./text.ts";

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

const HEAD_ONE = "1 highlight or note";
const HEAD_MANY = "{total} highlights and notes";
const HEAD_MATCHING = "{shown} of {total} highlights and notes";
const HEAD_MATCHING_TEXT = "{shown} of {total} highlights and notes matching “{text}”";

export function pageHeadLabel(total: number, shown: number | null, text: string): string {
  const values = { total: String(total), shown: String(shown ?? 0), text };

  if (shown === null) return filled(total === 1 ? HEAD_ONE : HEAD_MANY, values);

  return filled(text === "" ? HEAD_MATCHING : HEAD_MATCHING_TEXT, values);
}
