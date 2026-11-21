import { useCallback, useState } from "react";

import type { Loaded, SettingsLoad } from "./settings-load-types.ts";
import { readSettings } from "./settings-reads.ts";
import { useRead } from "./use-read.ts";

export function useLoaded<View>(initial: Loaded<View>) {
  const [loaded, setLoaded] = useState(initial);

  const ready = useCallback((view: View) => {
    setLoaded({ kind: "ready", view });
  }, []);

  return { loaded, ready };
}

export function useSettingsLoad(): SettingsLoad | null {
  return useRead<SettingsLoad | null>(readSettings, null, null);
}
