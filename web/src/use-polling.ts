import { useEffect } from "react";

import { useLatest } from "./use-latest.ts";

export const POLL_MS = 3000;

export function usePolling(active: boolean, poll: () => Promise<void>): void {
  const latest = useLatest(poll);

  useEffect(() => {
    let reading = false;

    const timer = active
      ? window.setInterval(() => {
          if (reading) return;

          reading = true;

          void latest.current().finally(() => {
            reading = false;
          });
        }, POLL_MS)
      : null;

    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, [active, latest]);
}
