import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import type { Item } from "../../src/http/schemas.ts";
import { type SaveResult, fetchItem, fetchItems, saveLink } from "./api.ts";

export type ListState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly items: readonly Item[]; readonly loadedAt: number };

export const POLL_MS = 1000;

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

function withRead(list: Readonly<ListState>, asked: Readonly<Item>, read: Readonly<Item>) {
  const current = list.status === "ready" ? list.items.find((item) => item.id === asked.id) : null;

  return current === asked ? withItem(list, read) : list;
}

function processingIn(list: Readonly<ListState>): readonly Item[] {
  return list.status === "ready" ? list.items.filter((item) => item.status === "processing") : [];
}

async function readOne(asked: Readonly<Item>, setList: SetList): Promise<void> {
  const read = await fetchItem(asked.id).catch(() => asked);

  setList((list) => withRead(list, asked, read));
}

function usePolling(list: Readonly<ListState>, setList: SetList): void {
  const readAll = useEffectEvent(() => {
    for (const asked of processingIn(list)) {
      void readOne(asked, setList);
    }
  });

  const key = processingIn(list)
    .map((item) => item.id)
    .join(",");

  useEffect(() => {
    const timer = key === "" ? 0 : window.setInterval(readAll, POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [key]);
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
