import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { NOTHING } from "../../src/core/nothing.ts";
import { type ShareArrival, arrivalOf } from "../../src/core/share-address.ts";

export interface ShareHandoff {
  readonly arrival: ShareArrival | null;
  readonly release: () => void;
}

export const ShareContext = createContext<ShareHandoff>({
  arrival: null,
  release: NOTHING,
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

export function useSharedArrival(ready: boolean, open: (id: number) => void) {
  const { arrival } = useContext(ShareContext);
  const shared = useRef(arrival?.kind === "saved" && arrival.refreshed ? arrival.id : null);

  useEffect(() => {
    if (!ready || shared.current === null) return;

    const id = shared.current;
    shared.current = null;
    open(id);
  }, [open, ready]);
}
