import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { THEME, type SettingKey, type Settings } from "../../design/system/settings-table.ts";
import {
  DARK_SCHEME,
  STORAGE_KEY,
  PAGE_SETTINGS,
  choose,
  followsDevice,
  readStored,
  resetLook,
  rootAttributes,
  serialize,
} from "../../design/system/settings.ts";
import { MATCH_SYSTEM_NOTES } from "./text.ts";

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {}
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

function usePageAttributes(attributes: Readonly<Record<string, string>>): void {
  useLayoutEffect(() => {
    for (const row of PAGE_SETTINGS) {
      const value = attributes[row.attribute];

      if (value !== undefined) {
        document.documentElement.setAttribute(row.attribute, value);
      }
    }
  }, [attributes]);
}

export function useSettings() {
  const [settings, setSettings] = useState(() => readStored(readStorage()));
  const isDark = useSyncExternalStore(subscribeToDeviceScheme, deviceIsDark);
  const attributes = useMemo(() => rootAttributes(settings, isDark), [settings, isDark]);

  usePageAttributes(attributes);

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

  const themeNote = followsDevice(THEME, settings.theme)
    ? MATCH_SYSTEM_NOTES[isDark ? "dark" : "light"]
    : null;

  return { settings, themeNote, attributes, pick, reset };
}
