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

export function useFocusOnMount(field: FieldState): void {
  const { ref } = field;

  useEffect(() => {
    ref.current?.focus();
  }, [ref]);
}

export function useSubmit(run: () => Promise<void>, blocked = false) {
  const [busy, setBusy] = useState(false);

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (busy || blocked) {
        return;
      }

      setBusy(true);
      void run().finally(() => {
        setBusy(false);
      });
    },
    [blocked, busy, run],
  );

  return { busy, onSubmit };
}

const TICK_MS = 1000;

export function useLock() {
  const [until, setUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const timer =
      until === 0
        ? 0
        : window.setInterval(() => {
            const left = Math.max(Math.ceil((until - Date.now()) / TICK_MS), 0);
            setRemaining(left);

            if (left === 0) {
              setUntil(0);
              setOver(true);
            }
          }, TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [until]);

  const start = useCallback((wait: number) => {
    setUntil(Date.now() + wait * TICK_MS);
    setRemaining(wait);
    setOver(false);
  }, []);

  const dismiss = useCallback(() => {
    setOver(false);
  }, []);

  const waiting = remaining > 0 ? filled(WAIT.message, { wait: waitLabel(remaining) }) : null;

  return { locked: remaining > 0, message: waiting ?? (over ? WAIT.over : null), start, dismiss };
}
