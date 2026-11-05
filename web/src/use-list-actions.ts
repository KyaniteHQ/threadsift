import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { itemIdOf } from "../../src/core/item-path.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { SaveResult } from "./api.ts";
import type { Attention } from "./ItemRow.tsx";
import type { ListState } from "./library.ts";
import type { PasteRequest, SaveOutcome } from "./PasteBox.tsx";
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
  actions: Readonly<{ save: (url: string) => Promise<SaveResult>; retry: () => void }>,
  pane: RefObject<HTMLElement | null>,
) {
  const { openId, attention, attend } = useOpenItem(list);
  const [request, setRequest] = useState<PasteRequest | null>(null);

  const tryAgain = useCallback(
    (item: Item) => {
      attend({ id: item.id, focus: true });
      setRequest((current) => ({ url: item.originalUrl, seq: (current?.seq ?? 0) + 1 }));
    },
    [attend],
  );

  return {
    openId,
    attention,
    request,
    tryAgain,
    saveAndShow: useSaveAndShow(actions.save, attend, pane),
    retryAndKeepPlace: useKeptPlace(list, actions.retry, pane),
  };
}
