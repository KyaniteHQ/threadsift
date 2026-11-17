import { useEffect } from "react";

import { POLL_MS } from "./poll-interval.ts";
import { useLatest } from "./use-latest.ts";

export function usePolling(active: boolean, poll: () => Promise<void>): void {
  const latest = useLatest(poll);

  useEffect(() => {
    let reading = false;

    const settled = (): void => {
      reading = false;
    };

    const timer = active
      ? window.setInterval(() => {
          if (reading) return;

          reading = true;

          void latest.current().then(settled, settled);
        }, POLL_MS)
      : null;

    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, [active, latest]);
}
