import { startTransition, useCallback, useRef, useState } from "react";

export function useFlow<State, Event>(
  reduce: (state: State, event: Event) => State,
  initial: State,
  inTransition = false,
) {
  const [state, setState] = useState(initial);
  const latest = useRef(initial);

  const send = useCallback(
    (event: Event): boolean => {
      const next = reduce(latest.current, event);

      if (next === latest.current) return false;

      latest.current = next;

      if (inTransition) {
        startTransition(() => {
          setState(next);
        });
      } else setState(next);

      return true;
    },
    [inTransition, reduce],
  );

  return [state, send] as const;
}
