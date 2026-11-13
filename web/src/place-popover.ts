import { pixelsOf } from "./css-length.ts";

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface Edges {
  readonly first: Box;
  readonly last: Box;
}

function intersect(a: Box, b: Box): Box {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

interface Placement {
  readonly clipping: readonly Element[];
  readonly bar: Element | null;
  readonly below: boolean;
  readonly gapAbove: number;
  readonly gapBelow: number;
}

function clipsOf(element: Element): Element[] {
  const clipping: Element[] = [];

  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);

    if (node.localName === "dialog" || overflowX !== "visible" || overflowY !== "visible") {
      clipping.push(node);
    }
  }

  return clipping;
}

export function placementOf(popover: HTMLElement): Placement {
  const { marginTop, marginBottom } = getComputedStyle(popover);

  return {
    clipping: clipsOf(popover),
    bar: popover.closest(".reader")?.querySelector(".rd-bar") ?? null,
    below: matchMedia("(pointer: coarse)").matches,
    gapAbove: pixelsOf(marginBottom) ?? 0,
    gapBelow: pixelsOf(marginTop) ?? 0,
  };
}

function edgesOf(source: Range | Element): Edges {
  const shown = Array.from(source.getClientRects()).filter(
    ({ width, height }) => width > 0 && height > 0,
  );

  return {
    first: shown[0] ?? source.getBoundingClientRect(),
    last: shown.at(-1) ?? source.getBoundingClientRect(),
  };
}

function visibleBox({ clipping, bar }: Readonly<Placement>): Box {
  const { clientWidth, clientHeight } = document.documentElement;
  const whole: Box = { left: 0, top: 0, right: clientWidth, bottom: clientHeight };
  const box = clipping.reduce((now, node) => intersect(now, node.getBoundingClientRect()), whole);

  return bar === null
    ? box
    : { ...box, top: Math.max(box.top, bar.getBoundingClientRect().bottom) };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

export function placePopover(
  popover: HTMLElement,
  source: Range | Element,
  placement: Readonly<Placement>,
) {
  const { width, height } = popover.getBoundingClientRect();
  const { gapAbove, gapBelow, below } = placement;
  const edges = edgesOf(source);
  const bounds = visibleBox(placement);
  const topAbove = edges.first.top - gapAbove - height;
  const topBelow = edges.last.bottom + gapBelow;
  const fitsAbove = topAbove >= bounds.top;
  const fitsBelow = topBelow + height <= bounds.bottom;
  const useBelow = below ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
  const top = clamp(useBelow ? topBelow : topAbove, bounds.top, bounds.bottom - height);
  const edge = useBelow ? edges.last : edges.first;
  const left = clamp(edge.left, bounds.left, bounds.right - width);

  popover.style.top = `${top - gapBelow}px`;
  popover.style.left = `${left}px`;
}
