import { type RefObject, useLayoutEffect, useRef } from "react";

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

function newSettler(slot: HTMLElement) {
  let cancel: (() => void) | null = null;

  const stop = (): void => {
    cancel?.();
    cancel = null;
  };

  const returnTo = (anchor: Readonly<Anchor> | null): void => {
    stop();

    if (anchor === null || !scrollToAnchor(slot, anchor)) return;

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
      cancel = null;
    }, SETTLE_DELAY_MS);

    void document.fonts.ready.then(resettle);

    cancel = () => {
      live = false;
      window.clearTimeout(timer);
    };
  };

  return { returnTo, stop, isSettling: () => cancel !== null };
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

function watchPlace(slot: HTMLElement, itemId: number): PlaceWatch {
  const settler = newSettler(slot);
  let seen = placeOf(itemId);
  let saveTimer = 0;
  let frame = 0;

  const save = (): void => {
    window.clearTimeout(saveTimer);
    keepPlace(itemId, anchorAt(slot));
  };

  const onScroll = (): void => {
    if (!settler.isSettling() && frame === 0) {
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        seen = anchorAt(slot);
      });
    }

    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, SAVE_DELAY_MS);
  };

  const reflowed = (): void => {
    settler.returnTo(seen);
  };

  slot.scrollTop = 0;
  settler.returnTo(seen);
  slot.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pagehide", save);
  const unwatchWidth = onWidthChange(slot, reflowed);

  const unwatchImages = onImageSettled(slot, reflowed);

  return {
    reflowed,
    stop: () => {
      settler.stop();
      window.clearTimeout(saveTimer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pagehide", save);
      slot.removeEventListener("scroll", onScroll);
      unwatchImages();
      unwatchWidth();
      keepPlace(itemId, anchorAt(slot));
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

  useLayoutEffect(() => {
    const element = slot.current;

    if (!ready || element === null) return noWatch;

    const opened = watchPlace(element, itemId);
    watch.current = opened;

    return () => {
      opened.stop();
      watch.current = null;
    };
  }, [slot, itemId, ready]);

  useLayoutEffect(() => {
    if (lastLook.current !== lookKey) {
      lastLook.current = lookKey;
      watch.current?.reflowed();
    }
  }, [lookKey]);
}
