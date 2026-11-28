import { useCallback, useState } from "react";

import type { Loaded, SettingsLoad } from "./settings-load-types.ts";
import { readSettings } from "./settings-reads.ts";
import { useRead } from "./use-read.ts";

export function useLoaded<View>(initial: Loaded<View>) {
  const [held, setHeld] = useState({ initial, loaded: initial });

  if (held.initial !== initial) setHeld({ initial, loaded: initial });

  const ready = useCallback(
    (view: View) => {
      setHeld({ initial, loaded: { kind: "ready", view } });
    },
    [initial],
  );

  return { loaded: held.initial === initial ? held.loaded : initial, ready };
}

export function useSettingsLoad(): SettingsLoad | null {
  return useRead<SettingsLoad | null>(readSettings, null, null);
}
