export function pageTail<Row>(rows: readonly Row[], size: number, cursorOf: (last: Row) => string) {
  const items = rows.slice(0, size);
  const last = items.at(-1);

  return { items, next: rows.length > items.length && last !== undefined ? cursorOf(last) : null };
}
