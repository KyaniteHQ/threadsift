import { type RefObject, useEffect, useLayoutEffect, useMemo } from "react";

import { type BarStep, fitBar } from "./bar-fit.ts";

type Steps = readonly [BarStep, ...BarStep[]];

function watchBar(bar: HTMLElement, refit: () => void): () => void {
  const observer = new ResizeObserver(refit);
  let watching = true;

  const observeAgain = (): void => {
    if (watching) {
      observer.unobserve(bar);
      observer.observe(bar);
    }
  };

  observer.observe(bar);
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
  return watchBar(bar, () => {
    placed(fitBar(bar, steps).hint && bar.querySelector(".rd-hint") !== null);
  });
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

  useEffect(
    () => () => {
      placed(false);
    },
    [placed],
  );
}
