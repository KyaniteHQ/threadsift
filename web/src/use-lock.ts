import { useCallback, useEffect, useState } from "react";

import { SECOND_MS } from "../../src/core/contract/time-units.ts";
import { WAIT, waitLabel } from "./access-text.ts";
import { filled } from "./filled.ts";

export function useLock() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  const ticking = now < until;

  useEffect(() => {
    const timer = ticking
      ? window.setInterval(() => {
          setNow(Date.now());
        }, SECOND_MS)
      : 0;

    return () => {
      window.clearInterval(timer);
    };
  }, [ticking]);

  const start = useCallback((wait: number) => {
    const current = Date.now();
    setNow(current);
    setUntil(current + wait * SECOND_MS);
  }, []);

  const dismiss = useCallback(() => {
    setUntil(0);
  }, []);

  const remaining = ticking ? Math.ceil((until - now) / SECOND_MS) : 0;
  const over = until !== 0 && !ticking;
  const waiting = ticking ? filled(WAIT.message, { wait: waitLabel(remaining) }) : null;

  return { locked: ticking, message: waiting ?? (over ? WAIT.over : null), start, dismiss };
}
