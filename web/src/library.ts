import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Item } from "../../src/http/schemas.ts";
import { type SaveResult, fetchItem, fetchItems, regenerateDigest, saveLink } from "./api.ts";

export type ListState =
  | { readonly status: "loading"; readonly saved: readonly Item[] }
  | { readonly status: "failed"; readonly saved: readonly Item[] }
  | { readonly status: "ready"; readonly items: readonly Item[]; readonly loadedAt: number };

const POLL_MS = 1000;

type SetList = Dispatch<SetStateAction<ListState>>;

export function knownItems(list: Readonly<ListState>): readonly Item[] {
  return list.status === "ready" ? list.items : list.saved;
}

function upserted(items: readonly Item[], item: Readonly<Item>): Item[] {
  return items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];
}

function withItem(list: Readonly<ListState>, item: Readonly<Item>): ListState {
  return list.status === "ready"
    ? { ...list, items: upserted(list.items, item) }
    : { ...list, saved: upserted(list.saved, item) };
}

function withRead(list: Readonly<ListState>, read: Readonly<Item>): ListState {
  const current = knownItems(list).find((item) => item.id === read.id);

  return current === undefined || sameItem(current, read) ? list : withItem(list, read);
}

function sameItem(left: Readonly<Item>, right: Readonly<Item>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function loaded(current: Readonly<ListState>, items: readonly Item[]): ListState {
  const saved = knownItems(current);

  return {
    status: "ready",
    items: saved.reduceRight((all, item) => upserted(all, item), [...items]),
    loadedAt: Date.now(),
  };
}

function processingIds(list: Readonly<ListState>): string {
  return knownItems(list)
    .filter((item) => item.status === "processing")
    .map((item) => item.id)
    .join(",");
}

function pollItem(
  id: number,
  onRead: (item: Readonly<Item>, startedAt: number) => void,
): () => void {
  let timer = 0;
  let stopped = false;
  let paused = false;

  const schedule = (): void => {
    timer = window.setTimeout(() => {
      if (document.hidden) {
        paused = true;
      } else {
        void read();
      }
    }, POLL_MS);
  };

  const read = async (): Promise<void> => {
    const startedAt = performance.now();
    const item = await fetchItem(id).catch(() => null);

    if (!stopped) {
      if (item !== null) {
        onRead(item, startedAt);
      }

      schedule();
    }
  };

  const resume = (): void => {
    if (paused && !document.hidden) {
      paused = false;
      void read();
    }
  };

  document.addEventListener("visibilitychange", resume);
  schedule();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", resume);
  };
}

function usePolling(
  list: Readonly<ListState>,
  setList: SetList,
  isFresh: (id: number, startedAt: number) => boolean,
): void {
  const key = processingIds(list);

  useEffect(() => {
    const stops = (key === "" ? [] : key.split(",")).map((id) =>
      pollItem(Number(id), (read, startedAt) => {
        if (isFresh(read.id, startedAt)) {
          setList((current) => withRead(current, read));
        }
      }),
    );

    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [isFresh, key, setList]);
}

function useRegenerate(setList: SetList, markSaved: (id: number) => void) {
  return useCallback(
    async (id: number): Promise<void> => {
      try {
        const item = await regenerateDigest(id);
        markSaved(id);
        setList((current) => withItem(current, item));
      } catch {
        setList((current) => ({ status: "failed", saved: knownItems(current) }));
      }
    },
    [markSaved, setList],
  );
}

function useLoad(setList: SetList) {
  return useCallback(
    () =>
      fetchItems()
        .then(
          (items) =>
            (current: ListState): ListState =>
              loaded(current, items),
          () =>
            (current: ListState): ListState => ({ status: "failed", saved: knownItems(current) }),
        )
        .then(setList),
    [setList],
  );
}

export function useLibrary() {
  const [list, setList] = useState<ListState>({ status: "loading", saved: [] });
  const savedAt = useRef(new Map<number, number>());

  const load = useLoad(setList);

  const isFresh = useCallback(
    (id: number, startedAt: number) => startedAt > (savedAt.current.get(id) ?? 0),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(list, setList, isFresh);

  const retry = useCallback(() => {
    setList((current) => ({ status: "loading", saved: knownItems(current) }));
    void load();
  }, [load]);

  const save = useCallback(async (url: string): Promise<SaveResult> => {
    const result = await saveLink(url);

    if (result.outcome === "saved") {
      savedAt.current.set(result.item.id, performance.now());
      setList((current) => withItem(current, result.item));
    }

    return result;
  }, []);

  const markSaved = useCallback((id: number) => {
    savedAt.current.set(id, performance.now());
  }, []);

  const regenerate = useRegenerate(setList, markSaved);

  return { list, save, retry, regenerate };
}
