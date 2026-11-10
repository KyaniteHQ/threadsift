export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function scrollAndFocus(element: HTMLElement, block: ScrollLogicalPosition): void {
  element.scrollIntoView({
    block,
    behavior: matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth",
  });
  element.focus({ preventScroll: true });
}

const awaiting = new WeakSet<Element>();

function headingIn(reader: Element): HTMLElement | null {
  return reader.querySelector<HTMLElement>(".rd-comments h3");
}

function isLoading(reader: Element): boolean {
  return reader.querySelector(".rd-loading") !== null;
}

function jumpWhenRendered(reader: Element): void {
  if (awaiting.has(reader)) return;

  const focused = document.activeElement;

  awaiting.add(reader);

  const observer = new MutationObserver(() => {
    const heading = headingIn(reader);

    if (heading === null && isLoading(reader)) return;

    observer.disconnect();
    awaiting.delete(reader);

    if (heading !== null && document.activeElement === focused) scrollAndFocus(heading, "start");
  });

  observer.observe(reader, { childList: true, subtree: true });
}

export function jumpToComments(from: HTMLElement): void {
  const reader = from.closest(".reader");

  if (reader === null) return;

  const heading = headingIn(reader);

  if (heading !== null) scrollAndFocus(heading, "start");
  else if (isLoading(reader)) jumpWhenRendered(reader);
}
