function scrollingPane(element: HTMLElement): HTMLElement | null {
  for (let parent: HTMLElement | null = element; parent !== null; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);

    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
  }

  return null;
}

export function revealInPane(element: HTMLElement): void {
  const pane = scrollingPane(element);

  if (pane === null) {
    return;
  }

  const paneBox = pane.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const inset = Number(getComputedStyle(pane).scrollPaddingTop.replace(/px$/u, ""));
  const top = paneBox.top + (Number.isNaN(inset) ? 0 : inset);

  if (box.top < top) {
    pane.scrollTop -= Math.ceil(top - box.top);
  } else if (box.bottom > paneBox.bottom) {
    pane.scrollTop += Math.ceil(box.bottom - paneBox.bottom);
  }
}

export function scrollToTop(element: HTMLElement): void {
  const pane = scrollingPane(element);

  if (pane !== null) {
    pane.scrollTop = 0;
  }
}

export function focusListStart(pane: HTMLElement): void {
  const start = pane.querySelector<HTMLElement>(".it-open, .noresults button");

  (start ?? pane).focus();
}

export interface Cards {
  readonly links: string;
  readonly row: string;
  readonly link: string;
}

const LIBRARY_CARDS: Cards = { links: ".list .it-open", row: "article.it", link: ".it-open" };

export function focusNeighbour(
  scope: Element | null,
  direction: 1 | -1,
  { links, row, link }: Readonly<Cards>,
): boolean {
  const all = [...(scope?.querySelectorAll<HTMLElement>(links) ?? [])];
  const focused = document.activeElement?.closest(row)?.querySelector(link);
  const at = all.findIndex((each) => each === focused);
  const next = at < 0 ? (direction > 0 ? all.at(0) : all.at(-1)) : all[at + direction];

  next?.focus();

  return next !== undefined;
}

export function focusNeighbourCard(scope: Element | null, direction: 1 | -1): boolean {
  return focusNeighbour(scope, direction, LIBRARY_CARDS);
}
