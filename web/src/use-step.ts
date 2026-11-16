import { useCallback, useEffect, useMemo, useRef } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import { usePageReader } from "./list-more.ts";
import type { ListState, Ready } from "./list-state.ts";
import { focusNeighbourCard } from "./reveal.ts";
import { type Route, onItem } from "./routing.ts";
import { LOADING_LABEL, LOAD_FAILED } from "./text.ts";

export function neighbour(list: Readonly<ListState>, openId: number | null, direction: 1 | -1) {
  if (list.status !== "ready") return null;

  const ids = list.items.map((item) => item.id);
  const at = openId === null ? -1 : ids.indexOf(openId);

  if (at < 0) return (direction > 0 ? ids[0] : ids.at(-1)) ?? null;

  return ids[at + direction] ?? null;
}

export function hasMore(list: Readonly<ListState>): boolean {
  return list.status === "ready" && list.next !== null;
}

export interface LibraryDom {
  readonly inReader: () => boolean;
  readonly appOf: () => Element | null;
}

type Stepping = Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  dom: LibraryDom;
  focusTitleOf: (id: number | null) => void;
  covers: boolean;
  more: () => void;
  announce: (text: string, failed?: boolean) => void;
  retract: (text: string) => void;
}>;

interface Pending {
  readonly direction: 1 | -1;
  readonly openId: number | null;
  readonly cards: boolean;
  readonly origin: Element | null;
  readonly shown: number;
}

type Decision = Readonly<
  { kind: "stop" } | { kind: "read"; list: Ready } | { kind: "go"; id: number }
>;

const STOP: Decision = { kind: "stop" };

const DROPPING_EVENTS = ["keydown", "focusout", "popstate"] as const;

function goOrStop(id: number | null): Decision {
  return id === null ? STOP : { kind: "go", id };
}

function listed(list: Readonly<Ready>, id: number | null): boolean {
  return id === null || list.items.some((item) => item.id === id);
}

function decide(list: Readonly<Ready>, want: Readonly<Pending>, openId: number | null): Decision {
  const read: Decision = { kind: "read", list };

  if (want.openId !== openId) return STOP;

  if (document.activeElement !== want.origin) return STOP;

  if (want.cards) {
    const found = list.items[want.shown];

    return found === undefined ? read : goOrStop(found.id);
  }

  const next = neighbour(list, openId, want.direction);

  if (!listed(list, openId)) return list.next === null ? goOrStop(next) : read;

  if (next !== null) return goOrStop(next);

  return want.direction < 0 || list.next === null ? STOP : read;
}

function usePending(onDrop: () => void) {
  const held = useRef<Pending | null>(null);
  const watching = useRef<AbortController | null>(null);

  const clear = useCallback((): void => {
    held.current = null;
    watching.current?.abort();
    watching.current = null;
  }, []);

  const drop = useCallback((): void => {
    onDrop();
    clear();
  }, [clear, onDrop]);

  const start = useCallback(
    (want: Pending): void => {
      clear();
      held.current = want;
      watching.current = new AbortController();

      for (const type of DROPPING_EVENTS) {
        window.addEventListener(type, drop, { capture: true, signal: watching.current.signal });
      }
    },
    [clear, drop],
  );

  useEffect(() => clear, [clear]);

  return useMemo(
    () => ({ get: (): Pending | null => held.current, start, clear, drop }),
    [clear, drop, start],
  );
}

type PendingStep = ReturnType<typeof usePending>;

type Settling = Pick<Stepping, "list" | "announce"> &
  Readonly<{
    openId: number | null;
    reader: Readonly<ReturnType<typeof usePageReader>>;
    stopReading: () => void;
  }>;

function useSettle(
  pending: Readonly<PendingStep>,
  { list, openId, announce, reader, stopReading }: Settling,
  goTo: (id: number, cards: boolean) => void,
) {
  const settle = useCallback(() => {
    const want = pending.get();

    if (want === null) return;

    const decision = list.status === "ready" ? decide(list, want, openId) : STOP;
    const reading = decision.kind === "read" ? reader.read(decision.list) : null;

    if (reading === "wait") return;

    if (reading === "read") {
      announce(LOADING_LABEL);

      return;
    }

    pending.clear();

    if (reading === "failed") {
      announce(LOAD_FAILED, true);

      return;
    }

    stopReading();

    if (decision.kind === "go") goTo(decision.id, want.cards);
  }, [announce, goTo, list, openId, pending, reader, stopReading]);

  useEffect(() => {
    settle();
  }, [settle]);

  return settle;
}

function useGoTo({
  route,
  attend,
  dom,
  focusTitleOf,
}: Pick<Stepping, "route" | "attend" | "dom" | "focusTitleOf">) {
  const { navigate, replace } = route;
  const { inReader } = dom;

  return useCallback(
    (id: number, cards: boolean): void => {
      if (cards) {
        attend({ id, focus: true });

        return;
      }

      const fromReader = inReader();
      focusTitleOf(fromReader ? id : null);
      attend({ id, focus: !fromReader });

      if (onItem()) replace(itemPath(id));
      else navigate(itemPath(id));
    },
    [attend, focusTitleOf, inReader, navigate, replace],
  );
}

export function useStep({
  list,
  route,
  attend,
  dom,
  focusTitleOf,
  covers,
  more,
  announce,
  retract,
}: Stepping) {
  const { openId } = route;
  const { appOf } = dom;
  const reader = usePageReader(more);

  const stopReading = useCallback((): void => {
    if (reader.hasAsked()) retract(LOADING_LABEL);
  }, [reader, retract]);

  const pending = usePending(stopReading);
  const goTo = useGoTo({ route, attend, dom, focusTitleOf });
  const settle = useSettle(pending, { list, openId, announce, reader, stopReading }, goTo);
  const { forget } = reader;

  return useCallback(
    (direction: 1 | -1) => {
      const cards = openId === null && covers;

      if (cards && (focusNeighbourCard(appOf(), direction) || direction < 0 || !hasMore(list))) {
        pending.drop();

        return;
      }

      forget();

      pending.start({
        direction,
        openId,
        cards,
        origin: document.activeElement,
        shown: list.status === "ready" ? list.items.length : 0,
      });
      settle();
    },
    [appOf, covers, forget, list, openId, pending, settle],
  );
}
