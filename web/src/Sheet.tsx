import { type ReactNode, useCallback, useEffectEvent, useLayoutEffect, useRef } from "react";

import { Icon } from "./Icon.tsx";
import { watchDismissal } from "./panel-dom.ts";
import { NEXT_ITEM, PREVIOUS_ITEM } from "./reader-text.ts";

export interface SheetNav {
  readonly steps: Readonly<{ previous: boolean; next: boolean }>;
  readonly step: (direction: 1 | -1) => void;
  readonly close: () => void;
}

const SIDES = {
  previous: {
    direction: -1,
    className: "side-nav side-prev",
    name: PREVIOUS_ITEM,
    keys: "ArrowLeft k",
    icon: "left",
  },
  next: {
    direction: 1,
    className: "side-nav side-next",
    name: NEXT_ITEM,
    keys: "ArrowRight j",
    icon: "right",
  },
} as const;

function SideButton({
  side,
  enabled,
  step,
}: Readonly<{
  side: keyof typeof SIDES;
  enabled: boolean;
  step: (direction: 1 | -1) => void;
}>) {
  const { direction, className, name, keys, icon } = SIDES[side];

  const go = useCallback(() => {
    step(direction);
  }, [direction, step]);

  return (
    <button
      type="button"
      className={className}
      aria-label={name}
      title={name}
      aria-keyshortcuts={keys}
      disabled={!enabled}
      onClick={go}
    >
      <Icon name={icon} className="ic" />
    </button>
  );
}

const NOTHING = (): void => undefined;

function useModal(close: () => void) {
  const dialog = useRef<HTMLDialogElement>(null);

  const dismiss = useEffectEvent(() => {
    close();
  });

  useLayoutEffect(() => {
    const element = dialog.current;

    if (element === null) return NOTHING;

    const listeners = new AbortController();
    element.showModal();
    watchDismissal(element, dismiss, listeners.signal);

    return () => {
      listeners.abort();
      element.close();
    };
  }, []);

  return dialog;
}

export function Sheet({
  titleId,
  nav,
  children,
}: Readonly<{ titleId: string; nav: SheetNav; children: ReactNode }>) {
  const dialog = useModal(nav.close);

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby={titleId}>
      {children}
      <SideButton side="previous" enabled={nav.steps.previous} step={nav.step} />
      <SideButton side="next" enabled={nav.steps.next} step={nav.step} />
    </dialog>
  );
}
