export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function scrollAndFocus(element: HTMLElement, block: ScrollLogicalPosition): void {
  element.scrollIntoView({
    block,
    behavior: matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth",
  });
  element.focus({ preventScroll: true });
}

export function jumpToComments(from: HTMLElement): void {
  const heading = from.closest(".reader")?.querySelector<HTMLElement>(".rd-comments h3");

  if (heading !== null && heading !== undefined) scrollAndFocus(heading, "start");
}
