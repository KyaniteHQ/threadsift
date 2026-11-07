import { useRef } from "react";

import type { SettingKey, Settings } from "../../design/system/settings-table.ts";
import { useBands } from "./bands.ts";
import { type ReaderPlace, readerPlaceOf } from "./reader-place.ts";
import { useSettings } from "./use-settings.ts";

export interface Look {
  readonly phone: boolean;
  readonly narrow: boolean;
  readonly medium: boolean;
  readonly reader: ReaderPlace;
  readonly settings: Settings;
  readonly themeNote: string | null;
  readonly pick: (key: SettingKey, id: string) => void;
  readonly reset: () => void;
}

export function useRoot() {
  const ref = useRef<HTMLDivElement>(null);
  const bands = useBands(ref);
  const { attributes, ...look } = useSettings();
  const narrow = bands.includes("narrow");

  return {
    ref,
    attributes: { ...attributes, "data-bp": bands.join(" ") },
    phone: bands.includes("phone"),
    narrow,
    medium: bands.includes("medium"),
    reader: readerPlaceOf(look.settings, narrow),
    ...look,
  };
}
