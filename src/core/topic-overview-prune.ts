import { overviewText, sourcedLine } from "./topic-overview-contract.ts";

function withoutGone(row: string, gone: readonly number[]): readonly string[] {
  const sourced = sourcedLine(row);

  if (sourced === null) return [row];

  const { text, items } = sourced;

  const remaining = items.filter((id) => !gone.includes(id));

  if (remaining.length === items.length) return [row];

  return remaining.length === 0 ? [] : [overviewText({ lines: [{ text, items: remaining }] })];
}

export function overviewWithout(overview: string | null, gone: readonly number[]): string | null {
  if (overview === null) return null;

  const rows = overview.split("\n").flatMap((row) => withoutGone(row, gone));

  return rows.length === 0 ? null : rows.join("\n");
}
