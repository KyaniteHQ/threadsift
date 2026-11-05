import {
  type ChangeEvent,
  type RefObject,
  type SubmitEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { WAIT, filled, waitLabel } from "./access-text.ts";

export interface FieldState {
  readonly value: string;
  readonly error: string | null;
  readonly ref: RefObject<HTMLInputElement | null>;
  readonly change: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly fail: (message: string | null) => void;
  readonly clear: () => void;
}

export function useField(initialError: string | null = null): FieldState {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(initialError);

  const change = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  }, []);

  const fail = useCallback((message: string | null) => {
    setError(message);

    if (message !== null) {
      ref.current?.focus();
    }
  }, []);

  const clear = useCallback(() => {
    setValue("");
  }, []);

  return { value, error, ref, change, fail, clear };
}

export function useFocusOnMount(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [enabled, ref]);
}

export function useSubmit(run: () => Promise<void>, blocked = false) {
  const [busy, setBusy] = useState(false);

  const guard = useCallback(
    (task: () => Promise<void>) => {
      if (busy || blocked) {
        return;
      }

      setBusy(true);
      void task().finally(() => {
        setBusy(false);
      });
    },
    [blocked, busy],
  );

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      guard(run);
    },
    [guard, run],
  );

  return { busy, onSubmit, guard };
}

const TICK_MS = 1000;

export function useLock() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  const ticking = now < until;

  useEffect(() => {
    const timer = ticking
      ? window.setInterval(() => {
          setNow(Date.now());
        }, TICK_MS)
      : 0;

    return () => {
      window.clearInterval(timer);
    };
  }, [ticking]);

  const start = useCallback((wait: number) => {
    const current = Date.now();
    setNow(current);
    setUntil(current + wait * TICK_MS);
  }, []);

  const dismiss = useCallback(() => {
    setUntil(0);
  }, []);

  const remaining = ticking ? Math.ceil((until - now) / TICK_MS) : 0;
  const over = until !== 0 && !ticking;
  const waiting = ticking ? filled(WAIT.message, { wait: waitLabel(remaining) }) : null;

  return { locked: ticking, message: waiting ?? (over ? WAIT.over : null), start, dismiss };
}
