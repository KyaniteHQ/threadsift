import { useCallback, useEffect, useState } from "react";

import type { ShareArrival } from "../../src/core/share-address.ts";
import type { Item } from "../../src/http/schemas.ts";
import type { Shown } from "./PasteCard.tsx";
import type { ShareHandoff } from "./share-handoff.ts";

type SavedArrival = Extract<ShareArrival, { readonly kind: "saved" }>;

interface Prefilled {
  readonly value: string;
  readonly shown: Shown | null;
}

function prefilledBy(arrival: Readonly<ShareArrival> | null): Prefilled {
  if (arrival?.kind !== "prefill") {
    return { value: "", shown: null };
  }

  const { value, notice } = arrival;

  return {
    value,
    shown: notice === null ? null : { kind: "notice", key: notice, url: value, seq: 0 },
  };
}

function sharedCard(arrival: SavedArrival | null, items: readonly Item[]): Shown | null {
  const item = arrival === null ? undefined : items.find((each) => each.id === arrival.id);

  return arrival === null || item === undefined
    ? null
    : {
        kind: "item",
        itemId: item.id,
        refreshed: arrival.refreshed,
        url: item.originalUrl,
        seq: 0,
      };
}

export function useShownCard({ arrival, release }: Readonly<ShareHandoff>, items: readonly Item[]) {
  const [prefilled] = useState(() => prefilledBy(arrival));
  const [saved, setSaved] = useState(() => (arrival?.kind === "saved" ? arrival : null));
  const [own, setOwn] = useState(prefilled.shown);

  useEffect(() => {
    if (arrival?.kind === "saved") {
      release();
    }
  }, [arrival, release]);

  const show = useCallback((next: Shown | null) => {
    setSaved(null);
    setOwn(next);
  }, []);

  return { shown: own ?? sharedCard(saved, items), show, prefill: prefilled.value };
}
