import { z } from "zod";

import { CanonicalNumberTextSchema } from "./canonical-number.ts";

export const PAGE_SIZE = 50;

const CURSOR_FIELDS_MAX = 3;

export function pageTail<Row>(rows: readonly Row[], size: number, cursorOf: (last: Row) => string) {
  const items = rows.slice(0, size);
  const last = items.at(-1);

  return { items, next: rows.length > items.length && last !== undefined ? cursorOf(last) : null };
}

export function joinCursor(...fields: readonly (number | string)[]): string {
  return fields.join(".");
}

export function parseCursor<Fields extends z.ZodType>(
  text: string,
  fields: Fields,
): z.output<Fields> | null {
  const parsed = fields.safeParse(text.split(".", CURSOR_FIELDS_MAX + 1));

  return parsed.success ? parsed.data : null;
}

export function parseNumberCursor(text: string): number | null {
  const parsed = CanonicalNumberTextSchema.safeParse(text);

  return parsed.success ? parsed.data : null;
}
