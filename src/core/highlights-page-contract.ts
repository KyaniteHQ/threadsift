import { z } from "zod";

import { SOURCES } from "./kinds.ts";

export const HIGHLIGHTS_PAGE_SIZE = 50;

export const ENTRY_KINDS = ["highlight", "note"] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

const ItemRefSchema = z.object({
  id: z.number().int(),
  source: z.enum(SOURCES),
  title: z.string().nullable(),
  savedAt: z.number().int(),
});

const Shared = {
  id: z.number().int(),
  text: z.string(),
  date: z.number().int(),
  item: ItemRefSchema,
};

export const EntrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("highlight"), ...Shared, found: z.boolean() }),
  z.object({ kind: z.literal("note"), ...Shared }),
]);

export type Entry = z.infer<typeof EntrySchema>;

export interface PageCursor {
  readonly date: number;
  readonly kind: EntryKind;
  readonly id: number;
}

const CURSOR = /^(\d{1,16})\.(highlight|note)\.(\d{1,16})$/u;

export function formatCursor({ date, kind, id }: Readonly<PageCursor>): string {
  return `${String(date)}.${kind}.${String(id)}`;
}

export function parseCursor(text: string): PageCursor | null {
  const match = CURSOR.exec(text);
  const kind = ENTRY_KINDS.find((each) => each === match?.[2]);

  if (match === null || kind === undefined) return null;

  const date = Number(match[1]);
  const id = Number(match[3]);

  return Number.isSafeInteger(date) && Number.isSafeInteger(id) ? { date, kind, id } : null;
}
