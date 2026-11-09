import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { SaveTarget } from "./api.ts";
import type { Attention } from "./ItemRow.tsx";
import type { SaveAnswer } from "./library.ts";
import type { ListState } from "./list-state.ts";
import { focusListStart, scrollToTop } from "./reveal.ts";
import type { Route } from "./routing.ts";
import type { PasteQueue, PasteRequest, SaveOutcome } from "./use-paste.ts";

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
    list.status === "ready" && openId !== null && !list.known.some((item) => item.id === openId);

  useEffect(() => {
    if (missing) {
      replace("/");
    }
  }, [missing, replace]);

  const attended = useCallback(() => {
    setAttention(null);
  }, []);

  const unshown =
    attention !== null &&
    list.status === "ready" &&
    !list.items.some((item) => item.id === attention.id);

  if (unshown) setAttention(null);

  return { attention, attend: setAttention, attended };
}

function useSaveAndShow(
  save: (target: SaveTarget) => Promise<SaveAnswer>,
  attend: (attention: Attention) => void,
  pane: RefObject<HTMLElement | null>,
) {
  return useCallback(
    async (target: SaveTarget): Promise<SaveOutcome> => {
      const result = await save(target);

      if (result.outcome === "discarded") return { kind: "discarded" };

      if (result.outcome !== "saved") return { kind: "notice", notice: result.outcome };

      if (result.known) {
        attend({ id: result.item.id, focus: false });
      } else if (pane.current !== null) {
        scrollToTop(pane.current);
      }

      return { kind: "item", itemId: result.item.id, refreshed: result.refreshed };
    },
    [attend, pane, save],
  );
}

function usePasteQueue() {
  const [requests, setRequests] = useState<readonly PasteRequest[]>([]);
  const sequence = useRef(0);

  const retryItem = useCallback((item: Item) => {
    if (item.retry === null) return;

    sequence.current += 1;
    const base = { url: item.originalUrl, seq: sequence.current };

    const queued: PasteRequest =
      item.retry === "digest"
        ? { ...base, kind: "digest", id: item.id }
        : { ...base, kind: "paste" };

    setRequests((current) => [...current, queued]);
  }, []);

  const taken = useCallback((seq: number) => {
    setRequests((current) => current.filter((each) => each.seq !== seq));
  }, []);

  const queue: PasteQueue = { next: requests[0] ?? null, taken };

  return { queue, retryItem };
}

export function useListActions(
  list: ListState,
  actions: Readonly<{
    save: (target: SaveTarget) => Promise<SaveAnswer>;
    retry: () => void;
  }>,
  pane: RefObject<HTMLElement | null>,
  route: Route,
) {
  const { attention, attend, attended } = useOpenItem(list, route);
  const { queue, retryItem } = usePasteQueue();

  const tryAgain = useCallback(
    (item: Item) => {
      attend({ id: item.id, focus: true });
      retryItem(item);
    },
    [attend, retryItem],
  );

  return {
    attention,
    attend,
    attended,
    queue,
    tryAgain,
    retryItem,
    saveAndShow: useSaveAndShow(actions.save, attend, pane),
    retryAndKeepPlace: useKeptPlace(list, actions.retry, pane),
  };
}
