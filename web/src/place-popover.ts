export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Edges {
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

export function edgesOf(rects: readonly DOMRect[], whole: DOMRect): Edges {
  const shown = rects.filter(({ width, height }) => width > 0 && height > 0);

  return { first: shown[0] ?? whole, last: shown.at(-1) ?? whole };
}

export function visibleBox(element: Element): Box {
  const { clientWidth, clientHeight } = document.documentElement;
  let box: Box = { left: 0, top: 0, right: clientWidth, bottom: clientHeight };

  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);

    if (node.localName === "dialog" || overflowX !== "visible" || overflowY !== "visible") {
      box = intersect(box, node.getBoundingClientRect());
    }
  }

  const bar = element.closest(".reader")?.querySelector(".rd-bar");

  return bar === null || bar === undefined
    ? box
    : { ...box, top: Math.max(box.top, bar.getBoundingClientRect().bottom) };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

export function placePopover(popover: HTMLElement, edges: Edges, bounds: Box, below: boolean) {
  const { width, height } = popover.getBoundingClientRect();
  const { marginTop, marginBottom } = getComputedStyle(popover);
  const gapAbove = Number(marginBottom.replace(/px$/u, ""));
  const gapBelow = Number(marginTop.replace(/px$/u, ""));
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
