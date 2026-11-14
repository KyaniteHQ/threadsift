import type { FilterCounts } from "../../src/core/filter-counts-contract.ts";
import type { Item } from "../../src/http/schemas.ts";
import { isEmptyResult } from "./filters.ts";
import { countedWith } from "./list-counts.ts";
import { type More, newer } from "./list-paging.ts";

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
      readonly query: string;
      readonly next: string | null;
      readonly more: More;
    };

export type Ready = Extract<ListState, { readonly status: "ready" }>;

export function hasRows(list: Readonly<ListState>): boolean {
  return list.status !== "ready" || !isEmptyResult(list.items.length, list.next);
}

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

function placed(list: Readonly<Ready>, item: Readonly<Item>): Item[] {
  const { items } = list;

  if (items.some((current) => current.id === item.id)) return replaced(items, item);

  const last = items.at(-1);

  if (list.next !== null && last !== undefined && newer(last, item)) return [...items];

  const at = items.findIndex((current) => newer(item, current));

  return at < 0 ? [...items, item] : [...items.slice(0, at), item, ...items.slice(at)];
}

export function withItem(
  list: Readonly<ListState>,
  item: Readonly<Item>,
  unfiltered: boolean,
  created = false,
): ListState {
  const known = upserted(list.known, item);

  if (list.status !== "ready") return { ...list, known };

  const before = list.known.find((current) => current.id === item.id);

  return {
    ...list,
    known,
    items: unfiltered ? placed(list, item) : replaced(list.items, item),
    counts: unfiltered ? countedWith(list.counts, before, item, created) : list.counts,
  };
}

export function withKnown(list: Readonly<ListState>, item: Readonly<Item>): ListState {
  return { ...list, known: upserted(list.known, item) };
}

export function survivorOf(list: Readonly<ListState>, id: number): number | null {
  if (list.status !== "ready") return null;

  const ids = list.items.map((item) => item.id);
  const at = ids.indexOf(id);

  return (at < 0 ? ids[0] : (ids[at + 1] ?? ids[at - 1])) ?? null;
}

export function withoutItem(list: Readonly<ListState>, id: number): ListState {
  const known = list.known.filter((item) => item.id !== id);

  return list.status === "ready"
    ? { ...list, known, items: list.items.filter((item) => item.id !== id) }
    : { ...list, known };
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
  readonly next: string | null;
  readonly query: string;
}

export interface Settled {
  readonly changed: readonly number[];
  readonly counts: boolean;
}

function lastWritten(
  known: readonly Item[],
  item: Readonly<Item>,
  changed: readonly number[],
): Item {
  return (
    (changed.includes(item.id) ? known.find((each) => each.id === item.id) : undefined) ?? item
  );
}

export function loaded(
  current: Readonly<ListState>,
  answer: Readonly<Answer>,
  settled: Readonly<Settled>,
): ListState {
  const items = answer.items.map((item) => lastWritten(current.known, item, settled.changed));

  return {
    status: "ready",
    known: items.reduceRight((all, item) => upserted(all, item), [...current.known]),
    items,
    counts: settled.counts || current.status !== "ready" ? answer.counts : current.counts,
    loadedAt: Date.now(),
    query: answer.query,
    next: answer.next,
    more: "idle",
  };
}

export function continues(list: Readonly<ListState>, query: string, cursor: string): list is Ready {
  return list.status === "ready" && list.query === query && list.next === cursor;
}

export interface Page {
  readonly items: readonly Item[];
  readonly next: string | null;
}

export function appended(
  list: Readonly<ListState>,
  page: Readonly<Page>,
  position: Readonly<{ query: string; cursor: string; changed: readonly number[] }>,
): ListState {
  if (!continues(list, position.query, position.cursor)) return list;

  const have = new Set(list.items.map((item) => item.id));

  const fresh = page.items
    .filter((item) => !have.has(item.id))
    .map((item) => lastWritten(list.known, item, position.changed));

  return {
    ...list,
    known: fresh.reduce((all, item) => upserted(all, item), [...list.known]),
    items: [...list.items, ...fresh],
    next: page.next,
    more: "idle",
  };
}

export function withMore(
  list: Readonly<ListState>,
  query: string,
  cursor: string,
  more: More,
): ListState {
  return continues(list, query, cursor) ? { ...list, more } : list;
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
