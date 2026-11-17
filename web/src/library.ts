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
import { isFiltered, useFilters } from "./filters.ts";
import { useItemPolling } from "./item-polling.ts";
import { type Reads, useReads } from "./list-reads.ts";
import {
  type ListState,
  processingIds,
  sameItem,
  survivorOf,
  withKnown,
  withRead,
  withoutItem,
} from "./list-state.ts";
import { useLatest } from "./use-latest.ts";

export interface Writes {
  readonly setRead: (id: number, state: ReadState) => Promise<void>;
  readonly remove: (
    id: number,
    whenGone: (survivor: number | null) => void,
  ) => Promise<number | null>;
}

export interface Paging {
  readonly more: () => void;
}

type SetList = Dispatch<SetStateAction<ListState>>;

interface Upkeep {
  readonly reads: Reads;
  readonly unfiltered: RefObject<boolean>;
  readonly latest: RefObject<ListState>;
}

function usePolling(list: Readonly<ListState>, setList: SetList, upkeep: Readonly<Upkeep>): void {
  const { reads, unfiltered, latest } = upkeep;

  const onRead = useCallback(
    (read: Readonly<Item>) => {
      const was = latest.current.known.find((item) => item.id === read.id);

      if (was === undefined || !sameItem(was, read)) {
        reads.reload();
      }

      setList((current) => withRead(current, read, unfiltered.current));
    },
    [latest, reads, setList, unfiltered],
  );

  const onGone = useCallback(
    (id: number) => {
      setList((current) => withoutItem(current, id));
      reads.reload();
    },
    [reads, setList],
  );

  useItemPolling(processingIds(list), onRead, onGone, reads.ticket);
}

function useSave(reads: Reads, setList: SetList) {
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

      if (result.outcome !== "saved") return result;

      setList((current) => withKnown(current, result.item));
      reads.reload();

      return result;
    },
    [reads, setList],
  );
}

function useSetRead(reads: Reads) {
  return useCallback(
    async (id: number, readState: ReadState): Promise<void> => {
      await putReadState(id, readState);
      reads.reload();
    },
    [reads],
  );
}

function useRemove(setList: SetList, upkeep: Readonly<Upkeep>) {
  const { reads, latest } = upkeep;

  return useCallback(
    async (id: number, whenGone: (survivor: number | null) => void): Promise<number | null> => {
      await removeItem(id);

      const survivor = survivorOf(latest.current, id);

      flushSync(() => {
        setList((current) => withoutItem(current, id));
        whenGone(survivor);
      });

      reads.reload();

      return survivor;
    },
    [latest, reads, setList],
  );
}

export function useLibrary() {
  const [list, setList] = useState<ListState>({ status: "loading", known: [] });
  const { filters, ...changes } = useFilters();
  const latest = useLatest(list);
  const reads = useReads(setList, filters, latest);
  const unfiltered = useLatest(!isFiltered(filters));
  const upkeep = { reads, unfiltered, latest };
  const save = useSave(reads, setList);
  const setRead = useSetRead(reads);
  const remove = useRemove(setList, upkeep);
  usePolling(list, setList, upkeep);

  const retry = useCallback(() => {
    setList((current) => ({ status: "loading", known: current.known }));
    reads.reload();
  }, [reads]);

  const know = useCallback((item: Readonly<Item>) => {
    setList((current) => withKnown(current, item));
  }, []);

  return { list, filters, save, setRead, remove, retry, know, more: reads.more, ...changes };
}
