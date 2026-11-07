import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ReadState } from "../../src/core/kinds.ts";
import type { Item } from "../../src/http/schemas.ts";
import {
  type SaveTarget,
  type SaveResult,
  fetchItems,
  putReadState,
  regenerateDigest,
  saveLink,
} from "./api.ts";
import { type Choice, type Filters, NO_FILTERS, isFiltered, withChoice } from "./filters.ts";
import { type Stamps, newStamps, useItemPolling } from "./item-polling.ts";
import {
  type ListState,
  digestMoved,
  failedList,
  leftProcessing,
  type Answer,
  loaded,
  processingIds,
  sameItem,
  withItem,
  withRead,
} from "./list-state.ts";

type SetList = Dispatch<SetStateAction<ListState>>;

function useLatest<Value>(value: Value) {
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  return latest;
}

interface Reads {
  readonly reload: () => void;
  readonly recount: (wanted: boolean) => void;
  readonly settle: (wanted: boolean) => void;
}

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

function applied(answer: Readonly<Answer>): (current: ListState) => ListState {
  return (current) => loaded(current, answer);
}

async function refreshCounts(
  filters: Readonly<Filters>,
  setList: SetList,
  isCurrent: () => boolean,
  reload: () => void,
): Promise<void> {
  const answer = await fetchItems(filters).catch(() => null);

  if (answer === null) {
    reload();
  } else if (isCurrent()) {
    setList((current) =>
      current.status === "ready" ? { ...current, counts: answer.counts } : current,
    );
  }
}

function useReads(setList: SetList, filters: Readonly<Filters>): Reads {
  const newest = useRef(0);
  const reading = useRef(false);
  const [generation, setGeneration] = useState(0);
  const query = useMemo(() => ({ filters, generation }), [filters, generation]);

  useEffect(() => {
    newest.current += 1;
    reading.current = true;
    const sequence = newest.current;

    const read = async (): Promise<void> => {
      const apply = await fetchItems(query.filters).then(applied, () => failedList);

      if (sequence === newest.current) {
        reading.current = false;
        setList(apply);
      }
    };

    void read();
  }, [query, setList]);

  const reload = useCallback(() => {
    setGeneration((now) => now + 1);
  }, []);

  const settle = useCallback(
    (wanted: boolean) => {
      if (wanted || reading.current) reload();
    },
    [reload],
  );

  const recount = useCallback(
    (wanted: boolean) => {
      const sequence = newest.current;

      if (wanted) {
        void refreshCounts(filters, setList, () => sequence === newest.current, reload);
      }
    },
    [filters, reload, setList],
  );

  return useMemo(() => ({ reload, recount, settle }), [reload, recount, settle]);
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
        const was = latest.current.known.find((item) => item.id === result.item.id);
        stamps.mark(result.item.id);
        setList((current) => withItem(current, result.item, unfiltered.current));
        reads.settle(!unfiltered.current || digestMoved(was, result.item));
      }

      return result;
    },
    [latest, reads, setList, stamps, unfiltered],
  );
}

function useSetRead(setList: SetList, upkeep: Readonly<Upkeep>) {
  const { reads, stamps, unfiltered } = upkeep;

  return useCallback(
    async (id: number, readState: ReadState): Promise<void> => {
      const item = await putReadState(id, readState);
      const whole = unfiltered;
      stamps.mark(id);
      setList((current) => withItem(current, item, whole.current));
      reads.recount(!whole.current);
    },
    [reads, setList, stamps, unfiltered],
  );
}

export function useLibrary() {
  const [list, setList] = useState<ListState>({ status: "loading", known: [] });
  const [stamps] = useState(newStamps);
  const { filters, ...changes } = useFilters();
  const reads = useReads(setList, filters);
  const unfiltered = useLatest(!isFiltered(filters));
  const latest = useLatest(list);
  const upkeep = { reads, stamps, unfiltered, latest };
  const save = useSave(setList, upkeep);
  const setRead = useSetRead(setList, upkeep);
  usePolling(list, setList, upkeep);

  const retry = useCallback(() => {
    setList((current) => ({ status: "loading", known: current.known }));
    reads.reload();
  }, [reads]);

  return { list, filters, save, setRead, retry, ...changes };
}
