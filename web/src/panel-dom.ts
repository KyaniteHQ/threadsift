import type { RefObject } from "react";

export type PanelRefs = Readonly<{
  gear: RefObject<HTMLButtonElement | null>;
  panel: RefObject<HTMLDialogElement | null>;
  backdrop: RefObject<HTMLDivElement | null>;
}>;

export const NOTHING = (): void => undefined;

export function isolate(modal: HTMLElement | null, spared: HTMLElement | null): () => void {
  const root = modal?.closest(".app");

  if (modal === null || spared === null || root === null || root === undefined) {
    return NOTHING;
  }

  const isolated: HTMLElement[] = [];

  for (let node = modal; node !== root && node.parentElement !== null; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (
        sibling instanceof HTMLElement &&
        sibling !== node &&
        sibling !== spared &&
        !sibling.inert
      ) {
        sibling.inert = true;
        isolated.push(sibling);
      }
    }
  }

  return () => {
    for (const element of isolated) {
      element.inert = false;
    }
  };
}

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

type Close = (refocusGear: boolean) => void;

function watchPointer(refs: PanelRefs, modal: boolean, close: Close, signal: AbortSignal): void {
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!modal && isOutside(refs, event.target)) {
        close(false);
      }
    },
    { capture: true, signal },
  );

  document.addEventListener(
    "click",
    (event) => {
      if (modal && event.target === refs.backdrop.current) {
        close(true);
      }
    },
    { signal },
  );

  document.addEventListener(
    "focusout",
    (event) => {
      if (!modal && isOutside(refs, event.relatedTarget)) {
        close(false);
      }
    },
    { signal },
  );
}

function watchKeys(refs: PanelRefs, modal: boolean, close: Close, signal: AbortSignal): void {
  document.addEventListener(
    "keydown",
    (event) => {
      const panel = refs.panel.current;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (modal && event.key === "Tab" && panel !== null) {
        const wrapTo = tabWrapTarget(panel, event.shiftKey);

        if (wrapTo !== null) {
          event.preventDefault();
          wrapTo.focus();
        }
      }
    },
    { capture: true, signal },
  );
}

export function watchPanel(
  refs: PanelRefs,
  modal: boolean,
  close: Close,
  signal: AbortSignal,
): void {
  watchPointer(refs, modal, close, signal);
  watchKeys(refs, modal, close, signal);
}
