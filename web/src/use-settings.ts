import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

import {
  DARK_SCHEME,
  STORAGE_KEY,
  type SettingKey,
  type Settings,
  choose,
  readStored,
  resetLook,
  resolvedTheme,
  rootAttributes,
  serialize,
} from "../../design/system/settings.ts";

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(text: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, text);

    return true;
  } catch {
    return false;
  }
}

function subscribeToDeviceScheme(notify: () => void): () => void {
  const query = matchMedia(DARK_SCHEME);
  query.addEventListener("change", notify);

  return () => {
    query.removeEventListener("change", notify);
  };
}

function deviceIsDark(): boolean {
  return matchMedia(DARK_SCHEME).matches;
}

export function useSettings() {
  const [settings, setSettings] = useState(() => readStored(readStorage()));
  const isDark = useSyncExternalStore(subscribeToDeviceScheme, deviceIsDark);
  const theme = resolvedTheme(settings, isDark);

  useLayoutEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  useEffect(() => {
    const listeners = new AbortController();

    addEventListener(
      "storage",
      (event) => {
        if (event.key === STORAGE_KEY || event.key === null) {
          setSettings(readStored(event.newValue));
        }
      },
      { signal: listeners.signal },
    );

    return () => {
      listeners.abort();
    };
  }, []);

  const apply = useCallback((next: Settings) => {
    setSettings(next);
    writeStorage(serialize(next));
  }, []);

  const pick = useCallback(
    (key: SettingKey, id: string) => {
      apply(choose(settings, key, id));
    },
    [apply, settings],
  );

  const reset = useCallback(() => {
    apply(resetLook(settings));
  }, [apply, settings]);

  return { settings, isDark, attributes: rootAttributes(settings, isDark), pick, reset };
}
