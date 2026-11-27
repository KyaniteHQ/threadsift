import type { HighlightsList } from "../../src/core/contract/highlights-page-wire.ts";
import { filled } from "./filled.ts";
import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { matchedCount } from "./list-counts.ts";

export const ITEM_HEAD = {
  one: "1 item, {unread} unread",
  many: "{total} items, {unread} unread",
  matching: "{shown} of {total} items",
  matchingText: "{shown} of {total} items matching “{text}”",
  matchingOne: "{shown} of 1 item",
  matchingTextOne: "{shown} of 1 item matching “{text}”",
} as const;

export const HIGHLIGHTS_HEAD = {
  one: "1 highlight or note",
  many: "{total} highlights and notes",
  matching: "{shown} of {total} highlights and notes",
  matchingText: "{shown} of {total} highlights and notes matching “{text}”",
  matchingOne: "{shown} of 1 highlight or note",
  matchingTextOne: "{shown} of 1 highlight or note matching “{text}”",
} as const;

type HeadWords = Readonly<Record<keyof typeof ITEM_HEAD, string>>;

function templateOf(words: HeadWords, total: number, shown: number | null, text: string): string {
  if (shown === null) return total === 1 ? words.one : words.many;
  if (total === 1) return text === "" ? words.matchingOne : words.matchingTextOne;

  return text === "" ? words.matching : words.matchingText;
}

export function headLabel(
  words: HeadWords,
  counts: Readonly<{ total: number; shown: number | null; unread?: number }>,
  text: string,
): string {
  const { total, shown, unread = 0 } = counts;
  const values = { total: String(total), shown: String(shown ?? 0), unread: String(unread), text };

  return filled(templateOf(words, total, shown, text), values);
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
