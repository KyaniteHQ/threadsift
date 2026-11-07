import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { type ShareArrival, arrivalOf } from "../../src/core/share-address.ts";

export interface ShareHandoff {
  readonly arrival: ShareArrival | null;
  readonly release: () => void;
}

export const ShareContext = createContext<ShareHandoff>({
  arrival: null,
  release: () => {},
});

export function useShareHandoff(): ShareHandoff {
  const [arrival, setArrival] = useState(() => arrivalOf(window.location.search));

  useEffect(() => {
    if (arrival !== null) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [arrival]);

  const release = useCallback(() => {
    setArrival(null);
  }, []);

  return useMemo(() => ({ arrival, release }), [arrival, release]);
}
