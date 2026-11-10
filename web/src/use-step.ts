import { useCallback, useEffect, useMemo, useRef } from "react";

import { itemPath } from "../../src/core/item-path.ts";
import type { Attention } from "./ItemRow.tsx";
import { usePageReader } from "./list-more.ts";
import type { ListState, Ready } from "./list-state.ts";
import { focusNeighbourCard } from "./reveal.ts";
import type { Route } from "./routing.ts";
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

export type Stepping = Readonly<{
  list: ListState;
  route: Route;
  attend: (attention: Attention) => void;
  dom: LibraryDom;
  focusTitleOf: (id: number | null) => void;
  covers: boolean;
  more: () => void;
  announce: (text: string, failed?: boolean) => void;
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

function goOrStop(id: number | null): Decision {
  return id === null ? STOP : { kind: "go", id };
}

function listed(list: Readonly<Ready>, id: number | null): boolean {
  return id === null || list.items.some((item) => item.id === id);
}

function decide(list: Readonly<Ready>, want: Readonly<Pending>, openId: number | null): Decision {
  const read: Decision = { kind: "read", list };

  if (want.openId !== openId) return STOP;

  if (want.cards) {
    if (document.activeElement !== want.origin) return STOP;

    const found = list.items[want.shown];

    return found === undefined ? read : goOrStop(found.id);
  }

  const next = neighbour(list, openId, want.direction);

  if (!listed(list, openId)) return list.next === null ? goOrStop(next) : read;

  if (next !== null) return goOrStop(next);

  return want.direction < 0 || list.next === null ? STOP : read;
}

function usePending() {
  const held = useRef<Pending | null>(null);

  return useMemo(
    () => ({
      get: (): Pending | null => held.current,
      start: (want: Pending): void => {
        held.current = want;
      },
      clear: (): void => {
        held.current = null;
      },
    }),
    [],
  );
}

type PendingStep = ReturnType<typeof usePending>;

function useSettle(
  pending: Readonly<PendingStep>,
  {
    list,
    openId,
    attend,
    more,
    announce,
  }: Pick<Stepping, "list" | "attend" | "more" | "announce"> & Readonly<{ openId: number | null }>,
  goTo: (id: number) => void,
) {
  const reader = usePageReader(more);

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

    if (reader.hasAsked()) announce("");

    if (decision.kind === "go" && want.cards) attend({ id: decision.id, focus: true });
    else if (decision.kind === "go") goTo(decision.id);
  }, [announce, attend, goTo, list, openId, pending, reader]);

  useEffect(() => {
    settle();
  }, [settle]);

  return { settle, forget: reader.forget };
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
}: Stepping) {
  const { openId, replace } = route;
  const { inReader, appOf } = dom;
  const pending = usePending();

  const goTo = useCallback(
    (id: number): void => {
      const fromReader = inReader();
      focusTitleOf(fromReader ? id : null);
      attend({ id, focus: !fromReader });
      replace(itemPath(id));
    },
    [attend, focusTitleOf, inReader, replace],
  );

  const { settle, forget } = useSettle(pending, { list, openId, attend, more, announce }, goTo);

  return useCallback(
    (direction: 1 | -1) => {
      const cards = openId === null && covers;

      if (cards && (focusNeighbourCard(appOf(), direction) || direction < 0 || !hasMore(list))) {
        pending.clear();

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
