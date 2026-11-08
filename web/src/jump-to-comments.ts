const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function jumpToComments(from: HTMLElement): void {
  const heading = from.closest(".reader")?.querySelector<HTMLElement>(".rd-comments h3");

  if (heading === null || heading === undefined) return;

  heading.scrollIntoView({
    block: "start",
    behavior: matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth",
  });
  heading.focus({ preventScroll: true });
}
