import { z } from "zod";

export const PAGE_SIZE = 50;

export const CURSOR_DIGITS = 16;

const CURSOR_FIELDS_MAX = 3;

export const NUMBER_TEXT = new RegExp(`^\\d{1,${String(CURSOR_DIGITS)}}$`, "u");

export const CursorNumber = z.string().regex(NUMBER_TEXT).transform(Number).pipe(z.int());

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
  const parsed = CursorNumber.safeParse(text);

  return parsed.success ? parsed.data : null;
}
