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

export function useLock() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer =
      seconds > 0
        ? window.setTimeout(() => {
            setSeconds(0);
          }, seconds * 1000)
        : 0;

    return () => {
      window.clearTimeout(timer);
    };
  }, [seconds]);

  const start = useCallback((wait: number) => {
    setSeconds(wait);
  }, []);

  const message = seconds > 0 ? filled(WAIT.message, { wait: waitLabel(seconds) }) : null;

  return { locked: seconds > 0, message, start };
}
