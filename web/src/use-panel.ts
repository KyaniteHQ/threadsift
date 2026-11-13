import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { NOTHING } from "./nothing.ts";
import { type PanelRefs, watchPopover, watchSheet } from "./panel-dom.ts";

const FIRST_CHOICE = '.st-body input[type="radio"]:checked';

type View = Readonly<{ open: boolean; refocusGear: boolean }>;

function useShownAs(open: boolean, modal: boolean, refs: PanelRefs) {
  const held = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const dialog = refs.panel.current;

    if (!open || dialog === null) {
      held.current = null;

      return NOTHING;
    }

    if (modal) {
      dialog.showModal();
    } else {
      dialog.show();
    }

    const back = held.current?.isConnected === true ? held.current : null;
    (back ?? dialog.querySelector<HTMLElement>(FIRST_CHOICE))?.focus();

    return () => {
      const focused = document.activeElement;
      held.current = focused instanceof HTMLElement && dialog.contains(focused) ? focused : null;
      dialog.close();
    };
  }, [open, modal, refs]);
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

export function usePanel(modal: boolean) {
  const [view, setView] = useState<View>({ open: false, refocusGear: false });
  const gear = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const refs = useMemo(() => ({ gear, panel }), [gear, panel]);

  const close = useCallback((refocusGear: boolean) => {
    setView({ open: false, refocusGear });
  }, []);

  useShownAs(view.open, modal, refs);
  useGearFocus(view, refs);
  useDismissal(view.open, modal, refs, close);

  const toggle = useCallback(() => {
    if (view.open) {
      close(true);
    } else {
      setView({ open: true, refocusGear: false });
    }
  }, [view.open, close]);

  const closeToGear = useCallback(() => {
    close(true);
  }, [close]);

  return { open: view.open, toggle, closeToGear, gear, panel };
}
