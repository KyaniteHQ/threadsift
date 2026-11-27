import { type RefObject, useLayoutEffect } from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";
import { watchBar } from "./use-bar-fit.ts";

const SHORT = "short";

function fitRow(bar: HTMLElement): void {
  bar.classList.remove(SHORT);
  bar.classList.toggle(SHORT, bar.scrollWidth > bar.clientWidth);
}

export function useRowFit(bar: RefObject<HTMLElement | null>, watching: boolean): void {
  useLayoutEffect(() => {
    const element = bar.current;

    if (element === null || !watching) return NOTHING;

    const unwatch = watchBar(element, () => {
      fitRow(element);
    });

    return () => {
      unwatch();
      element.classList.remove(SHORT);
    };
  }, [bar, watching]);
}
