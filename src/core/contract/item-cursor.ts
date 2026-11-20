import { z } from "zod";

import { CanonicalNumberTextSchema } from "./canonical-number.ts";
import { joinCursor, parseCursor as parseFields } from "./paging.ts";

export interface ItemCursor {
  readonly savedAt: number;
  readonly id: number;
}

const ItemCursorSchema = z
  .tuple([CanonicalNumberTextSchema, CanonicalNumberTextSchema])
  .transform(([savedAt, id]): ItemCursor => ({ savedAt, id }));

export function formatCursor({ savedAt, id }: Readonly<ItemCursor>): string {
  return joinCursor(savedAt, id);
}

export function parseCursor(text: string): ItemCursor | null {
  return parseFields(text, ItemCursorSchema);
}
