import type { FilterCounts } from "../../src/core/filter-counts-contract.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { Filters } from "./filters.ts";

function moved<Key extends string>(
  rows: readonly { readonly key: Key; readonly count: number }[],
  from: Key,
  to: Key,
) {
  return rows.map((row) => ({
    ...row,
    count: row.count + (row.key === to ? 1 : 0) - (row.key === from ? 1 : 0),
  }));
}

export function countedWith(
  counts: Readonly<FilterCounts>,
  before: Readonly<Item>,
  after: Readonly<Item>,
): FilterCounts {
  const wasUnread = before.readState === "unread";

  return {
    ...counts,
    unread: counts.unread + (after.readState === "unread" ? 1 : 0) - (wasUnread ? 1 : 0),
    sources: moved(counts.sources, before.source, after.source),
    reads: moved(counts.reads, before.readState, after.readState),
  };
}

export function matchedCount(
  { sources }: Readonly<Pick<FilterCounts, "sources">>,
  { source }: Readonly<Pick<Filters, "source">>,
): number {
  return sources
    .filter(({ key }) => source === null || key === source)
    .reduce((sum, { count }) => sum + count, 0);
}
