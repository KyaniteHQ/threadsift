import { type RefObject, useEffect, useLayoutEffect } from "react";

import { anchorAt, keepPlace, placeOf, scrollToAnchor } from "./reading-place.ts";

const SAVE_DELAY_MS = 400;
const SETTLE_DELAY_MS = 450;

function restore(slot: HTMLElement, itemId: number): void {
  const anchor = placeOf(itemId);

  slot.scrollTop = 0;

  if (anchor !== null && scrollToAnchor(slot, anchor)) {
    const at = slot.scrollTop;

    const resettle = (): void => {
      if (slot.isConnected && slot.scrollTop === at) scrollToAnchor(slot, anchor);
    };

    window.setTimeout(resettle, SETTLE_DELAY_MS);
    void document.fonts.ready.then(resettle);
  }
}

function keepWhileOpen(slot: HTMLElement, itemId: number): () => void {
  restore(slot, itemId);

  return () => {
    keepPlace(itemId, anchorAt(slot));
  };
}

function saveOnScroll(slot: HTMLElement, itemId: number): () => void {
  let timer = 0;

  const save = (): void => {
    window.clearTimeout(timer);
    keepPlace(itemId, anchorAt(slot));
  };

  const later = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(save, SAVE_DELAY_MS);
  };

  slot.addEventListener("scroll", later, { passive: true });
  window.addEventListener("pagehide", save);

  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("pagehide", save);
    slot.removeEventListener("scroll", later);
  };
}

export function useReadingPlace(
  slot: RefObject<HTMLElement | null>,
  itemId: number,
  ready: boolean,
): void {
  useLayoutEffect(
    () => (ready && slot.current !== null ? keepWhileOpen(slot.current, itemId) : undefined),
    [slot, itemId, ready],
  );

  useEffect(
    () => (ready && slot.current !== null ? saveOnScroll(slot.current, itemId) : undefined),
    [slot, itemId, ready],
  );
}
