import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { FilterCounts } from "../../src/core/item-filters.ts";
import type { Item } from "../../src/http/schemas.ts";
import { type SaveTarget, type SaveResult, fetchItems, regenerateDigest, saveLink } from "./api.ts";
import { type Choice, type Filters, NO_FILTERS, isFiltered, withChoice } from "./filters.ts";
import { type Stamps, newStamps, useItemPolling } from "./item-polling.ts";

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

type SetList = Dispatch<SetStateAction<ListState>>;

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

function withItem(list: Readonly<ListState>, item: Readonly<Item>, shows: boolean): ListState {
  const known = upserted(list.known, item);

  return list.status === "ready"
    ? { ...list, known, items: shows ? upserted(list.items, item) : replaced(list.items, item) }
    : { ...list, known };
}

function withRead(list: Readonly<ListState>, read: Readonly<Item>): ListState {
  const current = list.known.find((item) => item.id === read.id);

  return current === undefined || sameItem(current, read) ? list : withItem(list, read, false);
}

function sameItem(left: Readonly<Item>, right: Readonly<Item>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface Answer {
  readonly items: readonly Item[];
  readonly counts: FilterCounts;
}

function loaded(current: Readonly<ListState>, answer: Readonly<Answer>): ListState {
  return {
    status: "ready",
    known: answer.items.reduceRight((all, item) => upserted(all, item), [...current.known]),
    items: answer.items,
    counts: answer.counts,
    loadedAt: Date.now(),
  };
}

function processingIds(list: Readonly<ListState>): string {
  return list.known
    .filter((item) => item.status === "processing")
    .map((item) => item.id)
    .join(",");
}

function useLatest<Value>(value: Value) {
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  return latest;
}

function usePolling(
  list: Readonly<ListState>,
  setList: SetList,
  polled: Readonly<{ reload: () => void; stamps: Stamps }>,
): void {
  const latest = useLatest(list);
  const { reload, stamps } = polled;

  const onRead = useCallback(
    (read: Readonly<Item>, startedAt: number) => {
      if (!stamps.isFresh(read.id, startedAt)) return;

      const was = latest.current.known.find((item) => item.id === read.id);

      if (was?.status === "processing" && read.status !== "processing") reload();
      setList((current) => withRead(current, read));
    },
    [latest, reload, setList, stamps],
  );

  useItemPolling(processingIds(list), onRead);
}

export function countsOf(list: Readonly<ListState>): FilterCounts | null {
  return list.status === "loading" ? null : list.counts;
}

function failedList(current: ListState): ListState {
  return { status: "failed", known: current.known, counts: countsOf(current) };
}

function useReads(setList: SetList, filters: Readonly<Filters>) {
  const newest = useRef(0);

  useEffect(() => {
    newest.current += 1;
    const sequence = newest.current;

    const read = async (): Promise<void> => {
      const apply = await fetchItems(filters).then(
        (answer) =>
          (current: ListState): ListState =>
            loaded(current, answer),
        () => failedList,
      );

      if (sequence === newest.current) setList(apply);
    };

    void read();
  }, [filters, setList]);
}

function useFilters() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const choose = useCallback((choice: Readonly<Choice>) => {
    setFilters((now) => withChoice(now, choice));
  }, []);

  const search = useCallback((q: string) => {
    setFilters((now) => ({ ...now, q }));
  }, []);

  const clear = useCallback(() => {
    setFilters(NO_FILTERS);
  }, []);

  const clearChosen = useCallback(() => {
    setFilters((now) => ({ ...NO_FILTERS, q: now.q }));
  }, []);

  const reload = useCallback(() => {
    setFilters((now) => ({ ...now }));
  }, []);

  return { filters, choose, search, clear, clearChosen, reload };
}

function useSave(
  setList: SetList,
  saving: Readonly<{ reload: () => void; stamps: Stamps; filtered: boolean }>,
) {
  const { reload, stamps, filtered } = saving;
  const unfiltered = useLatest(!filtered);

  return useCallback(
    async (target: SaveTarget): Promise<SaveResult> => {
      const result: SaveResult =
        target.kind === "paste"
          ? await saveLink(target.url)
          : {
              outcome: "saved",
              known: true,
              refreshed: false,
              item: await regenerateDigest(target.id),
            };

      if (result.outcome === "saved") {
        stamps.mark(result.item.id);
        setList((current) => withItem(current, result.item, unfiltered.current));
        reload();
      }

      return result;
    },
    [reload, setList, stamps, unfiltered],
  );
}

export function useLibrary() {
  const [list, setList] = useState<ListState>({ status: "loading", known: [] });
  const [stamps] = useState(newStamps);
  const { filters, reload, ...changes } = useFilters();
  useReads(setList, filters);
  const save = useSave(setList, { reload, stamps, filtered: isFiltered(filters) });
  usePolling(list, setList, { reload, stamps });

  const retry = useCallback(() => {
    setList((current) => ({ status: "loading", known: current.known }));
    reload();
  }, [reload]);

  return { list, filters, save, retry, ...changes };
}
