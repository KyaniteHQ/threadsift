import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { SaveResult } from "./api.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./library.ts";
import type { SaveOutcome } from "./PasteBox.tsx";
import { focusListStart, scrollToTop } from "./reveal.ts";

function useKeptPlace(list: ListState, retry: () => void, pane: RefObject<HTMLElement | null>) {
  const retried = useRef(false);

  const retryAndKeepPlace = useCallback(() => {
    retried.current = true;
    retry();
  }, [retry]);

  useEffect(() => {
    if (retried.current && list.status !== "loading" && pane.current !== null) {
      retried.current = false;
      focusListStart(pane.current);
    }
  }, [list.status, pane]);

  return retryAndKeepPlace;
}

function useOpenItem(list: ListState) {
  const [openId] = useState(() => itemIdOf(window.location.pathname));

  const [attention, setAttention] = useState<Attention>(
    openId === null ? null : { id: openId, focus: true },
  );

  const missing =
    list.status === "ready" && openId !== null && !list.items.some((item) => item.id === openId);

  useEffect(() => {
    if (missing) {
      window.history.replaceState(null, "", "/");
    }
  }, [missing]);

  return { openId, attention, attend: setAttention };
}

function useSaveAndShow(
  save: (url: string) => Promise<SaveResult>,
  pane: RefObject<HTMLElement | null>,
) {
  return useCallback(
    async (url: string): Promise<SaveOutcome> => {
      const result = await save(url);

      if (result.outcome !== "saved") {
        return { saved: false, notice: result.outcome };
      }

      if (!result.refreshed && pane.current !== null) {
        scrollToTop(pane.current);
      }

      return { saved: true, itemId: result.item.id, refreshed: result.refreshed };
    },
    [pane, save],
  );
}

export const HIGHLIGHT_MS = 1800;

function useMark() {
  const [marked, setMarked] = useState<number | null>(null);
  const timer = useRef(0);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const mark = useCallback((id: number) => {
    window.clearTimeout(timer.current);
    setMarked(id);

    timer.current = window.setTimeout(() => {
      setMarked(null);
    }, HIGHLIGHT_MS);
  }, []);

  return { marked, mark };
}

export function useListActions(
  list: ListState,
  actions: Readonly<{ save: (url: string) => Promise<SaveResult>; retry: () => void }>,
  pane: RefObject<HTMLElement | null>,
) {
  const { save } = actions;
  const { openId, attention, attend } = useOpenItem(list);
  const { marked, mark } = useMark();

  const openItem = useCallback(
    (id: number) => {
      attend({ id, focus: true });
      mark(id);
    },
    [attend, mark],
  );

  const tryAgain = useCallback(
    (item: Item) => {
      attend({ id: item.id, focus: true });
      void save(item.originalUrl);
    },
    [attend, save],
  );

  return {
    openId,
    attention,
    marked,
    openItem,
    tryAgain,
    saveAndShow: useSaveAndShow(save, pane),
    retryAndKeepPlace: useKeptPlace(list, actions.retry, pane),
  };
}
