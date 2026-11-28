import { type RefObject, useLayoutEffect, useMemo, useState } from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";
import { pixelsOf } from "./css-length.ts";
import { watchBar } from "./use-bar-fit.ts";

const SHORT = "short";

interface Crowded {
  readonly signature: string;
  readonly needs: number;
}

function overflows(bar: HTMLElement): boolean {
  return bar.scrollWidth > bar.clientWidth;
}

function inRem(bar: HTMLElement, width: number): number {
  const rem = pixelsOf(getComputedStyle(bar.ownerDocument.documentElement).fontSize) ?? 1;

  return width / rem;
}

function fitRow(bar: HTMLElement): boolean {
  bar.classList.remove(SHORT);
  bar.classList.toggle(SHORT, overflows(bar));

  return overflows(bar);
}

export function useRowFit(
  bar: RefObject<HTMLElement | null>,
  watching: boolean,
  signature: string,
): boolean {
  const [crowded, setCrowded] = useState<Crowded | null>(null);
  const needs = crowded?.signature === signature ? crowded.needs : null;
  const fit = useMemo(() => ({ watching, signature, needs }), [watching, signature, needs]);

  useLayoutEffect(() => {
    const element = bar.current;

    if (element === null || !fit.watching) return NOTHING;

    const refit = () => {
      if (fit.needs !== null) {
        if (inRem(element, element.clientWidth) >= fit.needs) setCrowded(null);
      } else if (fitRow(element)) {
        setCrowded({ signature: fit.signature, needs: inRem(element, element.scrollWidth) });
      }
    };
    const unwatch = watchBar(element, refit);
    const parts = new ResizeObserver(refit);

    for (const part of element.children) parts.observe(part);

    return () => {
      unwatch();
      parts.disconnect();
      element.classList.remove(SHORT);
    };
  }, [bar, fit]);

  return watching && needs !== null;
}
