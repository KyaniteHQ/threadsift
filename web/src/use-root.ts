import { useRef } from "react";

import type { SettingKey, Settings } from "../../design/system/settings-table.ts";
import { useBands } from "./bands.ts";
import { FACE_WAIT_MS, LOOK_FONTS } from "./load-fonts.ts";
import { type ReaderPlace, readerPlaceOf } from "./reader-place.ts";
import { useFaces } from "./use-faces.ts";
import { useSettings } from "./use-settings.ts";

export interface Look {
  readonly faces: boolean;
  readonly releaseFaces: () => void;
  readonly phone: boolean;
  readonly narrow: boolean;
  readonly medium: boolean;
  readonly reader: ReaderPlace;
  readonly settings: Settings;
  readonly themeNote: string | null;
  readonly pick: (key: SettingKey, id: string) => void;
  readonly reset: () => void;
}

export function useRoot(onLayoutChange: () => void, initial: Settings) {
  const ref = useRef<HTMLDivElement>(null);
  const bands = useBands(ref);
  const { attributes, ...look } = useSettings(onLayoutChange, initial);
  const [faces, releaseFaces] = useFaces(ref, LOOK_FONTS, FACE_WAIT_MS);
  const narrow = bands.includes("narrow");

  return {
    ref,
    attributes: {
      ...attributes,
      "data-bp": bands.join(" "),
      "data-faces": faces ? "loaded" : "loading",
    },
    faces,
    releaseFaces,
    phone: bands.includes("phone"),
    narrow,
    medium: bands.includes("medium"),
    reader: readerPlaceOf(look.settings, narrow),
    ...look,
  };
}
