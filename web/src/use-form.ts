import {
  type ChangeEvent,
  type RefObject,
  type SubmitEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface FieldState {
  readonly value: string;
  readonly error: string | null;
  readonly ref: RefObject<HTMLInputElement | null>;
  readonly change: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly fail: (message: string | null) => void;
  readonly clear: () => void;
  readonly set: (value: string) => void;
}

export function useField(initialError: string | null = null, initialValue = ""): FieldState {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
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

  return { value, error, ref, change, fail, clear, set: setValue };
}

export function useFocusOnMount(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [enabled, ref]);
}

export function useAfter(armed: boolean | number, ms: number, run: () => void): void {
  useEffect(() => {
    const timer = armed === false || armed === 0 ? 0 : window.setTimeout(run, ms);

    return () => {
      window.clearTimeout(timer);
    };
  }, [armed, ms, run]);
}

export function useEscape(
  onEscape: () => void,
  within?: RefObject<HTMLElement | null>,
  active = true,
): void {
  useEffect(() => {
    const target = within === undefined ? document.documentElement : within.current;

    const onKeyDown = ({ key }: Readonly<{ key: string }>): void => {
      if (active && key === "Escape") {
        onEscape();
      }
    };

    target?.addEventListener("keydown", onKeyDown);

    return () => {
      target?.removeEventListener("keydown", onKeyDown);
    };
  }, [active, onEscape, within]);
}

export function useGuard(blocked = false) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const guard = useCallback(
    (task: () => Promise<void>) => {
      if (running.current || blocked) {
        return;
      }

      running.current = true;
      setBusy(true);
      void task().finally(() => {
        running.current = false;
        setBusy(false);
      });
    },
    [blocked],
  );

  return { busy, guard };
}

export function useSubmit(run: () => Promise<void>, blocked = false) {
  const { busy, guard } = useGuard(blocked);

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      guard(run);
    },
    [guard, run],
  );

  return { busy, onSubmit };
}
