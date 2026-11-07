import type { RefObject } from "react";

export type PanelRefs = Readonly<{
  gear: RefObject<HTMLButtonElement | null>;
  panel: RefObject<HTMLDialogElement | null>;
}>;

function tabWrapTarget(panel: HTMLElement, backwards: boolean): HTMLElement | null {
  const stops = [...panel.querySelectorAll<HTMLElement>("button, select")];
  const [first, last] = [stops.at(0), stops.at(-1)];

  if (backwards && (document.activeElement === first || document.activeElement === panel)) {
    return last ?? null;
  }

  if (!backwards && document.activeElement === last) {
    return first ?? null;
  }

  return null;
}

function isOutside(refs: PanelRefs, target: EventTarget | null): boolean {
  return (
    target instanceof Node &&
    refs.panel.current?.contains(target) !== true &&
    refs.gear.current?.contains(target) !== true
  );
}

function isInside(
  panel: HTMLElement,
  point: Readonly<{ clientX: number; clientY: number }>,
): boolean {
  const box = panel.getBoundingClientRect();

  return (
    point.clientX >= box.left &&
    point.clientX <= box.right &&
    point.clientY >= box.top &&
    point.clientY <= box.bottom
  );
}

type Close = (refocusGear: boolean) => void;

export function watchPopover(refs: PanelRefs, close: Close, signal: AbortSignal): void {
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (isOutside(refs, event.target)) {
        close(false);
      }
    },
    { capture: true, signal },
  );

  document.addEventListener(
    "focusout",
    (event) => {
      if (isOutside(refs, event.relatedTarget)) {
        close(false);
      }
    },
    { signal },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    },
    { capture: true, signal },
  );
}

type Press = Readonly<Pick<MouseEvent, "target" | "clientX" | "clientY">>;

export function watchDismissal(
  dialog: HTMLElement,
  dismiss: () => void,
  signal: AbortSignal,
  outside: (press: Press) => boolean = (press) => press.target === dialog,
): void {
  let pressedOutside = false;

  dialog.addEventListener(
    "pointerdown",
    (event) => {
      pressedOutside = outside(event);
    },
    { signal },
  );

  dialog.addEventListener(
    "click",
    (event) => {
      if (pressedOutside && outside(event)) dismiss();

      pressedOutside = false;
    },
    { signal },
  );

  dialog.addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      dismiss();
    },
    { signal },
  );
}

export function watchSheet(refs: PanelRefs, close: Close, signal: AbortSignal): void {
  const panel = refs.panel.current;

  if (panel !== null) {
    watchDismissal(
      panel,
      () => {
        close(true);
      },
      signal,
      (press) => press.target === panel && !isInside(panel, press),
    );
  }

  document.addEventListener(
    "keydown",
    (event) => {
      const wrapTo =
        event.key === "Tab" && panel !== null ? tabWrapTarget(panel, event.shiftKey) : null;

      if (wrapTo !== null) {
        event.preventDefault();
        wrapTo.focus();
      }
    },
    { capture: true, signal },
  );
}
