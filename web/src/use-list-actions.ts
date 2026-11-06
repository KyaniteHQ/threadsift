import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { SaveResult } from "./api.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./library.ts";
import type { PasteRequest, SaveOutcome } from "./PasteBox.tsx";
import { focusListStart, scrollToTop } from "./reveal.ts";
import type { Route } from "./routing.ts";

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

function useOpenItem(list: ListState, { openId, replace }: Route) {
  const [attention, setAttention] = useState<Attention>(
    openId === null ? null : { id: openId, focus: true },
  );

  const missing =
    list.status === "ready" && openId !== null && !list.items.some((item) => item.id === openId);

  useEffect(() => {
    if (missing) {
      replace("/");
    }
  }, [missing, replace]);

  return { attention, attend: setAttention };
}

function useSaveAndShow(
  save: (url: string) => Promise<SaveResult>,
  attend: (attention: Attention) => void,
  pane: RefObject<HTMLElement | null>,
) {
  return useCallback(
    async (url: string): Promise<SaveOutcome> => {
      const result = await save(url);

      if (result.outcome !== "saved") {
        return { saved: false, notice: result.outcome };
      }

      if (result.known) {
        attend({ id: result.item.id, focus: false });
      } else if (pane.current !== null) {
        scrollToTop(pane.current);
      }

      return { saved: true, itemId: result.item.id, refreshed: result.refreshed };
    },
    [attend, pane, save],
  );
}

export function useListActions(
  list: ListState,
  actions: Readonly<{
    save: (url: string) => Promise<SaveResult>;
    retry: () => void;
    regenerate: (id: number) => Promise<void>;
  }>,
  pane: RefObject<HTMLElement | null>,
  route: Route,
) {
  const { attention, attend } = useOpenItem(list, route);
  const { regenerate } = actions;
  const [request, setRequest] = useState<PasteRequest | null>(null);

  const tryAgain = useCallback(
    (item: Item) => {
      attend({ id: item.id, focus: true });

      if (item.status !== "failed" && item.digestOutcome === "failed") {
        void regenerate(item.id);

        return;
      }

      setRequest((current) => ({ url: item.originalUrl, seq: (current?.seq ?? 0) + 1 }));
    },
    [regenerate, attend],
  );

  return {
    attention,
    request,
    tryAgain,
    saveAndShow: useSaveAndShow(actions.save, attend, pane),
    retryAndKeepPlace: useKeptPlace(list, actions.retry, pane),
  };
}
