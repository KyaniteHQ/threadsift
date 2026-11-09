import { createContext, use, useMemo, useState } from "react";

import type { Highlight, HighlightTarget } from "../../src/core/highlight-contract.ts";
import type { MarkSpan } from "./highlight-marks.ts";
import { spansFor } from "./highlight-target.ts";
import type { KeepDraft } from "./use-selection-draft.ts";

export type Panel =
  | { readonly kind: "keep"; readonly key: string; readonly draft: KeepDraft }
  | { readonly kind: "remove"; readonly key: string; readonly id: number; readonly mark: Element };

export interface Reveal {
  readonly id: number;
  readonly key: string;
}

export interface HighlightsApi {
  readonly items: readonly Highlight[];
  readonly panel: Panel | null;
  readonly failure: string | null;
  readonly reveal: Reveal | null;
  readonly keep: () => void;
  readonly remove: (id: number) => void;
  readonly dismiss: () => void;
  readonly show: (highlight: Readonly<Highlight>) => void;
}

export const HighlightsContext = createContext<HighlightsApi | null>(null);

export function useHighlights(): HighlightsApi {
  const api = use(HighlightsContext);

  if (api === null) throw new Error("useHighlights needs a HighlightsProvider");

  return api;
}

export function useSpans(target: Readonly<HighlightTarget>): readonly MarkSpan[] {
  const { items } = useHighlights();

  return useMemo(() => spansFor(items, target), [items, target]);
}

export function useRevealed(matches: (reveal: Readonly<Reveal>) => boolean): boolean {
  const { reveal } = useHighlights();
  const [seen, setSeen] = useState(reveal);

  if (reveal !== seen) setSeen(reveal);

  return reveal !== seen && reveal !== null && matches(reveal);
}
