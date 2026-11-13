export const NOW_MS = "CAST(strftime('%s', 'now') AS INTEGER) * 1000";

export const PLAIN_CHECK = "plain-check";

export function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

export function valuesCte(
  name: string,
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const values = rows.map((row) => `(${row.map((cell) => quoted(cell)).join(", ")})`).join(", ");

  return `WITH ${name} (${columns.join(", ")}) AS (VALUES ${values})`;
}
