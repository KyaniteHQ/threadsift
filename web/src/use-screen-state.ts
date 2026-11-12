import { startTransition, useCallback, useState } from "react";

export function useScreenState<Value>(initial: Value | (() => Value)) {
  const [value, setValue] = useState(initial);

  const show = useCallback((next: Value) => {
    startTransition(() => {
      setValue(next);
    });
  }, []);

  return [value, show] as const;
}
