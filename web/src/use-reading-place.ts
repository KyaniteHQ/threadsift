import { type RefObject, useLayoutEffect } from "react";

import { READ_DEADLINE_MS } from "./calls.ts";
import { useArrivals } from "./place-arrival.ts";
import { anchorAt, keepPlace, placeOf, scrollToAnchor } from "./reading-place.ts";

const SAVE_DELAY_MS = 400;

type Phase =
  | { readonly kind: "waiting"; readonly moved: boolean }
  | { readonly kind: "watching"; readonly watching: AbortController }
  | { readonly kind: "closed" };

function watchPlace(slot: HTMLElement, itemId: number, signal: AbortSignal): void {
  let timer = 0;

  const save = (): void => {
    window.clearTimeout(timer);
    keepPlace(itemId, anchorAt(slot));
  };

  const onScroll = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, SAVE_DELAY_MS);
  };

  slot.addEventListener("scroll", onScroll, { passive: true, signal });
  window.addEventListener("pagehide", save, { signal });
  signal.addEventListener("abort", save, { once: true });
}

function startWatching(slot: HTMLElement, itemId: number): AbortController {
  const watching = new AbortController();

  watchPlace(slot, itemId, watching.signal);

  return watching;
}

function restorePlace(slot: HTMLElement, itemId: number): void {
  const anchor = placeOf(itemId);

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

function watchOwnerScroll(slot: HTMLElement, signal: AbortSignal, onMove: () => void): void {
  slot.addEventListener("wheel", onMove, { passive: true, signal });
  slot.addEventListener("touchmove", onMove, { passive: true, signal });
  slot.addEventListener(
    "keydown",
    (event) => {
      if (SCROLL_KEYS.has(event.key)) onMove();
    },
    { signal },
  );
  slot.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target === slot) onMove();
    },
    { signal },
  );
}

function waitForFonts(slot: HTMLElement, itemId: number): () => void {
  const waiting = new AbortController();
  let phase: Phase = { kind: "waiting", moved: false };

  const keepMoved = (): void => {
    if (phase.kind === "waiting" && phase.moved) keepPlace(itemId, anchorAt(slot));
  };

  const restore = (): void => {
    if (phase.kind !== "waiting") return;

    waiting.abort();
    window.clearTimeout(deadline);
    if (!phase.moved) restorePlace(slot, itemId);
    phase = { kind: "watching", watching: startWatching(slot, itemId) };
  };

  const deadline = window.setTimeout(restore, READ_DEADLINE_MS);

  watchOwnerScroll(slot, waiting.signal, () => {
    if (phase.kind === "waiting") phase = { kind: "waiting", moved: true };
  });
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

function watchAfterFonts(slot: HTMLElement, itemId: number, arriving: boolean): () => void {
  slot.scrollTop = 0;

  if (!arriving) return waitForFonts(slot, itemId);

  const watching = startWatching(slot, itemId);

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

  useLayoutEffect(() => {
    const element = slot.current;

    return ready && element !== null ? watchAfterFonts(element, itemId, pending()) : undefined;
  }, [slot, itemId, ready, pending]);
}
