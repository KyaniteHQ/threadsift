import { type Dispatch, type RefObject, type SetStateAction, useCallback, useState } from "react";
import { flushSync } from "react-dom";

import type { ReadState } from "../../src/core/kinds.ts";
import type { Item } from "../../src/http/schemas.ts";
import {
  type SaveTarget,
  type SaveResult,
  putReadState,
  regenerateDigest,
  removeItem,
  saveLink,
} from "./api.ts";
import { type Choice, type Filters, NO_FILTERS, isFiltered, withChoice } from "./filters.ts";
import { type Stamps, newStamps, useItemPolling } from "./item-polling.ts";
import { type Reads, useReads } from "./list-reads.ts";
import {
  type ListState,
  digestMoved,
  leftProcessing,
  processingIds,
  sameItem,
  survivorOf,
  withItem,
  withRead,
  withoutItem,
} from "./list-state.ts";
import { useLatest } from "./use-latest.ts";

export type Applied = "applied" | "discarded";

export type SaveAnswer = SaveResult | { readonly outcome: "discarded" };

export interface Writes {
  readonly setRead: (id: number, state: ReadState) => Promise<Applied>;
  readonly remove: (
    id: number,
    whenGone: (survivor: number | null) => void,
  ) => Promise<number | null>;
}

type SetList = Dispatch<SetStateAction<ListState>>;

interface Upkeep {
  readonly reads: Reads;
  readonly stamps: Stamps;
  readonly unfiltered: RefObject<boolean>;
  readonly latest: RefObject<ListState>;
}

function usePolling(list: Readonly<ListState>, setList: SetList, upkeep: Readonly<Upkeep>): void {
  const { reads, stamps, unfiltered, latest } = upkeep;

  const onRead = useCallback(
    (read: Readonly<Item>, startedAt: number) => {
      if (!stamps.isFresh(read.id, startedAt)) return;

      const was = latest.current.known.find((item) => item.id === read.id);

      if (was === undefined || !sameItem(was, read)) {
        reads.settle(unfiltered.current ? digestMoved(was, read) : leftProcessing(was, read));
      }

      setList((current) => withRead(current, read, unfiltered.current));
    },
    [latest, reads, setList, stamps, unfiltered],
  );

  useItemPolling(processingIds(list), onRead);
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

  return { filters, choose, search, clear, clearChosen };
}

function useSave(setList: SetList, upkeep: Readonly<Upkeep>) {
  const { reads, stamps, unfiltered, latest } = upkeep;

  return useCallback(
    async (target: SaveTarget): Promise<SaveAnswer> => {
      const result: SaveResult =
        target.kind === "paste"
          ? await saveLink(target.url)
          : {
              outcome: "saved",
              known: true,
              refreshed: false,
              item: await regenerateDigest(target.id),
            };

      if (result.outcome !== "saved") return result;

      if (stamps.isGone(result.item.id)) return { outcome: "discarded" };

      const was = latest.current.known.find((item) => item.id === result.item.id);
      stamps.mark(result.item.id);
      setList((current) => withItem(current, result.item, unfiltered.current));
      reads.settle(!unfiltered.current || digestMoved(was, result.item));

      return result;
    },
    [latest, reads, setList, stamps, unfiltered],
  );
}

function useSetRead(setList: SetList, upkeep: Readonly<Upkeep>) {
  const { reads, stamps, unfiltered } = upkeep;

  return useCallback(
    async (id: number, readState: ReadState): Promise<Applied> => {
      const item = await putReadState(id, readState);

      if (stamps.isGone(id)) return "discarded";

      const whole = unfiltered;
      stamps.mark(id);
      setList((current) => withItem(current, item, whole.current));
      reads.recount(!whole.current);

      return "applied";
    },
    [reads, setList, stamps, unfiltered],
  );
}

function survivorIn(latest: Readonly<RefObject<ListState>>, id: number): number | null {
  return survivorOf(latest.current, id);
}

function useRemove(setList: SetList, upkeep: Readonly<Upkeep>) {
  const { reads, stamps, latest } = upkeep;

  return useCallback(
    async (id: number, whenGone: (survivor: number | null) => void): Promise<number | null> => {
      await removeItem(id);

      const survivor = survivorIn(latest, id);

      flushSync(() => {
        stamps.remove(id);
        setList((current) => withoutItem(current, id));
        whenGone(survivor);
      });

      reads.recount(true);

      return survivor;
    },
    [latest, reads, setList, stamps],
  );
}

export function useLibrary() {
  const [list, setList] = useState<ListState>({ status: "loading", known: [] });
  const { filters, ...changes } = useFilters();
  const [stamps] = useState(newStamps);
  const reads = useReads(setList, filters, stamps);
  const unfiltered = useLatest(!isFiltered(filters));
  const latest = useLatest(list);
  const upkeep = { reads, stamps, unfiltered, latest };
  const save = useSave(setList, upkeep);
  const setRead = useSetRead(setList, upkeep);
  const remove = useRemove(setList, upkeep);
  usePolling(list, setList, upkeep);

  const retry = useCallback(() => {
    setList((current) => ({ status: "loading", known: current.known }));
    reads.reload();
  }, [reads]);

  return { list, filters, save, setRead, remove, retry, ...changes };
}
