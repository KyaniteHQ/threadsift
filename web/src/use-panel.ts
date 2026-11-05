import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NOTHING, type PanelRefs, isolate, watchPanel } from "./panel-dom.ts";

const FIRST_CHOICE = '.st-body [aria-pressed="true"]';

type View = Readonly<{ open: boolean; refocusGear: boolean }>;

function useFocusFlow({ open, refocusGear }: View, refs: PanelRefs) {
  useEffect(() => {
    if (open) {
      (refs.panel.current?.querySelector<HTMLElement>(FIRST_CHOICE) ?? refs.panel.current)?.focus();
    } else if (refocusGear) {
      refs.gear.current?.focus();
    }
  }, [open, refocusGear, refs]);
}

function useModalIsolation(open: boolean, modal: boolean, refs: PanelRefs) {
  useEffect(
    () => (open && modal ? isolate(refs.panel.current, refs.backdrop.current) : NOTHING),
    [open, modal, refs],
  );
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
      watchPanel(refs, modal, close, listeners.signal);
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
  const backdrop = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => ({ gear, panel, backdrop }), [gear, panel, backdrop]);

  const close = useCallback((refocusGear: boolean) => {
    setView({ open: false, refocusGear });
  }, []);

  useFocusFlow(view, refs);
  useModalIsolation(view.open, modal, refs);
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

  return { open: view.open, toggle, closeToGear, gear, panel, backdrop };
}
