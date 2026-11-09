import { type Dispatch, type SetStateAction, createContext, use, useState } from "react";

import type { Highlight } from "../../src/core/highlight-contract.ts";
import type { MarkSpan } from "./highlight-marks.ts";
import { NO_INDEX, NO_SPANS, type SpanIndex, indexSpans } from "./highlight-target.ts";
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
  readonly spans: SpanIndex;
  readonly failure: string | null;
  readonly reveal: Reveal | null;
  readonly keep: (draft: Readonly<KeepDraft>) => void;
  readonly remove: (id: number) => void;
  readonly dismiss: () => void;
  readonly show: (highlight: Readonly<Highlight>) => void;
}

export const HighlightsContext = createContext<HighlightsApi | null>(null);

export const PanelContext = createContext<Panel | null>(null);

export function useHighlights(): HighlightsApi {
  const api = use(HighlightsContext);

  if (api === null) throw new Error("useHighlights needs a HighlightsProvider");

  return api;
}

export function useSpanIndex(items: readonly Highlight[]): SpanIndex {
  const [state, setState] = useState({ items, index: indexSpans(items, NO_INDEX) });

  if (state.items !== items) setState({ items, index: indexSpans(items, state.index) });

  return state.index;
}

export function useSpans(key: string): readonly MarkSpan[] {
  return useHighlights().spans[key] ?? NO_SPANS;
}

export function useOpenOnReveal(
  matches: (reveal: Readonly<Reveal>) => boolean,
): readonly [boolean, Dispatch<SetStateAction<boolean>>] {
  const { reveal } = useHighlights();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(reveal);

  if (reveal !== seen) {
    setSeen(reveal);

    if (reveal !== null && matches(reveal) && !open) setOpen(true);
  }

  return [open, setOpen];
}
