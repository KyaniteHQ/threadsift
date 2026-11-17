import { type RefObject, useLayoutEffect } from "react";

import { useArrivals } from "./place-arrival.ts";
import { anchorAt, keepPlace, placeOf, scrollToAnchor } from "./reading-place.ts";

const SAVE_DELAY_MS = 400;

function watchPlace(slot: HTMLElement, itemId: number, arriving: boolean): () => void {
  const anchor = arriving ? null : placeOf(itemId);
  let timer = 0;

  slot.scrollTop = 0;

  if (anchor !== null) scrollToAnchor(slot, anchor);

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

export function useReadingPlace(
  slot: RefObject<HTMLElement | null>,
  itemId: number,
  ready: boolean,
): void {
  const { pending } = useArrivals();

  useLayoutEffect(() => {
    const element = slot.current;

    return ready && element !== null ? watchPlace(element, itemId, pending()) : undefined;
  }, [slot, itemId, ready, pending]);
}
