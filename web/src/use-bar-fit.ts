import { type RefObject, useEffect, useLayoutEffect, useMemo } from "react";

import { type BarStep, fitBar } from "./bar-fit.ts";

type Steps = readonly [BarStep, ...BarStep[]];

function watchBar(bar: HTMLElement, refit: () => void): () => void {
  let width = bar.clientWidth;

  const observer = new ResizeObserver(() => {
    if (bar.clientWidth !== width) {
      width = bar.clientWidth;
      refit();
    }
  });

  observer.observe(bar);
  document.fonts.addEventListener("loadingdone", refit);
  void document.fonts.ready.then(refit);

  return () => {
    observer.disconnect();
    document.fonts.removeEventListener("loadingdone", refit);
  };
}

function fitWatch(
  bar: HTMLElement,
  steps: Steps,
  placed: (hintShown: boolean) => void,
): () => void {
  const refit = (): void => {
    placed(fitBar(bar, steps).hint && bar.querySelector(".rd-hint") !== null);
  };

  refit();

  return watchBar(bar, refit);
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
