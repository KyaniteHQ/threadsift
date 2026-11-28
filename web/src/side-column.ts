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

export const SIDE_COLUMN_BESIDE = `.rd-col[data-side="${BESIDE}"] > .rd-side`;

const FIT_WIDTH = "--rd-fit";

export interface SideSlot {
  readonly node: HTMLElement | null;
  readonly beside: boolean;
  readonly listComments: (listed: boolean) => void;
}

function useSideBeside(col: RefObject<HTMLElement | null>, place: ReaderPlace): boolean {
  const [fits, setFits] = useState(false);

  useLayoutEffect(() => {
    const element = col.current;
    const slot = element?.closest<HTMLElement>(".reader-slot") ?? null;

    if (element === null || slot === null) return NOTHING;

    let watching = true;

    const measure = (): void => {
      if (!watching) return;

      const width = pixelsOf(getComputedStyle(element).getPropertyValue(FIT_WIDTH));
      setFits(width !== null && slot.clientWidth >= width);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    observer.observe(element);
    void document.fonts.ready.then(measure);

    return () => {
      watching = false;
      observer.disconnect();
    };
  }, [col]);

  return fits && place !== "sheet";
}

export interface SideColumn {
  readonly col: RefObject<HTMLDivElement | null>;
  readonly host: RefCallback<HTMLDivElement>;
  readonly side: SideSlot;
  readonly commentsListed: boolean;
}

export function useSideColumn(place: ReaderPlace): SideColumn {
  const col = useRef<HTMLDivElement>(null);
  const [node, host] = useState<HTMLDivElement | null>(null);
  const [listed, listComments] = useState(false);
  const beside = useSideBeside(col, place);
  const side = useMemo<SideSlot>(() => ({ node, beside, listComments }), [node, beside]);

  return { col, host, side, commentsListed: beside && listed };
}
