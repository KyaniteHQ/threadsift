import { useEffect, useLayoutEffect, useRef } from "react";

export const MODEL_CONTROLS = ["model", "modelChoice"] as const;

export const EFFORT_CONTROLS = ["effort"] as const;

export function useFocusAcrossSwap(
  mode: string,
  names: readonly string[],
  controls: () => readonly (HTMLElement | null)[],
) {
  const lastFocused = useRef<string | null>(null);
  const shownMode = useRef(mode);

  useEffect(() => {
    const focused = () => {
      lastFocused.current = document.activeElement?.getAttribute("name") ?? null;
    };
    const leaving = ({
      target,
      relatedTarget,
    }: Readonly<{ target: unknown; relatedTarget: unknown }>) => {
      if (relatedTarget instanceof Element)
        lastFocused.current = relatedTarget.getAttribute("name");
      else
        queueMicrotask(() => {
          if (target instanceof Element && target.isConnected) lastFocused.current = null;
        });
    };

    document.addEventListener("focusin", focused, true);
    document.addEventListener("focusout", leaving, true);

    return () => {
      document.removeEventListener("focusin", focused, true);
      document.removeEventListener("focusout", leaving, true);
    };
  }, []);

  useLayoutEffect(() => {
    const swapped = shownMode.current !== mode;

    shownMode.current = mode;

    if (!swapped || document.activeElement !== document.body) return;

    const last = lastFocused.current;

    if (last === null || !names.includes(last)) return;

    const shown = controls().filter((control) => control !== null);
    const same = shown.find((control) => control.getAttribute("name") === last);

    (same ?? shown[0])?.focus();
  }, [mode, names, controls]);
}
