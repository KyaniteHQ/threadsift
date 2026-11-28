import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
  parseStored,
  readStored,
  resetLook,
  rootAttributes,
  serialize,
} from "../../design/system/settings.ts";
import { facesOf, loadFaces } from "../../design/system/style-faces.ts";
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

function storedChoice(): Settings | null {
  return parseStored(readStorage());
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
    const adoptStored = (): void => {
      const stored = storedChoice();

      if (stored !== null) adopt(stored);
    };

    const onStorage = ({
      key,
      newValue,
    }: Readonly<Pick<StorageEvent, "key" | "newValue">>): void => {
      const next = key === STORAGE_KEY ? parseStored(newValue) : null;

      if (next !== null) adopt(next);
    };

    const onPageShow = ({ persisted }: Readonly<Pick<PageTransitionEvent, "persisted">>): void => {
      if (persisted) adoptStored();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    adoptStored();

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [adopt]);
}

function useShownSettings(initial: Settings, onLayoutChange: () => void) {
  const [settings, setSettings] = useState(initial);
  const shown = useRef(initial);

  const adopt = useCallback(
    (next: Settings) => {
      if (serialize(next) === serialize(shown.current)) return;

      if (next.layout !== shown.current.layout) onLayoutChange();

      shown.current = next;
      setSettings(next);
    },
    [onLayoutChange],
  );

  const base = useCallback((): Settings => storedChoice() ?? shown.current, []);

  return { settings, adopt, base };
}

export function useSettings(onLayoutChange: () => void, initial: Settings) {
  const { settings, adopt, base } = useShownSettings(initial, onLayoutChange);
  const isDark = useSyncExternalStore(subscribeToDeviceScheme, deviceIsDark);
  const attributes = useMemo(() => rootAttributes(settings, isDark), [settings, isDark]);
  useEffect(() => {
    void loadFaces(facesOf(settings));
  }, [settings]);

  usePageAttributes(attributes);

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
      apply(choose(base(), key, id));
    },
    [apply, base],
  );

  const reset = useCallback(() => {
    apply(resetLook(base()));
  }, [apply, base]);

  const themeNote = followsDevice(THEME, settings.theme)
    ? MATCH_SYSTEM_NOTES[isDark ? "dark" : "light"]
    : null;

  return { settings, themeNote, attributes, pick, reset };
}
