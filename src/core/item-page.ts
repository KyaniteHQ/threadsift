export const ITEMS_PAGE_SIZE = 50;

export function pageTail<Row, Cursor>(rows: readonly Row[], cursorOf: (last: Row) => Cursor) {
  const shown = rows.slice(0, ITEMS_PAGE_SIZE);
  const last = shown.at(-1);

  return { shown, next: rows.length > shown.length && last !== undefined ? cursorOf(last) : null };
}

export interface ItemCursor {
  readonly savedAt: number;
  readonly id: number;
}

const CURSOR = /^(\d{1,16})\.(\d{1,16})$/u;

export function formatCursor({ savedAt, id }: Readonly<ItemCursor>): string {
  return `${String(savedAt)}.${String(id)}`;
}

export function parseCursor(text: string): ItemCursor | null {
  const match = CURSOR.exec(text);

  if (match === null) return null;

  const savedAt = Number(match[1]);
  const id = Number(match[2]);

  return Number.isSafeInteger(savedAt) && Number.isSafeInteger(id) ? { savedAt, id } : null;
}
