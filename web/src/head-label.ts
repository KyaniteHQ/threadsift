import { groupedNumber } from "../../src/core/contract/format.ts";
import type { HighlightsList } from "../../src/core/contract/highlights-page-wire.ts";
import { filled } from "./filled.ts";
import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { matchedCount } from "./list-counts.ts";
import { plural } from "./plural.ts";

export const ITEM_HEAD = {
  one: "1 item, {unread} unread",
  many: "{total} items, {unread} unread",
  matching: "{shown} of {total} items",
  matchingText: "{shown} of {total} items matching “{text}”",
  matchingOne: "{shown} of 1 item",
  matchingTextOne: "{shown} of 1 item matching “{text}”",
} as const;

const KIND_NOUNS = {
  highlights: { one: "highlight", many: "highlights" },
  notes: { one: "note", many: "notes" },
  both: { one: "highlights and notes", many: "highlights and notes" },
} as const;

const KIND_MATCHING = "{shown} of {total} {kind}";
const KIND_MATCHING_TEXT = "{shown} of {total} {kind} matching “{text}”";

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

function kindTotals({ highlights, notes }: Kinds): string {
  return [
    highlights === 0 ? null : plural(highlights, "1 highlight", "{count} highlights"),
    notes === 0 ? null : plural(notes, "1 note", "{count} notes"),
  ]
    .filter((part) => part !== null)
    .join(", ");
}

function kindOf({ highlights, notes }: Kinds): keyof typeof KIND_NOUNS {
  if (notes === 0) return "highlights";

  return highlights === 0 ? "notes" : "both";
}

export function highlightsHeadText(
  counts: Readonly<HighlightsList["counts"]>,
  filters: Readonly<Filters>,
): string {
  if (counts.total === 0) return "";

  if (!isFiltered(filters)) return kindTotals(counts);

  const text = isSearching(filters) ? filters.q.trim() : "";
  const nouns = KIND_NOUNS[kindOf(counts)];

  return filled(text === "" ? KIND_MATCHING : KIND_MATCHING_TEXT, {
    shown: groupedNumber(matchedCount(counts, filters)),
    total: groupedNumber(counts.total),
    kind: counts.total === 1 ? nouns.one : nouns.many,
    text,
  });
}
