import { type RefObject, useEffectEvent, useLayoutEffect } from "react";

type Wire<Latest> = (dialog: HTMLElement, signal: AbortSignal, latest: () => Latest) => void;

export function useModalDialog<Latest>(
  dialog: RefObject<HTMLDialogElement | null>,
  latest: Latest,
  wire: Wire<Latest>,
): void {
  const readLatest = useEffectEvent(() => latest);
  const wireListeners = useEffectEvent(wire);

  useLayoutEffect(() => {
    const element = dialog.current;
    const listeners = new AbortController();

    if (element !== null) {
      element.showModal();
      wireListeners(element, listeners.signal, readLatest);
    }

    return () => {
      listeners.abort();
      element?.close();
    };
  }, [dialog]);
}
