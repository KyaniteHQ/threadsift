import {
  type RefCallback,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { NOTHING } from "../../src/core/contract/nothing.ts";
import { pixelsOf } from "./css-length.ts";
import type { ReaderPlace } from "./reader-place.ts";

export const BESIDE = "beside";

export const BESIDE_MARGIN = `.rd-col[data-margin="${BESIDE}"] > .rd-margin`;

export interface MarginSlot {
  readonly node: HTMLElement | null;
  readonly beside: boolean;
}

function widthBeside(col: HTMLElement): number | null {
  const margin = col.querySelector<HTMLElement>(":scope > .rd-margin");

  return margin === null ? null : pixelsOf(getComputedStyle(margin).maxWidth);
}

function useMarginBeside(col: RefObject<HTMLElement | null>, place: ReaderPlace): boolean {
  const [fits, setFits] = useState(false);

  useLayoutEffect(() => {
    const element = col.current;
    const slot = element?.closest<HTMLElement>(".reader-slot") ?? null;

    if (element === null || slot === null) return NOTHING;

    const measure = (): void => {
      const width = widthBeside(element);
      setFits(width !== null && slot.clientWidth >= width);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    observer.observe(element);
    void document.fonts.ready.then(measure);

    return () => {
      observer.disconnect();
    };
  }, [col]);

  return fits && place !== "sheet";
}

export interface MarginColumn {
  readonly col: RefObject<HTMLDivElement | null>;
  readonly host: RefCallback<HTMLDivElement>;
  readonly margin: MarginSlot;
}

export function useMarginColumn(place: ReaderPlace): MarginColumn {
  const col = useRef<HTMLDivElement>(null);
  const [node, host] = useState<HTMLDivElement | null>(null);
  const beside = useMarginBeside(col, place);
  const margin = useMemo<MarginSlot>(() => ({ node, beside }), [node, beside]);

  return { col, host, margin };
}
