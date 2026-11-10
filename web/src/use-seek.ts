import { useCallback, useContext, useEffect, useRef, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { fetchItem } from "./api.ts";
import { type Filters, isFiltered } from "./filters.ts";
import type { Attention } from "./ItemRow.tsx";
import { usePageReader } from "./list-more.ts";
import type { ListState, Ready } from "./list-state.ts";
import { ShareContext } from "./share-handoff.ts";

type Step = Readonly<
  { kind: "wait" } | { kind: "show" } | { kind: "stop" } | { kind: "read"; list: Ready }
>;

interface Place {
  readonly openId: number | null;
  readonly filters: Readonly<Filters>;
}

interface Seeking {
  readonly id: number;
  place: Place | null;
}

export type Seeker = Readonly<{
  list: ListState;
  openId: number | null;
  filters: Readonly<Filters>;
  know: (item: Readonly<Item>) => void;
  more: () => void;
  attend: (attention: Attention) => void;
}>;

const WAIT: Step = { kind: "wait" };
const SHOW: Step = { kind: "show" };
const STOP: Step = { kind: "stop" };

const OWNER_MOVES = ["wheel", "touchmove", "keydown", "pointerdown"] as const;

function stepOf(list: Readonly<ListState>, id: number, filtered: boolean): Step {
  if (list.status === "failed") return STOP;

  if (list.status === "loading") return WAIT;

  if (list.items.some((item) => item.id === id)) return SHOW;

  if (!list.known.some((item) => item.id === id)) return STOP;

  return filtered || list.next === null ? STOP : { kind: "read", list };
}

function useSharedArrival(
  ready: boolean,
  know: (item: Readonly<Item>) => void,
  seek: (id: number) => void,
): void {
  const { arrival } = useContext(ShareContext);
  const shared = useRef(arrival?.kind === "saved" ? arrival.id : null);

  useEffect(() => {
    const id = shared.current;

    if (!ready || id === null) return;

    shared.current = null;

    const find = async (): Promise<void> => {
      const found = await fetchItem(id).catch(() => "failed" as const);

      if (found === "gone" || found === "failed") return;

      know(found);
      seek(found.id);
    };

    void find();
  }, [know, ready, seek]);
}

function onOwnerMove(end: () => void): () => void {
  for (const type of OWNER_MOVES) {
    document.addEventListener(type, end, { capture: true, passive: true });
  }

  return () => {
    for (const type of OWNER_MOVES) document.removeEventListener(type, end, true);
  };
}

function useOwnerMoveEnds(started: Readonly<Seeking> | null, cancel: () => void): void {
  useEffect(() => (started === null ? undefined : onOwnerMove(cancel)), [cancel, started]);
}

export function useSeek({ list, openId, filters, know, more, attend }: Seeker) {
  const [started, start] = useState<Seeking | null>(null);
  const live = useRef<Seeking | null>(null);
  const reader = usePageReader(more);
  const { forget } = reader;

  const cancel = useCallback(() => {
    live.current = null;
  }, []);

  const seek = useCallback(
    (id: number) => {
      const next: Seeking = { id, place: null };
      forget();
      live.current = next;
      start(next);
    },
    [forget],
  );

  useSharedArrival(list.status === "ready", know, seek);
  useOwnerMoveEnds(started, cancel);

  useEffect(() => {
    if (started === null || live.current !== started) return;

    started.place ??= { openId, filters };
    const { id, place } = started;

    const step =
      place.openId === openId && place.filters === filters
        ? stepOf(list, id, isFiltered(filters))
        : STOP;

    if (step.kind === "wait") return;

    if (step.kind === "read") {
      const reading = reader.read(step.list);

      if (reading === "read" || reading === "wait") return;
    }

    if (step.kind === "show") attend({ id, focus: false });

    live.current = null;
  }, [attend, filters, list, openId, reader, started]);

  return { seek, cancel };
}
