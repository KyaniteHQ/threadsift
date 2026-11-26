import type { HighlightsList } from "../../src/core/contract/highlights-page-wire.ts";
import { filled } from "./filled.ts";
import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { matchedCount } from "./list-counts.ts";

export const ITEM_HEAD = {
  one: "1 Item, {unread} unread",
  many: "{total} Items, {unread} unread",
  matching: "{shown} of {total} Items",
  matchingText: "{shown} of {total} Items matching “{text}”",
} as const;

export const HIGHLIGHTS_HEAD = {
  one: "1 highlight or note",
  many: "{total} highlights and notes",
  matching: "{shown} of {total} highlights and notes",
  matchingText: "{shown} of {total} highlights and notes matching “{text}”",
} as const;

export function headLabel(
  words: Readonly<{ one: string; many: string; matching: string; matchingText: string }>,
  counts: Readonly<{ total: number; shown: number | null; unread?: number }>,
  text: string,
): string {
  const { total, shown, unread = 0 } = counts;
  const values = { total: String(total), shown: String(shown ?? 0), unread: String(unread), text };

  const template =
    shown === null
      ? total === 1
        ? words.one
        : words.many
      : text === ""
        ? words.matching
        : words.matchingText;

  return filled(template, values);
}

export function highlightsHeadText(
  counts: Readonly<HighlightsList["counts"]>,
  filters: Readonly<Filters>,
): string {
  if (counts.total === 0) return "";

  const shown = isFiltered(filters) ? matchedCount(counts, filters) : null;
  const text = isSearching(filters) ? filters.q.trim() : "";

  return headLabel(HIGHLIGHTS_HEAD, { total: counts.total, shown }, text);
}
