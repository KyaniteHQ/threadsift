import { type RefObject, useLayoutEffect } from "react";

import { READ_DEADLINE_MS } from "./calls.ts";
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

function watchAfterFonts(slot: HTMLElement, itemId: number, arriving: boolean): () => void {
  if (arriving) return watchPlace(slot, itemId, true);

  let stop: (() => void) | undefined;
  let cancelled = false;

  const restore = (): void => {
    if (cancelled || stop !== undefined) return;

    window.clearTimeout(deadline);
    stop = watchPlace(slot, itemId, arriving);
  };

  const deadline = window.setTimeout(restore, READ_DEADLINE_MS);
  void document.fonts.ready.then(restore);

  return () => {
    cancelled = true;
    window.clearTimeout(deadline);
    stop?.();
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
