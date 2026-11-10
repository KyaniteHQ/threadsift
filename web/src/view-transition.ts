import { flushSync } from "react-dom";

import { REDUCED_MOTION } from "./jump-to-comments.ts";

const SOURCE = "vt-src";

function rowOf(app: Element, key: number): Element | null {
  return app.querySelector(`.it[data-key="${key}"]`);
}

function canAnimate(): boolean {
  return "startViewTransition" in document && !matchMedia(REDUCED_MOTION).matches;
}

export function changeView(
  app: Element | null,
  key: number,
  animated: boolean,
  change: () => void,
): void {
  if (app === null || !animated || !canAnimate()) {
    change();

    return;
  }

  const opening = app.querySelector(".reader-slot") === null;

  app.classList.add("vt");

  if (opening) rowOf(app, key)?.classList.add(SOURCE);

  const end = (): void => {
    app.classList.remove("vt");
    rowOf(app, key)?.classList.remove(SOURCE);
  };

  const transition = document.startViewTransition(() => {
    flushSync(change);

    if (!opening) rowOf(app, key)?.classList.add(SOURCE);
  });

  transition.ready.catch(end);
  void transition.finished.then(end, end);
}
