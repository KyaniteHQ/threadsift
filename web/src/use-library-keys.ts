import { useEffect, useEffectEvent } from "react";

const TYPING = "input, textarea, select, dialog.st-pop, dialog.dlg, [popover], [contenteditable]";
const POPOVER_OPEN = ":popover-open";
const SIDEWAYS = "pre, .tbl";

export interface KeyActions {
  readonly openId: number | null;
  readonly covered: boolean;
  readonly arrows: boolean;
  readonly step: (direction: 1 | -1) => void;
  readonly toggle: (id: number) => void;
  readonly close: () => void;
  readonly focusSearch: () => void;
}

function rowIdOf(target: Element | null): number | null {
  const key = target?.closest<HTMLElement>("article.it")?.dataset["key"];
  const id = Number(key);

  return key === undefined || Number.isNaN(id) ? null : id;
}

function inPasteBox(event: KeyboardEvent): boolean {
  return event.composedPath().some((node) => node instanceof Element && node.matches(".paste"));
}

function press(event: KeyboardEvent, target: Element | null, actions: KeyActions): void {
  const { key } = event;
  const scrollsSideways = (target?.closest(SIDEWAYS) ?? null) !== null;

  if (
    (key === "ArrowLeft" || key === "ArrowRight") &&
    actions.arrows &&
    actions.openId !== null &&
    !scrollsSideways
  ) {
    event.preventDefault();
    actions.step(key === "ArrowRight" ? 1 : -1);
  } else if (key === "j" || key === "k") {
    event.preventDefault();
    actions.step(key === "j" ? 1 : -1);
  } else if (key === "m" || key === "M") {
    const id = actions.covered ? actions.openId : (rowIdOf(target) ?? actions.openId);

    if (id !== null) {
      event.preventDefault();
      actions.toggle(id);
    }
  } else if (key === "/" && !actions.covered) {
    event.preventDefault();
    actions.focusSearch();
  } else if (
    key === "Escape" &&
    actions.openId !== null &&
    !inPasteBox(event) &&
    document.querySelector(POPOVER_OPEN) === null
  ) {
    event.preventDefault();
    actions.close();
  }
}

export function useLibraryKeys(actions: KeyActions): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const modified = event.metaKey || event.ctrlKey || event.altKey;

    if (!event.defaultPrevented && !modified && target?.closest(TYPING) === null) {
      press(event, target, actions);
    }
  });

  useEffect(() => {
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
