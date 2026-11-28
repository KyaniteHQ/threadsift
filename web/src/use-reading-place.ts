import { type RefObject, useLayoutEffect } from "react";

import { READ_DEADLINE_MS } from "./calls.ts";
import { useDatabase } from "./database-context.ts";
import { useArrivals } from "./place-arrival.ts";
import { type PlaceOwner, anchorAt, keepPlace, placeOf, scrollToAnchor } from "./reading-place.ts";

const SAVE_DELAY_MS = 400;

type Phase =
  | { readonly kind: "waiting"; readonly ownerMoved: () => boolean }
  | { readonly kind: "watching"; readonly watching: AbortController }
  | { readonly kind: "closed" };

function startWatching(slot: HTMLElement, owner: PlaceOwner): AbortController {
  const watching = new AbortController();
  const { signal } = watching;
  let timer = 0;

  const save = (): void => {
    window.clearTimeout(timer);
    keepPlace(owner, anchorAt(slot));
  };

  const onScroll = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, SAVE_DELAY_MS);
  };

  slot.addEventListener("scroll", onScroll, { passive: true, signal });
  window.addEventListener("pagehide", save, { signal });
  signal.addEventListener("abort", save, { once: true });

  return watching;
}

function restorePlace(slot: HTMLElement, owner: PlaceOwner): void {
  const anchor = placeOf(owner);

  if (anchor !== null) scrollToAnchor(slot, anchor);
}

const SCROLL_KEYS: ReadonlySet<string> = new Set([
  " ",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

function watchOwnerScroll(slot: HTMLElement, signal: AbortSignal): () => boolean {
  let armed = false;
  let moved = false;
  let seenAt = slot.scrollTop;
  const arm = (): void => {
    armed = true;
  };
  const scrolledByOwner = (): boolean => armed && slot.scrollTop !== seenAt;

  slot.addEventListener("wheel", arm, { passive: true, signal });
  slot.addEventListener("touchmove", arm, { passive: true, signal });
  slot.addEventListener(
    "keydown",
    (event) => {
      if (SCROLL_KEYS.has(event.key)) arm();
    },
    { signal },
  );
  slot.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target === slot) arm();
    },
    { signal },
  );
  slot.addEventListener(
    "scroll",
    () => {
      moved ||= scrolledByOwner();
      seenAt = slot.scrollTop;
    },
    { passive: true, signal },
  );

  return () => moved || scrolledByOwner();
}

function waitForFonts(slot: HTMLElement, owner: PlaceOwner): () => void {
  const waiting = new AbortController();
  let phase: Phase = { kind: "waiting", ownerMoved: watchOwnerScroll(slot, waiting.signal) };

  const keepMoved = (): void => {
    if (phase.kind === "waiting" && phase.ownerMoved()) keepPlace(owner, anchorAt(slot));
  };

  const restore = (): void => {
    if (phase.kind !== "waiting") return;

    waiting.abort();
    window.clearTimeout(deadline);
    if (!phase.ownerMoved()) restorePlace(slot, owner);
    phase = { kind: "watching", watching: startWatching(slot, owner) };
  };

  const deadline = window.setTimeout(restore, READ_DEADLINE_MS);

  window.addEventListener("pagehide", keepMoved, { signal: waiting.signal });
  void document.fonts.ready.then(restore);

  return () => {
    window.clearTimeout(deadline);

    if (phase.kind === "waiting") {
      waiting.abort();
      keepMoved();
    } else if (phase.kind === "watching") {
      phase.watching.abort();
    }

    phase = { kind: "closed" };
  };
}

function watchAfterFonts(slot: HTMLElement, owner: PlaceOwner, arriving: boolean): () => void {
  slot.scrollTop = 0;

  if (!arriving) return waitForFonts(slot, owner);

  const watching = startWatching(slot, owner);

  return () => {
    watching.abort();
  };
}

export function useReadingPlace(
  slot: RefObject<HTMLElement | null>,
  itemId: number,
  ready: boolean,
): void {
  const { pending } = useArrivals();
  const database = useDatabase();

  useLayoutEffect(() => {
    const element = slot.current;

    return ready && element !== null
      ? watchAfterFonts(element, { database, itemId }, pending())
      : undefined;
  }, [slot, database, itemId, ready, pending]);
}
