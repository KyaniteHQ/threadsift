import { pixelsOf } from "./css-length.ts";
import { scrolls } from "./reveal.ts";

interface Box {
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
  let outermost: Element | null = null;

  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);

    if (overflowX !== "visible" || overflowY !== "visible") outermost = node;

    if (node.localName === "dialog" || scrolls(overflowX) || scrolls(overflowY)) {
      clipping.push(node);
    }
  }

  return outermost === null || clipping.includes(outermost) ? clipping : [...clipping, outermost];
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

const ROUNDING_PX = 1;

function naturalHeight(popover: HTMLElement): number {
  const { height } = popover.getBoundingClientRect();
  const hidden = Array.from(popover.children, (child) =>
    Math.max(child.scrollHeight - child.clientHeight, 0),
  );

  return height + hidden.reduce((sum, each) => sum + each, 0);
}

export function placePopover(
  popover: HTMLElement,
  source: Range | Element,
  placement: Readonly<Placement>,
) {
  const { gapAbove, gapBelow, below } = placement;
  const edges = edgesOf(source);
  const bounds = visibleBox(placement);
  const roomAbove = edges.first.top - gapAbove - bounds.top;
  const roomBelow = bounds.bottom - edges.last.bottom - gapBelow;
  const natural = naturalHeight(popover);
  const fitsAbove = natural + ROUNDING_PX <= roomAbove;
  const fitsBelow = natural + ROUNDING_PX <= roomBelow;
  const fits = fitsAbove || fitsBelow;
  const useBelow = fits ? (below ? fitsBelow : !fitsAbove) : roomBelow > roomAbove;
  const room = fits ? bounds.bottom - bounds.top : Math.max(roomAbove, roomBelow);

  popover.style.setProperty("--pop-room", `${Math.max(room, 0)}px`);

  const { width, height } = popover.getBoundingClientRect();

  const top = clamp(
    useBelow ? edges.last.bottom + gapBelow : edges.first.top - gapAbove - height,
    bounds.top,
    bounds.bottom - height,
  );
  const edge = useBelow ? edges.last : edges.first;
  const left = clamp(edge.left, bounds.left, bounds.right - width);

  popover.style.top = `${top - gapBelow}px`;
  popover.style.left = `${left}px`;
}
