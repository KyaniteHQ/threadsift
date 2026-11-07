const MORE_ROUNDING = 1;

function sideways(scroller: HTMLElement) {
  const { scrollLeft, clientWidth, scrollWidth } = scroller;

  return {
    wide: scrollWidth > clientWidth + MORE_ROUNDING,
    more: scrollLeft + clientWidth < scrollWidth - MORE_ROUNDING,
  };
}

function makeFocusable(scroller: HTMLElement, wide: boolean): void {
  if (wide) {
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", scroller.dataset["label"] ?? "");
  } else {
    scroller.removeAttribute("tabindex");
    scroller.removeAttribute("role");
    scroller.removeAttribute("aria-label");
  }
}

function update(root: HTMLElement): void {
  for (const box of root.querySelectorAll<HTMLElement>(".sxw")) {
    const scroller = box.querySelector<HTMLElement>(".sx");

    if (scroller !== null) {
      const { wide, more } = sideways(scroller);
      box.dataset["more"] = more ? "1" : "0";
      makeFocusable(scroller, wide);
    }
  }
}

export function watchFades(root: HTMLElement): () => void {
  let frame = 0;

  const schedule = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        update(root);
      });
    }
  };

  update(root);
  root.addEventListener("scroll", schedule, { capture: true, passive: true });
  const observer = new ResizeObserver(schedule);
  observer.observe(root);
  void document.fonts.ready.then(schedule);

  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener("scroll", schedule, { capture: true });
    observer.disconnect();
  };
}
