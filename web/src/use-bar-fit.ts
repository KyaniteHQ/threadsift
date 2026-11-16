import { type RefObject, useLayoutEffect, useMemo } from "react";
import { flushSync } from "react-dom";

import { type BarStep, fitBar } from "./bar-fit.ts";

type Steps = readonly [BarStep, ...BarStep[]];

function watchBar(bar: HTMLElement, refit: (observed: boolean) => void): () => void {
  const observer = new ResizeObserver(() => {
    refit(true);
  });

  let watching = true;

  const observeAgain = (): void => {
    if (watching) {
      observer.unobserve(bar);
      observer.observe(bar);
    }
  };

  observer.observe(bar);
  refit(false);
  document.fonts.addEventListener("loadingdone", observeAgain);
  void document.fonts.ready.then(observeAgain);

  return () => {
    watching = false;
    observer.disconnect();
    document.fonts.removeEventListener("loadingdone", observeAgain);
  };
}

function fitWatch(
  bar: HTMLElement,
  steps: Steps,
  placed: (hintShown: boolean) => void,
): () => void {
  const unwatch = watchBar(bar, (observed) => {
    const shown = fitBar(bar, steps).hint && bar.querySelector(".rd-hint") !== null;

    if (observed) {
      flushSync(() => {
        placed(shown);
      });
    } else {
      placed(shown);
    }
  });

  return () => {
    unwatch();
    placed(false);
  };
}

export function useBarFit(
  bar: RefObject<HTMLElement | null>,
  steps: Steps,
  signature: string,
  placed: (hintShown: boolean) => void,
): void {
  const fit = useMemo(() => ({ steps, signature }), [steps, signature]);

  useLayoutEffect(
    () => (bar.current === null ? undefined : fitWatch(bar.current, fit.steps, placed)),
    [bar, fit, placed],
  );
}
