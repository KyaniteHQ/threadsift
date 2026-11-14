import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { type SaveTarget, fetchItem } from "./api.ts";
import type { Attention } from "./ItemRow.tsx";
import type { SaveAnswer } from "./library.ts";
import { type ListState, readFor } from "./list-state.ts";
import { focusListStart, scrollToTop } from "./reveal.ts";
import type { Route } from "./routing.ts";
import type { PasteQueue, PasteRequest, SaveOutcome } from "./use-paste.ts";
import { type Seeker, useSeek } from "./use-seek.ts";

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

function useLookup(
  list: ListState,
  { openId, replace }: Route,
  know: (item: Readonly<Item>) => void,
) {
  const [failedFor, setFailedFor] = useState<number | null>(null);

  const missing =
    list.status === "ready" && openId !== null && !list.known.some((item) => item.id === openId);

  const lookingUp = missing && openId !== failedFor;

  useEffect(() => {
    let current = true;

    const find = async (): Promise<void> => {
      if (!lookingUp || openId === null) return;

      const found = await fetchItem(openId).catch(() => "failed" as const);

      if (!current) return;

      if (found === "gone") replace("/");
      else if (found === "failed") setFailedFor(openId);
      else know(found);
    };

    void find();

    return () => {
      current = false;
    };
  }, [know, lookingUp, openId, replace]);

  if (failedFor !== null && openId !== failedFor) setFailedFor(null);

  const lookupFailed = missing && openId === failedFor;

  const lookAgain = useCallback(() => {
    setFailedFor(null);
  }, []);

  return { lookupFailed, lookAgain };
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
  save: (target: SaveTarget) => Promise<SaveAnswer>,
  { seek, cancel }: Readonly<ReturnType<typeof useSeek>>,
  pane: RefObject<HTMLElement | null>,
) {
  return useCallback(
    async (target: SaveTarget): Promise<SaveOutcome> => {
      cancel();
      const result = await save(target);

      if (result.outcome === "discarded") return { kind: "discarded" };

      if (result.outcome !== "saved") return { kind: "notice", notice: result.outcome };

      if (result.known) {
        seek(result.item.id);
      } else if (pane.current !== null) {
        scrollToTop(pane.current);
      }

      return { kind: "item", itemId: result.item.id, refreshed: result.refreshed };
    },
    [cancel, pane, save, seek],
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

function useSeekingAttention(
  list: ListState,
  route: Route,
  actions: Readonly<Pick<Seeker, "filters" | "know" | "more">>,
  reveal: (attention: Attention) => void,
) {
  const seeking = useSeek({
    list,
    openId: route.openId,
    filters: actions.filters,
    know: actions.know,
    more: actions.more,
    attend: reveal,
  });

  const { cancel } = seeking;

  const attend = useCallback(
    (moved: Attention) => {
      cancel();
      reveal(moved);
    },
    [cancel, reveal],
  );

  return { seeking, attend };
}

export function useListActions(
  list: ListState,
  actions: Readonly<{
    save: (target: SaveTarget) => Promise<SaveAnswer>;
    retry: () => void;
    know: (item: Readonly<Item>) => void;
    more: () => void;
    filters: Seeker["filters"];
    query: string;
  }>,
  pane: RefObject<HTMLElement | null>,
  route: Route,
) {
  const { attention, attend: reveal, attended } = useOpenItem(list, actions.query, route);
  const { lookupFailed, lookAgain } = useLookup(list, route, actions.know);

  const { queue, retryItem } = usePasteQueue();
  const { seeking, attend } = useSeekingAttention(list, route, actions, reveal);

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
    saveAndShow: useSaveAndShow(actions.save, seeking, pane),
    retryAndKeepPlace: useKeptPlace(list, actions.retry, pane),
  };
}
