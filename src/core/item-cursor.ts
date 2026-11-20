import { z } from "zod";

import { CursorNumber, joinCursor, parseCursor as parseFields } from "./paging.ts";

export interface ItemCursor {
  readonly savedAt: number;
  readonly id: number;
}

const ItemCursorSchema = z
  .tuple([CursorNumber, CursorNumber])
  .transform(([savedAt, id]): ItemCursor => ({ savedAt, id }));

export function formatCursor({ savedAt, id }: Readonly<ItemCursor>): string {
  return joinCursor(savedAt, id);
}

export function parseCursor(text: string): ItemCursor | null {
  return parseFields(text, ItemCursorSchema);
}
