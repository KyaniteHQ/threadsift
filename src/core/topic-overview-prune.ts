import { citedIds } from "./topic-overview-contract.ts";
import { overviewText } from "./topic-overview-task.ts";

const SOURCED_LINE = /^(.*?\S)\s*((?:\[\d{1,19}\])+)$/u;

function withoutGone(row: string, gone: readonly number[]): readonly string[] {
  const [, text = "", sources = ""] = SOURCED_LINE.exec(row.trim()) ?? [];

  const items = citedIds(sources);

  const remaining = items.filter((id) => !gone.includes(id));

  if (text === "" || remaining.length === items.length) return [row];

  return remaining.length === 0 ? [] : [overviewText({ lines: [{ text, items: remaining }] })];
}

export function overviewWithout(overview: string | null, gone: readonly number[]): string | null {
  if (overview === null) return null;

  const rows = overview.split("\n").flatMap((row) => withoutGone(row, gone));

  return rows.length === 0 ? null : rows.join("\n");
}
