import { type RefObject, useEffect } from "react";

const MORE_ROUNDING = 1;

function sideways(scroller: HTMLElement) {
  const { scrollLeft, clientWidth, scrollWidth } = scroller;

  return {
    wide: scrollWidth > clientWidth + MORE_ROUNDING,
    before: scrollLeft > MORE_ROUNDING,
    more: scrollLeft + clientWidth < scrollWidth - MORE_ROUNDING,
  };
}

function makeFocusable(scroller: HTMLElement, wide: boolean): void {
  const { label, labelledby: labelledBy } = scroller.dataset;
  const naming = labelledBy === undefined ? "aria-label" : "aria-labelledby";
  const name = labelledBy ?? label;

  if (name === undefined) return;

  if (wide) {
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute(naming, name);
  } else {
    scroller.removeAttribute("tabindex");
    scroller.removeAttribute("role");
    scroller.removeAttribute(naming);
  }
}

function updateBox(box: HTMLElement): void {
  const scroller = box.querySelector<HTMLElement>(".sx");

  if (scroller !== null) {
    const { wide, before, more } = sideways(scroller);
    box.dataset["before"] = before ? "1" : "0";
    box.dataset["more"] = more ? "1" : "0";
    makeFocusable(scroller, wide);
  }
}

function watch(target: HTMLElement, update: () => void, observed: readonly Element[]): () => void {
  let frame = 0;

  const schedule = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    }
  };

  update();
  target.addEventListener("scroll", schedule, { capture: true, passive: true });
  const observer = new ResizeObserver(schedule);
  for (const element of observed) observer.observe(element);
  void document.fonts.ready.then(schedule);

  return () => {
    cancelAnimationFrame(frame);
    target.removeEventListener("scroll", schedule, { capture: true });
    observer.disconnect();
  };
}

export function watchFades(root: HTMLElement): () => void {
  return watch(root, () => {
    for (const box of root.querySelectorAll<HTMLElement>(".sxw")) updateBox(box);
  }, [root]);
}

function watchBox(box: HTMLElement): () => void {
  const scroller = box.querySelector<HTMLElement>(".sx");
  const content = scroller?.firstElementChild ?? null;

  return watch(box, () => {
    updateBox(box);
  }, [box, ...(content === null ? [] : [content])]);
}

export function useSidewaysFade(box: RefObject<HTMLElement | null>): void {
  useEffect(() => (box.current === null ? undefined : watchBox(box.current)), [box]);
}
