import { type RefObject, useEffect, useEffectEvent } from "react";

import type { Highlight } from "../../src/core/highlight-contract.ts";
import { scrollAndFocus } from "./jump-to-comments.ts";
import { arrivalPlace } from "./place.ts";

export function useHighlightArrival(
  items: readonly Highlight[],
  show: (highlight: Readonly<Highlight>) => void,
): void {
  const arrive = useEffectEvent(() => {
    const place = arrivalPlace();
    const highlight = place?.kind === "highlight" ? items.find(({ id }) => id === place.id) : null;

    if (highlight === null || highlight === undefined) return;

    if (highlight.status === "attached") {
      show(highlight);

      return;
    }

    const entry = document.querySelector<HTMLElement>(
      `.hl-entry[data-highlight="${highlight.id}"]`,
    );

    if (entry !== null) scrollAndFocus(entry, "center");
  });

  useEffect(() => {
    arrive();
  }, []);
}

export function useNoteArrival(field: RefObject<HTMLTextAreaElement | null>): void {
  const arrive = useEffectEvent(() => {
    if (arrivalPlace()?.kind === "note" && field.current !== null) {
      scrollAndFocus(field.current, "center");
    }
  });

  useEffect(() => {
    arrive();
  }, []);
}
