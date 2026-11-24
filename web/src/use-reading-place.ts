import { type RefObject, useLayoutEffect } from "react";

import { READ_DEADLINE_MS } from "./calls.ts";
import { useArrivals } from "./place-arrival.ts";
import { anchorAt, keepPlace, placeOf, scrollToAnchor } from "./reading-place.ts";

const SAVE_DELAY_MS = 400;

function watchPlace(slot: HTMLElement, itemId: number): () => void {
  let timer = 0;

  const save = (): void => {
    window.clearTimeout(timer);
    keepPlace(itemId, anchorAt(slot));
  };

  const onScroll = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, SAVE_DELAY_MS);
  };

  slot.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pagehide", save);

  return () => {
    save();
    slot.removeEventListener("scroll", onScroll);
    window.removeEventListener("pagehide", save);
  };
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
    { passive: true, signal },
  );
  slot.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target === slot) onMove();
    },
    { passive: true, signal },
  );
}

function watchAfterFonts(slot: HTMLElement, itemId: number, arriving: boolean): () => void {
  slot.scrollTop = 0;

  if (arriving) return watchPlace(slot, itemId);

  const waiting = new AbortController();
  let moved = false;
  let stop: (() => void) | undefined;

  const keepMoved = (): void => {
    if (moved) keepPlace(itemId, anchorAt(slot));
  };

  const restore = (): void => {
    if (waiting.signal.aborted) return;

    waiting.abort();
    window.clearTimeout(deadline);
    if (!moved) restorePlace(slot, itemId);
    stop = watchPlace(slot, itemId);
  };

  const deadline = window.setTimeout(restore, READ_DEADLINE_MS);

  watchOwnerScroll(slot, waiting.signal, () => {
    moved = true;
  });
  window.addEventListener("pagehide", keepMoved, { signal: waiting.signal });
  void document.fonts.ready.then(restore);

  return () => {
    window.clearTimeout(deadline);

    if (stop === undefined) {
      waiting.abort();
      keepMoved();
    } else stop();
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
