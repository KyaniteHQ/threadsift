import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { Item } from "../../src/http/schemas.ts";

function moved<Key extends string>(
  rows: readonly { readonly key: Key; readonly count: number }[],
  from: Key | null,
  to: Key,
) {
  return rows.map((row) => ({
    ...row,
    count: row.count + (row.key === to ? 1 : 0) - (row.key === from ? 1 : 0),
  }));
}

export function countedWith(
  counts: Readonly<FilterCounts>,
  before: Readonly<Item> | undefined,
  after: Readonly<Item>,
): FilterCounts {
  const added = before === undefined;
  const wasUnread = before?.readState === "unread";

  return {
    ...counts,
    total: counts.total + (added ? 1 : 0),
    unread: counts.unread + (after.readState === "unread" ? 1 : 0) - (wasUnread ? 1 : 0),
    sources: moved(counts.sources, before?.source ?? null, after.source),
    reads: moved(counts.reads, before?.readState ?? null, after.readState),
  };
}
