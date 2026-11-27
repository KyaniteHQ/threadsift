import { groupedNumber } from "../../src/core/contract/format.ts";
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

const HIGHLIGHTS_ONLY = {
  matching: "{shown} of {total} highlights",
  matchingText: "{shown} of {total} highlights matching “{text}”",
  matchingOne: "{shown} of 1 highlight",
  matchingTextOne: "{shown} of 1 highlight matching “{text}”",
} as const;

const NOTES_ONLY = {
  matching: "{shown} of {total} notes",
  matchingText: "{shown} of {total} notes matching “{text}”",
  matchingOne: "{shown} of 1 note",
  matchingTextOne: "{shown} of 1 note matching “{text}”",
} as const;

const BOTH_MATCHING = "{shown} of {total} highlights and notes";
const BOTH_MATCHING_TEXT = "{shown} of {total} highlights and notes matching “{text}”";

const HIGHLIGHTS_AND_NOTES = {
  matching: BOTH_MATCHING,
  matchingText: BOTH_MATCHING_TEXT,
  matchingOne: BOTH_MATCHING,
  matchingTextOne: BOTH_MATCHING_TEXT,
} as const;

const KIND_TOTALS = {
  highlights: { one: "1 highlight", many: "{highlights} highlights" },
  notes: { one: "1 note", many: "{notes} notes" },
  both: {
    one: { one: "1 highlight, 1 note", many: "1 highlight, {notes} notes" },
    many: {
      one: "{highlights} highlights, 1 note",
      many: "{highlights} highlights, {notes} notes",
    },
  },
} as const;

type HeadWords = Readonly<Record<keyof typeof ITEM_HEAD, string>>;

type MatchWords = Pick<HeadWords, "matching" | "matchingText" | "matchingOne" | "matchingTextOne">;

function matchTemplate(words: MatchWords, total: number, text: string): string {
  if (total === 1) return text === "" ? words.matchingOne : words.matchingTextOne;

  return text === "" ? words.matching : words.matchingText;
}

function templateOf(words: HeadWords, total: number, shown: number | null, text: string): string {
  if (shown === null) return total === 1 ? words.one : words.many;

  return matchTemplate(words, total, text);
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

type Kinds = Readonly<Pick<HighlightsList["counts"], "highlights" | "notes">>;

const oneOrMany = (count: number) => (count === 1 ? "one" : "many");

function kindTotals({ highlights, notes }: Kinds): string {
  const values = { highlights: groupedNumber(highlights), notes: groupedNumber(notes) };

  if (notes === 0) return filled(KIND_TOTALS.highlights[oneOrMany(highlights)], values);
  if (highlights === 0) return filled(KIND_TOTALS.notes[oneOrMany(notes)], values);

  return filled(KIND_TOTALS.both[oneOrMany(highlights)][oneOrMany(notes)], values);
}

function matchWords({ highlights, notes }: Kinds): MatchWords {
  if (notes === 0) return HIGHLIGHTS_ONLY;

  return highlights === 0 ? NOTES_ONLY : HIGHLIGHTS_AND_NOTES;
}

export function highlightsHeadText(
  counts: Readonly<HighlightsList["counts"]>,
  filters: Readonly<Filters>,
): string {
  if (counts.total === 0) return "";

  if (!isFiltered(filters)) return kindTotals(counts);

  const text = isSearching(filters) ? filters.q.trim() : "";
  const values = {
    shown: groupedNumber(matchedCount(counts, filters)),
    total: groupedNumber(counts.total),
    text,
  };

  return filled(matchTemplate(matchWords(counts), counts.total, text), values);
}
