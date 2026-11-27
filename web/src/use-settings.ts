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
import { facesOf, loadFaces } from "../../design/system/style-faces.ts";
import { MATCH_SYSTEM_NOTES } from "./text.ts";
import { useLatest } from "./use-latest.ts";

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

function useStoredElsewhere(adopt: (next: Settings) => void): void {
  useEffect(() => {
    const onStorage = ({ key }: Readonly<Pick<StorageEvent, "key">>): void => {
      if (key === STORAGE_KEY || key === null) adopt(storedSettings());
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [adopt]);
}

export function useSettings(onLayoutChange: () => void, initial: Settings) {
  const [settings, setSettings] = useState(initial);
  const isDark = useSyncExternalStore(subscribeToDeviceScheme, deviceIsDark);
  const attributes = useMemo(() => rootAttributes(settings, isDark), [settings, isDark]);
  useEffect(() => {
    void loadFaces(facesOf(settings));
  }, [settings]);

  usePageAttributes(attributes);

  const latest = useLatest(settings);

  const adopt = useCallback(
    (next: Settings) => {
      if (next.layout !== latest.current.layout) onLayoutChange();

      setSettings(next);
    },
    [latest, onLayoutChange],
  );

  useStoredElsewhere(adopt);

  const apply = useCallback(
    (next: Settings) => {
      adopt(next);
      writeStorage(serialize(next));
    },
    [adopt],
  );

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
