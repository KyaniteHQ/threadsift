import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { Item } from "../../src/http/schemas.ts";
import { countedWith } from "./list-counts.ts";

export type ListState =
  | { readonly status: "loading"; readonly known: readonly Item[] }
  | {
      readonly status: "failed";
      readonly known: readonly Item[];
      readonly counts: FilterCounts | null;
    }
  | {
      readonly status: "ready";
      readonly known: readonly Item[];
      readonly items: readonly Item[];
      readonly counts: FilterCounts;
      readonly loadedAt: number;
    };

export function knownItems(list: Readonly<ListState>): readonly Item[] {
  return list.known;
}

function upserted(items: readonly Item[], item: Readonly<Item>): Item[] {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
}

function replaced(items: readonly Item[], item: Readonly<Item>): Item[] {
  return items.map((current) => (current.id === item.id ? item : current));
}

export function withItem(
  list: Readonly<ListState>,
  item: Readonly<Item>,
  unfiltered: boolean,
): ListState {
  const known = upserted(list.known, item);

  if (list.status !== "ready") return { ...list, known };

  const before = list.known.find((current) => current.id === item.id);

  return {
    ...list,
    known,
    items: unfiltered ? upserted(list.items, item) : replaced(list.items, item),
    counts: unfiltered ? countedWith(list.counts, before, item) : list.counts,
  };
}

export function withRead(
  list: Readonly<ListState>,
  read: Readonly<Item>,
  unfiltered: boolean,
): ListState {
  const current = list.known.find((item) => item.id === read.id);

  return current === undefined || sameItem(current, read) ? list : withItem(list, read, unfiltered);
}

export function sameItem(left: Readonly<Item>, right: Readonly<Item>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface Answer {
  readonly items: readonly Item[];
  readonly counts: FilterCounts;
}

export interface Settled {
  readonly changed: readonly number[];
  readonly counts: boolean;
}

export function loaded(
  current: Readonly<ListState>,
  answer: Readonly<Answer>,
  settled: Readonly<Settled>,
): ListState {
  const items = answer.items.map(
    (item) =>
      (settled.changed.includes(item.id)
        ? current.known.find((known) => known.id === item.id)
        : undefined) ?? item,
  );

  return {
    status: "ready",
    known: items.reduceRight((all, item) => upserted(all, item), [...current.known]),
    items,
    counts: settled.counts || current.status !== "ready" ? answer.counts : current.counts,
    loadedAt: Date.now(),
  };
}

export function processingIds(list: Readonly<ListState>): string {
  return list.known
    .filter((item) => item.status === "processing")
    .map((item) => item.id)
    .join(",");
}

export function digestMoved(before: Readonly<Item> | undefined, after: Readonly<Item>): boolean {
  return (
    after.digestTopic !== (before?.digestTopic ?? null) ||
    after.digestTitle !== (before?.digestTitle ?? null) ||
    (before?.digestOutcome === "pending" &&
      after.digestOutcome !== "pending" &&
      after.digestTopic !== null)
  );
}

export function leftProcessing(before: Readonly<Item> | undefined, after: Readonly<Item>): boolean {
  return before?.status === "processing" && after.status !== "processing";
}

export function countsOf(list: Readonly<ListState>): FilterCounts | null {
  return list.status === "loading" ? null : list.counts;
}

export function failedList(current: ListState): ListState {
  return { status: "failed", known: current.known, counts: countsOf(current) };
}
