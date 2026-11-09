import { useCallback, useLayoutEffect, useState } from "react";

import type { Highlight } from "../../src/core/highlight-contract.ts";
import { keyOf } from "./highlight-target.ts";
import type { Reveal } from "./highlights-context.ts";
import { scrollAndFocus } from "./jump-to-comments.ts";
import { useHighlightArrival } from "./place-arrival.ts";

export function useReveal(items: readonly Highlight[]) {
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const show = useCallback((highlight: Readonly<Highlight>): void => {
    setReveal({ id: highlight.id, key: keyOf(highlight.target) });
  }, []);

  useHighlightArrival(items, show);

  useLayoutEffect(() => {
    if (reveal === null) return;

    const mark = document.querySelector<HTMLElement>(`mark[data-highlights~="${reveal.id}"]`);

    if (mark !== null) scrollAndFocus(mark, "center");
  }, [reveal]);

  return { reveal, show };
}
