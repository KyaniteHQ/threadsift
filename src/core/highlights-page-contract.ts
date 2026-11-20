import { z } from "zod";

import { SOURCES } from "./item-contract.ts";
import { CursorNumber, joinCursor, parseCursor as parseFields } from "./paging.ts";

const ENTRY_KINDS = ["highlight", "note"] as const;

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

export function formatCursor({ date, kind, id }: Readonly<PageCursor>): string {
  return joinCursor(date, kind, id);
}

const PageCursorSchema = z
  .tuple([CursorNumber, z.enum(ENTRY_KINDS), CursorNumber])
  .transform(([date, kind, id]): PageCursor => ({ date, kind, id }));

export function parseCursor(text: string): PageCursor | null {
  return parseFields(text, PageCursorSchema);
}
