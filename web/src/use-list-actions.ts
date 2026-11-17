import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import type { SaveResult } from "./api.ts";
import type { Attention } from "./ItemRow.tsx";
import { type ListState, readFor } from "./list-state.ts";
import { focusListStart, scrollToTop } from "./reveal.ts";
import type { Route } from "./routing.ts";
import { useLookup } from "./use-lookup.ts";
import type { PasteQueue, PasteRequest, Save, SaveOutcome } from "./use-paste.ts";

type SaveTarget = Parameters<Save>[0];

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

function lostRow(list: ListState, query: string, attention: Attention): boolean {
  if (attention === null || list.status !== "ready") return false;

  const reloading = attention.focus && !readFor(list, query);

  return !reloading && !list.items.some((item) => item.id === attention.id);
}

function useOpenItem(list: ListState, query: string, { openId }: Route) {
  const [attention, setAttention] = useState<Attention>(
    openId === null ? null : { id: openId, focus: true },
  );

  const attended = useCallback(() => {
    setAttention(null);
  }, []);

  if (lostRow(list, query, attention)) setAttention(null);

  return { attention, attend: setAttention, attended };
}

function useSaveAndShow(
  save: (target: SaveTarget) => Promise<SaveResult>,
  pane: RefObject<HTMLElement | null>,
) {
  return useCallback(
    async (target: SaveTarget): Promise<SaveOutcome> => {
      const result = await save(target);

      if (result.outcome !== "saved") return { kind: "notice", notice: result.outcome };

      if (!result.known && pane.current !== null) {
        scrollToTop(pane.current);
      }

      return {
        kind: "item",
        itemId: result.item.id,
        known: result.known,
        refreshed: result.refreshed,
      };
    },
    [pane, save],
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

  const next = requests[0] ?? null;
  const queue = useMemo<PasteQueue>(() => ({ next, taken }), [next, taken]);

  return { queue, retryItem };
}

export function useListActions(
  list: ListState,
  actions: Readonly<{
    save: (target: SaveTarget) => Promise<SaveResult>;
    retry: () => void;
    know: (item: Readonly<Item>) => void;
    query: string;
  }>,
  pane: RefObject<HTMLElement | null>,
  route: Route,
) {
  const { attention, attend, attended } = useOpenItem(list, actions.query, route);
  const { lookupFailed, lookAgain } = useLookup(list, route, actions.know);

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
    lookupFailed,
    lookAgain,
    queue,
    tryAgain,
    retryItem,
    saveAndShow: useSaveAndShow(actions.save, pane),
    retryAndKeepPlace: useKeptPlace(list, actions.retry, pane),
  };
}
