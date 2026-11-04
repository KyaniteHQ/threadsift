import { useCallback, useEffect, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { type SaveOutcome, fetchItems, saveLink } from "./api.ts";

export type ListState =
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly items: readonly Item[]; readonly loadedAt: number };

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

  const retry = useCallback(() => {
    setList({ status: "loading" });
    void load();
  }, [load]);

  const save = useCallback(
    async (url: string): Promise<SaveOutcome> => {
      const outcome = await saveLink(url);

      if (outcome === "saved") {
        await load();
      }

      return outcome;
    },
    [load],
  );

  return { list, save, retry };
}
