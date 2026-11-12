import {
  useCallback,
  useEffect,
  useEffectEvent,
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
import { facesOf } from "../../design/system/style-faces.ts";
import { useSettledAttributes } from "./look-faces.ts";
import { MATCH_SYSTEM_NOTES } from "./text.ts";

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storedSettings(): Settings {
  return readStored(readStorage());
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

function useStorageSync(
  settings: Readonly<Settings>,
  setSettings: (next: Settings) => void,
  onLayoutChange: () => void,
): void {
  const receive = useEffectEvent((text: string | null) => {
    const next = readStored(text);

    if (next.layout !== settings.layout) onLayoutChange();

    setSettings(next);
  });

  useEffect(() => {
    const listeners = new AbortController();

    addEventListener(
      "storage",
      (event) => {
        if (event.key === STORAGE_KEY || event.key === null) {
          receive(event.newValue);
        }
      },
      { signal: listeners.signal },
    );

    return () => {
      listeners.abort();
    };
  }, []);
}

export function useSettings(onLayoutChange: () => void, initial: Settings) {
  const [settings, setSettings] = useState(initial);
  const isDark = useSyncExternalStore(subscribeToDeviceScheme, deviceIsDark);
  const wanted = useMemo(() => rootAttributes(settings, isDark), [settings, isDark]);
  const attributes = useSettledAttributes(wanted, facesOf(settings));

  usePageAttributes(attributes);

  useStorageSync(settings, setSettings, onLayoutChange);

  const apply = useCallback((next: Settings) => {
    setSettings(next);
    writeStorage(serialize(next));
  }, []);

  const pick = useCallback(
    (key: SettingKey, id: string) => {
      const next = choose(settings, key, id);

      if (next.layout !== settings.layout) onLayoutChange();

      apply(next);
    },
    [apply, onLayoutChange, settings],
  );

  const reset = useCallback(() => {
    apply(resetLook(settings));
  }, [apply, settings]);

  const themeNote = followsDevice(THEME, settings.theme)
    ? MATCH_SYSTEM_NOTES[isDark ? "dark" : "light"]
    : null;

  return { settings, themeNote, attributes, pick, reset };
}
