import { filled } from "./filled.ts";

export const ITEM_HEAD = {
  one: "1 item, {unread} unread",
  many: "{total} items, {unread} unread",
  matching: "{shown} of {total} items",
  matchingText: "{shown} of {total} items matching “{text}”",
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
