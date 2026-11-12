export const NOW_MS = "CAST(strftime('%s', 'now') AS INTEGER) * 1000";

export const PLAIN_CHECK = "plain-check";

export function quoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}
