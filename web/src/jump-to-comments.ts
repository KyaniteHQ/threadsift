export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function scrollAndFocus(element: HTMLElement, block: ScrollLogicalPosition): void {
  element.scrollIntoView({
    block,
    behavior: matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth",
  });
  element.focus({ preventScroll: true });
}

const pending = new WeakMap<Element, () => void>();

function headingIn(reader: Element): HTMLElement | null {
  return reader.querySelector<HTMLElement>(".rd-comments h3");
}

function isLoading(reader: Element): boolean {
  return reader.querySelector(".rd-loading") !== null;
}

function jumpWhenRendered(reader: Element): void {
  pending.get(reader)?.();

  const observer = new MutationObserver(() => {
    const heading = headingIn(reader);

    if (heading === null && isLoading(reader)) return;

    cancel();

    if (heading !== null) scrollAndFocus(heading, "start");
  });

  function cancel(): void {
    observer.disconnect();
    document.removeEventListener("focusin", cancel, true);
    pending.delete(reader);
  }

  pending.set(reader, cancel);
  document.addEventListener("focusin", cancel, true);
  observer.observe(reader, { childList: true, subtree: true });
}

export function jumpToComments(from: HTMLElement): void {
  const reader = from.closest(".reader");

  if (reader === null) return;

  const heading = headingIn(reader);

  if (heading !== null) scrollAndFocus(heading, "start");
  else if (isLoading(reader)) jumpWhenRendered(reader);
}
