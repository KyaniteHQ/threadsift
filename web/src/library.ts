import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { type SaveResult, fetchItem, fetchItems, saveLink } from "./api.ts";

export type ListState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly items: readonly Item[]; readonly loadedAt: number };

const POLL_MS = 1000;

type SetList = Dispatch<SetStateAction<ListState>>;

function withItem(list: Readonly<ListState>, item: Readonly<Item>): ListState {
  if (list.status !== "ready") {
    return list;
  }

  const known = list.items.some((current) => current.id === item.id);

  return {
    ...list,
    items: known
      ? list.items.map((current) => (current.id === item.id ? item : current))
      : [item, ...list.items],
  };
}

function withRead(list: Readonly<ListState>, read: Readonly<Item>): ListState {
  const current = list.status === "ready" ? list.items.find((item) => item.id === read.id) : null;

  return current === undefined || current === null || sameItem(current, read)
    ? list
    : withItem(list, read);
}

function sameItem(left: Readonly<Item>, right: Readonly<Item>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function processingIds(list: Readonly<ListState>): string {
  return list.status === "ready"
    ? list.items
        .filter((item) => item.status === "processing")
        .map((item) => item.id)
        .join(",")
    : "";
}

function pollItem(id: number, onRead: (item: Readonly<Item>) => void): () => void {
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
    const item = await fetchItem(id).catch(() => null);

    if (!stopped) {
      if (item !== null) {
        onRead(item);
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

function usePolling(list: Readonly<ListState>, setList: SetList): void {
  const key = processingIds(list);

  useEffect(() => {
    const stops = (key === "" ? [] : key.split(",")).map((id) =>
      pollItem(Number(id), (read) => {
        setList((current) => withRead(current, read));
      }),
    );

    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, [key, setList]);
}

export function useLibrary() {
  const [list, setList] = useState<ListState>({ status: "loading" });

  const load = useCallback(
    () =>
      fetchItems()
        .then(
          (items): ListState => ({ status: "ready", items, loadedAt: Date.now() }),
          (): ListState => ({ status: "failed" }),
        )
        .then(setList),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(list, setList);

  const retry = useCallback(() => {
    setList({ status: "loading" });
    void load();
  }, [load]);

  const save = useCallback(async (url: string): Promise<SaveResult> => {
    const result = await saveLink(url);

    if (result.outcome === "saved") {
      setList((current) => withItem(current, result.item));
    }

    return result;
  }, []);

  return { list, save, retry };
}
