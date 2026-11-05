import { useRef } from "react";

import { useBands } from "./bands.ts";
import { useSettings } from "./use-settings.ts";

export function useRoot() {
  const ref = useRef<HTMLDivElement>(null);
  const bands = useBands(ref);
  const { attributes, ...look } = useSettings();

  return {
    ref,
    attributes: { ...attributes, "data-bp": bands.join(" ") },
    narrow: bands.includes("narrow"),
    ...look,
  };
}
