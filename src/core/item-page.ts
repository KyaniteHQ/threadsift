export const ITEMS_PAGE_SIZE = 50;

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
