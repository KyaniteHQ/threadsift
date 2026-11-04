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
    pane.scrollTop -= top - box.top;
  } else if (box.bottom > paneBox.bottom) {
    pane.scrollTop += box.bottom - paneBox.bottom;
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
