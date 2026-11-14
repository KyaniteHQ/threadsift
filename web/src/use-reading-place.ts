import { type RefObject, useLayoutEffect, useRef } from "react";

import { useArrivals } from "./place-arrival.ts";
import { type Anchor, anchorAt, keepPlace, placeOf, scrollToAnchor } from "./reading-place.ts";

const SAVE_DELAY_MS = 400;
const SETTLE_DELAY_MS = 450;

interface PlaceWatch {
  readonly reflowed: () => void;
  readonly stop: () => void;
}

function untouched(slot: HTMLElement, at: number): boolean {
  const farthest = slot.scrollHeight - slot.clientHeight;

  return Math.abs(slot.scrollTop - Math.min(at, farthest)) < 1;
}

function holdAnchor(slot: HTMLElement, anchor: Readonly<Anchor>, done: () => void) {
  let live = true;
  let at = slot.scrollTop;

  const resettle = (): void => {
    if (live && slot.isConnected && untouched(slot, at)) {
      scrollToAnchor(slot, anchor);
      at = slot.scrollTop;
    }
  };

  const timer = window.setTimeout(() => {
    resettle();
    done();
  }, SETTLE_DELAY_MS);

  void document.fonts.ready.then(resettle);

  return {
    cancel: () => {
      live = false;
      window.clearTimeout(timer);
    },
    moved: () => !untouched(slot, at),
  };
}

function newSettler(slot: HTMLElement, first: Readonly<Anchor> | null) {
  let hold: ReturnType<typeof holdAnchor> | null = null;
  let seen = first;

  const stop = (): void => {
    hold?.cancel();
    hold = null;
  };

  const returnTo = (anchor: Readonly<Anchor> | null): void => {
    stop();

    if (anchor === null || !scrollToAnchor(slot, anchor)) return;

    hold = holdAnchor(slot, anchor, () => {
      hold = null;
    });
  };

  const scrolled = (): void => {
    if (hold === null || hold.moved()) {
      stop();
      seen = anchorAt(slot);
    }
  };

  const reflowed = (): void => {
    returnTo(seen);
  };

  return { reflowed, scrolled, place: () => (hold === null ? anchorAt(slot) : seen), stop };
}

function onWidthChange(slot: HTMLElement, changed: () => void): () => void {
  let width = slot.clientWidth;

  const observer = new ResizeObserver(() => {
    if (slot.clientWidth !== width) {
      width = slot.clientWidth;
      changed();
    }
  });

  observer.observe(slot);

  return () => {
    observer.disconnect();
  };
}

function loadMovesText(target: EventTarget | null): boolean {
  return target instanceof HTMLImageElement && !target.hasAttribute("width");
}

function onImageSettled(slot: HTMLElement, reflowed: () => void): () => void {
  const controller = new AbortController();

  const afterFrames = (): void => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!controller.signal.aborted) reflowed();
      });
    });
  };

  const swaps = new MutationObserver((records) => {
    const lostImage = records.some(({ removedNodes }) =>
      Array.from(removedNodes).some(
        (node) =>
          node instanceof HTMLElement &&
          (node.matches("img") || node.querySelector("img") !== null),
      ),
    );

    if (lostImage) afterFrames();
  });

  swaps.observe(slot, { childList: true, subtree: true });
  slot.addEventListener(
    "load",
    (event) => {
      if (loadMovesText(event.target)) afterFrames();
    },
    { capture: true, signal: controller.signal },
  );

  return () => {
    swaps.disconnect();
    controller.abort();
  };
}

function watchPlace(slot: HTMLElement, itemId: number, arriving: boolean): PlaceWatch {
  const settler = newSettler(slot, arriving ? null : placeOf(itemId));
  let saveTimer = 0;
  let frame = 0;

  const save = (): void => {
    window.clearTimeout(saveTimer);
    keepPlace(itemId, settler.place());
  };

  const onScroll = (): void => {
    if (frame === 0) {
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        settler.scrolled();
      });
    }

    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, SAVE_DELAY_MS);
  };

  const { reflowed } = settler;

  slot.scrollTop = 0;
  reflowed();
  slot.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pagehide", save);
  const unwatchWidth = onWidthChange(slot, reflowed);

  const unwatchImages = onImageSettled(slot, reflowed);

  return {
    reflowed,
    stop: () => {
      const kept = settler.place();

      settler.stop();
      window.clearTimeout(saveTimer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pagehide", save);
      slot.removeEventListener("scroll", onScroll);
      unwatchImages();
      unwatchWidth();
      keepPlace(itemId, kept);
    },
  };
}

function noWatch(): void {}

export function useReadingPlace(
  slot: RefObject<HTMLElement | null>,
  itemId: number,
  ready: boolean,
  lookKey: string,
): void {
  const watch = useRef<PlaceWatch | null>(null);
  const lastLook = useRef(lookKey);
  const { pending } = useArrivals();

  useLayoutEffect(() => {
    const element = slot.current;

    if (!ready || element === null) return noWatch;

    const opened = watchPlace(element, itemId, pending());
    watch.current = opened;

    return () => {
      opened.stop();
      watch.current = null;
    };
  }, [slot, itemId, ready, pending]);

  useLayoutEffect(() => {
    if (lastLook.current !== lookKey) {
      lastLook.current = lookKey;
      watch.current?.reflowed();
    }
  }, [lookKey]);
}
