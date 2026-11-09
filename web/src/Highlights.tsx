import { type ReactNode, useCallback, useMemo, useState } from "react";

import type { Highlight, HighlightsView } from "../../src/core/highlight-contract.ts";
import { dropHighlight, keepHighlight } from "./api.ts";
import { HighlightList } from "./HighlightList.tsx";
import {
  type HighlightsApi,
  HighlightsContext,
  PanelContext,
  useSpanIndex,
} from "./highlights-context.ts";
import {
  KEEP_FAILED,
  KEEP_STALE,
  KEPT_ANNOUNCEMENT,
  REMOVED_ANNOUNCEMENT,
  REMOVE_FAILED,
} from "./reader-text.ts";
import { useHighlightPanel } from "./use-highlight-panel.ts";
import type { DetailActions } from "./use-item-detail.ts";
import { useReveal } from "./use-reveal.ts";
import type { KeepDraft } from "./use-selection-draft.ts";

interface Outcome {
  readonly announce: (text: string) => void;
  readonly fail: (text: string | null) => void;
  readonly dismiss: () => void;
}

function added(view: HighlightsView, highlight: Readonly<Highlight>): HighlightsView {
  return view.items.some(({ id }) => id === highlight.id)
    ? view
    : { ...view, items: [...view.items, highlight] };
}

function without(view: HighlightsView, id: number): HighlightsView {
  return { ...view, items: view.items.filter((item) => item.id !== id) };
}

function useHighlightWrites(
  itemId: number,
  { reload, editHighlights }: DetailActions,
  { announce, fail, dismiss }: Outcome,
) {
  const keep = useCallback(
    async ({ target, revision, selector }: Readonly<KeepDraft>): Promise<void> => {
      dismiss();
      document.getSelection()?.removeAllRanges();
      announce("");

      const answer = await keepHighlight(itemId, { target, revision, selector }).catch(() => null);

      if (answer === null) fail(KEEP_FAILED);
      else if (answer.outcome === "changed") {
        reload();
        fail(KEEP_STALE);
      } else {
        editHighlights((view) => added(view, answer.highlight));
        fail(null);
        announce(KEPT_ANNOUNCEMENT);
      }
    },
    [itemId, reload, editHighlights, announce, fail, dismiss],
  );

  const remove = useCallback(
    async (id: number): Promise<void> => {
      dismiss();
      announce("");

      const done = await dropHighlight(itemId, id).then(
        () => true,
        () => false,
      );

      if (done) {
        editHighlights((view) => without(view, id));
        fail(null);
        announce(REMOVED_ANNOUNCEMENT);
      } else fail(REMOVE_FAILED);
    },
    [itemId, editHighlights, announce, fail, dismiss],
  );

  return { keep, remove };
}

export function HighlightsProvider({
  itemId,
  view,
  actions,
  announce,
  children,
}: Readonly<{
  itemId: number;
  view: HighlightsView;
  actions: DetailActions;
  announce: (text: string) => void;
  children: ReactNode;
}>) {
  const { panel, dismiss } = useHighlightPanel(view.revisions);
  const [failure, fail] = useState<string | null>(null);
  const { reveal, show } = useReveal();
  const spans = useSpanIndex(view.items);
  const { keep, remove } = useHighlightWrites(itemId, actions, { announce, fail, dismiss });

  const api = useMemo<HighlightsApi>(
    () => ({
      items: view.items,
      spans,
      failure,
      reveal,
      keep: (draft) => void keep(draft),
      remove: (id) => void remove(id),
      dismiss,
      show,
    }),
    [view.items, spans, failure, reveal, keep, remove, dismiss, show],
  );

  return (
    <HighlightsContext value={api}>
      <PanelContext value={panel}>
        {children}
        <HighlightList />
      </PanelContext>
    </HighlightsContext>
  );
}
