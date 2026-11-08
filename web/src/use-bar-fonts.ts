import { type RefObject, useEffect, useState } from "react";

import { BAR_FONTS, loadFonts } from "./load-fonts.ts";

export const BAR_FONTS_MS = 3_000;

export function useBarFonts(root: RefObject<HTMLElement | null>): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const element = root.current;
    let mounted = true;

    const load = async (): Promise<void> => {
      if (element !== null) {
        await loadFonts(element, BAR_FONTS, AbortSignal.timeout(BAR_FONTS_MS));
      }

      if (mounted) setLoaded(true);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [root]);

  return loaded;
}
