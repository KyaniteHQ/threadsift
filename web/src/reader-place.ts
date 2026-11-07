import type { Settings } from "../../design/system/settings-table.ts";

export type ReaderPlace = "pane" | "page" | "sheet";

export function readerPlaceOf(settings: Readonly<Settings>, narrow: boolean): ReaderPlace {
  if (narrow) return "page";

  switch (settings.layout) {
    case "list":
      return "pane";
    case "grid":
      return settings.openAs;
    default: {
      const exhaustive: never = settings.layout;

      return exhaustive;
    }
  }
}
