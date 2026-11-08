import { type RefObject, useEffect, useState } from "react";

import { BAR_FONTS, loadFonts } from "./load-fonts.ts";
import { SETTINGS_READ_MS } from "./use-settings-load.ts";

export function useBarFaces(bar: RefObject<HTMLElement | null>): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const element = bar.current;
    const unmounted = new AbortController();

    const load = async (): Promise<void> => {
      if (element !== null) {
        await loadFonts(
          element,
          BAR_FONTS,
          AbortSignal.any([unmounted.signal, AbortSignal.timeout(SETTINGS_READ_MS)]),
        );
      }

      if (!unmounted.signal.aborted) setLoaded(true);
    };

    void load();

    return () => {
      unmounted.abort();
    };
  }, [bar]);

  return loaded;
}
