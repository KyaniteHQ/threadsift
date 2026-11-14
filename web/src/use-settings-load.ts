import { type RefObject, useCallback, useEffect, useState } from "react";

import { READ_DEADLINE_MS } from "./calls.ts";
import { SECTION_FONTS, loadFonts } from "./load-fonts.ts";
import type { Loaded, SettingsLoad } from "./settings-load-types.ts";
import { readSettings } from "./settings-reads.ts";

export function useLoaded<View>(initial: Loaded<View>) {
  const [loaded, setLoaded] = useState(initial);

  const ready = useCallback((view: View) => {
    setLoaded({ kind: "ready", view });
  }, []);

  return { loaded, ready };
}

export function useSettingsLoad(page: RefObject<HTMLElement | null>): SettingsLoad | null {
  const [loaded, setLoaded] = useState<SettingsLoad | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const deadline = window.setTimeout(() => {
      controller.abort();
    }, READ_DEADLINE_MS);

    const load = async (): Promise<void> => {
      const { signal } = controller;

      const [reads] = await Promise.all([
        readSettings(signal),
        page.current === null ? undefined : loadFonts(page.current, SECTION_FONTS, signal),
      ]);

      window.clearTimeout(deadline);

      if (mounted) setLoaded(reads);
    };

    void load();

    return () => {
      mounted = false;
      window.clearTimeout(deadline);
      controller.abort();
    };
  }, [page]);

  return loaded;
}
