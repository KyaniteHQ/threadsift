import { type RefObject, useEffect, useState } from "react";

import { loadFonts } from "./load-fonts.ts";

export function useFaces(
  root: RefObject<HTMLElement | null>,
  variables: readonly string[],
  waitMs: number,
): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const element = root.current;
    const unmounted = new AbortController();

    const load = async (): Promise<void> => {
      if (element !== null) {
        await loadFonts(
          element,
          variables,
          AbortSignal.any([unmounted.signal, AbortSignal.timeout(waitMs)]),
        );
      }

      if (!unmounted.signal.aborted) setLoaded(true);
    };

    void load();

    return () => {
      unmounted.abort();
    };
  }, [root, variables, waitMs]);

  return loaded;
}
