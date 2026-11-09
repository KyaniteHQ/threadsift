import { type RefObject, useCallback, useEffect, useState } from "react";

import { BASE_SAMPLE, loadFonts } from "./load-fonts.ts";

export function useFaces(
  root: RefObject<HTMLElement | null>,
  variables: readonly string[],
  waitMs: number,
  sample: string | null = BASE_SAMPLE,
): readonly [boolean, () => void] {
  const [loaded, setLoaded] = useState(false);
  const [deadline] = useState(() => AbortSignal.timeout(waitMs));

  useEffect(() => {
    const element = root.current;
    const unmounted = new AbortController();

    const load = async (): Promise<void> => {
      if (element !== null) {
        await loadFonts(
          element,
          variables,
          AbortSignal.any([unmounted.signal, deadline]),
          sample ?? BASE_SAMPLE,
        );
      }

      if (sample !== null && !unmounted.signal.aborted) setLoaded(true);
    };

    void load();

    return () => {
      unmounted.abort();
    };
  }, [root, variables, sample, deadline]);

  const release = useCallback(() => {
    setLoaded(true);
  }, []);

  return [loaded, release];
}
