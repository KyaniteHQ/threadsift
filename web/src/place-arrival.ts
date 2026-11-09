import { type RefObject, createContext, use, useEffect, useEffectEvent, useState } from "react";

import type { Highlight } from "../../src/core/highlight-contract.ts";
import { scrollAndFocus } from "./jump-to-comments.ts";
import { type Place, arrivalPlace } from "./place.ts";

export interface Arrivals {
  readonly take: (kind: Place["kind"]) => Place | null;
  readonly pending: () => boolean;
}

function keyOf(kind: Place["kind"]): string {
  return `${kind}:${window.location.pathname}${window.location.search}`;
}

function newArrivals(): Arrivals {
  const taken = new Set<string>();

  return {
    take: (kind) => {
      const place = arrivalPlace();

      if (place?.kind !== kind || taken.has(keyOf(kind))) return null;

      taken.add(keyOf(kind));

      return place;
    },
    pending: () => {
      const place = arrivalPlace();

      return place !== null && !taken.has(keyOf(place.kind));
    },
  };
}

export const ArrivalsContext = createContext<Arrivals | null>(null);

export function useNewArrivals(): Arrivals {
  return useState(newArrivals)[0];
}

export function useArrivals(): Arrivals {
  const arrivals = use(ArrivalsContext);

  if (arrivals === null) throw new Error("useArrivals needs the ArrivalsContext of a ReaderPane");

  return arrivals;
}

export function useHighlightArrival(
  items: readonly Highlight[],
  show: (highlight: Readonly<Highlight>) => void,
): void {
  const { take } = useArrivals();

  const arrive = useEffectEvent(() => {
    const place = take("highlight");
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
  const { take } = useArrivals();

  const arrive = useEffectEvent(() => {
    if (take("note") !== null && field.current !== null) {
      scrollAndFocus(field.current, "center");
    }
  });

  useEffect(() => {
    arrive();
  }, []);
}
