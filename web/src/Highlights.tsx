import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import type { Highlight, HighlightsView } from "../../src/core/contract/highlight-contract.ts";
import { NOTHING } from "../../src/core/contract/nothing.ts";
import { HighlightList } from "./HighlightList.tsx";
import {
  type HighlightsApi,
  type Failure,
  HighlightsContext,
  PanelContext,
  useSpanIndex,
} from "./highlights-context.ts";
import { dropHighlight, keepHighlight } from "./keeping-api.ts";
import {
  KEEP_FAILED,
  KEEP_REFUSED,
  KEEP_RESTORING,
  KEEP_STALE,
  KEPT_ANNOUNCEMENT,
  REMOVED_ANNOUNCEMENT,
  REMOVE_FAILED,
  SELECT_FAILED,
} from "./reader-text.ts";
import { useHighlightPanel } from "./use-highlight-panel.ts";
import type { DetailActions } from "./use-item-detail.ts";
import { useReveal } from "./use-reveal.ts";
import type { KeepDraft } from "./use-selection-draft.ts";

interface Outcome {
  readonly announce: (text: string) => void;
  readonly fail: (text: string | null) => void;
  readonly dismiss: () => void;
  readonly reopen: (draft: Readonly<KeepDraft>) => void;
}

function added(view: HighlightsView, highlight: Readonly<Highlight>): HighlightsView {
  return view.items.some(({ id }) => id === highlight.id)
    ? view
    : { ...view, items: [...view.items, highlight] };
}

function without(view: HighlightsView, id: number): HighlightsView {
  return { ...view, items: view.items.filter((item) => item.id !== id) };
}

function useSerial() {
  const tail = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(task);
    tail.current = run.catch(NOTHING);

    return run;
  }, []);
}

type Serial = ReturnType<typeof useSerial>;

function startKeep({ dismiss, announce }: Readonly<Pick<Outcome, "dismiss" | "announce">>) {
  dismiss();
  document.getSelection()?.removeAllRanges();
  announce("");
}

function useKeep(itemId: number, serial: Serial, actions: DetailActions, outcome: Outcome) {
  const { reload, editHighlights } = actions;
  const { announce, fail, dismiss, reopen } = outcome;

  return useCallback(
    async (draft: Readonly<KeepDraft>): Promise<void> => {
      const { target, revision, selector } = draft;
      startKeep({ dismiss, announce });

      const answer = await serial(() =>
        keepHighlight(itemId, { target, revision, selector }).catch(() => null),
      );

      if (answer === null) {
        fail(KEEP_FAILED);

        return;
      }

      switch (answer.kind) {
        case "refused":
          fail(KEEP_REFUSED);

          return;
        case "restoring":
          reopen(draft);
          fail(KEEP_RESTORING);

          return;
        case "changed":
          reload();
          fail(KEEP_STALE);

          return;
        case "kept":
          editHighlights((view) => added(view, answer.highlight));
          fail(null);
          announce(KEPT_ANNOUNCEMENT);

          return;
        default: {
          const exhaustive: never = answer;

          return exhaustive;
        }
      }
    },
    [itemId, serial, reload, editHighlights, announce, fail, dismiss, reopen],
  );
}

function useRemove(itemId: number, serial: Serial, actions: DetailActions, outcome: Outcome) {
  const { editHighlights } = actions;
  const { announce, fail, dismiss } = outcome;

  return useCallback(
    async (id: number): Promise<boolean> => {
      dismiss();
      announce("");

      const done = await serial(() =>
        dropHighlight(itemId, id).then(
          () => true,
          () => false,
        ),
      );

      if (done) {
        flushSync(() => {
          editHighlights((view) => without(view, id));
        });
        fail(null);
        announce(REMOVED_ANNOUNCEMENT);
      } else fail(REMOVE_FAILED);

      return done;
    },
    [itemId, serial, editHighlights, announce, fail, dismiss],
  );
}

function useHighlightWrites(itemId: number, actions: DetailActions, outcome: Outcome) {
  const serial = useSerial();

  return {
    keep: useKeep(itemId, serial, actions, outcome),
    remove: useRemove(itemId, serial, actions, outcome),
  };
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
  const { panel, dismiss, reopen, unavailable } = useHighlightPanel(view.revisions);
  const [failed, fail] = useState<string | null>(null);
  const { reveal, show } = useReveal(view.items);
  const spans = useSpanIndex(view.items);
  const outcome = { announce, fail, dismiss, reopen };
  const { keep, remove } = useHighlightWrites(itemId, actions, outcome);

  const failure = useMemo<Failure | null>(() => {
    if (failed !== null) return { text: failed, reloads: unavailable };

    return unavailable ? { text: SELECT_FAILED, reloads: true } : null;
  }, [failed, unavailable]);

  const api = useMemo<HighlightsApi>(
    () => ({
      items: view.items,
      spans,
      failure,
      reveal,
      keep: (draft) => void keep(draft),
      remove,
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
