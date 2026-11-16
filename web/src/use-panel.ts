import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { NOTHING } from "./nothing.ts";
import { type PanelRefs, watchPopover, watchSheet } from "./panel-dom.ts";

const FIRST_CHOICE = '.st-body input[type="radio"]:checked';

const KEYED = "[data-focus-key]";

const BODY = ".st-body";

type View = Readonly<{ open: boolean; refocusGear: boolean }>;

const CLOSED: View = { open: false, refocusGear: false };

interface Carry {
  readonly focusKey: string | null;
  readonly scrollTop: number;
}

const NO_CARRY: Carry = { focusKey: null, scrollTop: 0 };

interface CarryStore {
  readonly read: () => Carry;
  readonly write: (carry: Carry) => void;
}

function newCarryStore(): CarryStore {
  let held = NO_CARRY;

  return {
    read: () => held,
    write: (carry) => {
      held = carry;
    },
  };
}

export interface PanelState {
  readonly view: View;
  readonly setView: (view: View) => void;
  readonly carry: CarryStore;
}

export function usePanelState(): PanelState {
  const [view, setView] = useState<View>(CLOSED);
  const [carry] = useState(newCarryStore);

  return { view, setView, carry };
}

type Owned = Readonly<{ owner: string | null; view: View; carry: CarryStore }>;

function freshOwned(owner: string | null): Owned {
  return { owner, view: CLOSED, carry: newCarryStore() };
}

export function useHeldPanelState(owner: string | null): PanelState {
  const [owned, setOwned] = useState<Owned>(() => freshOwned(owner));

  if (owned.owner !== owner) setOwned(freshOwned(owner));

  const setView = useCallback((view: View) => {
    setOwned((now) => ({ ...now, view }));
  }, []);

  return owned.owner === owner
    ? { view: owned.view, setView, carry: owned.carry }
    : { view: CLOSED, setView, carry: owned.carry };
}

function keyOf(element: Element | null): string | null {
  return element?.closest<HTMLElement>(KEYED)?.dataset["focusKey"] ?? null;
}

function followInto(dialog: HTMLElement, carry: CarryStore, signal: AbortSignal): void {
  dialog.addEventListener(
    "focusin",
    () => {
      carry.write({ ...carry.read(), focusKey: keyOf(document.activeElement) });
    },
    { signal },
  );

  dialog.querySelector(BODY)?.addEventListener(
    "scroll",
    (event) => {
      const { currentTarget } = event;

      if (currentTarget instanceof Element) {
        carry.write({ ...carry.read(), scrollTop: currentTarget.scrollTop });
      }
    },
    { signal },
  );
}

function restoreInto(dialog: HTMLElement, { focusKey, scrollTop }: Readonly<Carry>): void {
  const body = dialog.querySelector(BODY);

  if (body !== null) body.scrollTop = scrollTop;

  const keyed = [...dialog.querySelectorAll<HTMLElement>(KEYED)].find(
    (each) => each.dataset["focusKey"] === focusKey,
  );

  (keyed ?? dialog.querySelector<HTMLElement>(FIRST_CHOICE))?.focus({ preventScroll: true });
}

function useShownAs(open: boolean, modal: boolean, refs: PanelRefs, carry: CarryStore) {
  useLayoutEffect(() => {
    const dialog = refs.panel.current;

    if (!open || dialog === null) {
      carry.write(NO_CARRY);

      return NOTHING;
    }

    const listeners = new AbortController();

    if (modal) {
      dialog.showModal();
    } else {
      dialog.show();
    }

    queueMicrotask(() => {
      if (listeners.signal.aborted) return;

      restoreInto(dialog, carry.read());
      followInto(dialog, carry, listeners.signal);
    });

    return () => {
      listeners.abort();
      dialog.close();
    };
  }, [open, modal, refs, carry]);
}

function useGearFocus({ open, refocusGear }: View, refs: PanelRefs) {
  useEffect(() => {
    if (!open && refocusGear) {
      refs.gear.current?.focus();
    }
  }, [open, refocusGear, refs]);
}

function useDismissal(
  open: boolean,
  modal: boolean,
  refs: PanelRefs,
  close: (refocusGear: boolean) => void,
) {
  useEffect(() => {
    const listeners = new AbortController();

    if (open) {
      (modal ? watchSheet : watchPopover)(refs, close, listeners.signal);
    }

    return () => {
      listeners.abort();
    };
  }, [open, modal, refs, close]);
}

export function usePanel(modal: boolean, { view, setView, carry }: Readonly<PanelState>) {
  const gear = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const refs = useMemo(() => ({ gear, panel }), [gear, panel]);

  const close = useCallback(
    (refocusGear: boolean) => {
      setView({ open: false, refocusGear });
    },
    [setView],
  );

  useShownAs(view.open, modal, refs, carry);
  useGearFocus(view, refs);
  useDismissal(view.open, modal, refs, close);

  const toggle = useCallback(() => {
    if (view.open) {
      close(true);
    } else {
      setView({ open: true, refocusGear: false });
    }
  }, [view.open, close, setView]);

  const closeToGear = useCallback(() => {
    close(true);
  }, [close]);

  return { open: view.open, toggle, closeToGear, gear, panel };
}
