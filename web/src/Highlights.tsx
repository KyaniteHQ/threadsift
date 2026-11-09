import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import type { Highlight, HighlightsView } from "../../src/core/highlight-contract.ts";
import { dropHighlight, keepHighlight } from "./api.ts";
import { BODY_SELECTOR, keyOf } from "./highlight-target.ts";
import { HighlightList } from "./HighlightList.tsx";
import {
  HighlightsContext,
  type HighlightsApi,
  type Panel,
  type Reveal,
} from "./highlights-context.ts";
import {
  KEEP_FAILED,
  KEEP_STALE,
  KEPT_ANNOUNCEMENT,
  REMOVED_ANNOUNCEMENT,
  REMOVE_FAILED,
} from "./reader-text.ts";
import type { DetailActions } from "./use-item-detail.ts";
import { type KeepDraft, useSelectionDraft } from "./use-selection-draft.ts";

type Note = (text: string | null, failure: string | null) => void;

function added(view: HighlightsView, highlight: Readonly<Highlight>): HighlightsView {
  return view.items.some(({ id }) => id === highlight.id)
    ? view
    : { ...view, items: [...view.items, highlight] };
}

function without(view: HighlightsView, id: number): HighlightsView {
  return { ...view, items: view.items.filter((item) => item.id !== id) };
}

function markOf(event: MouseEvent): HTMLElement | null {
  const target = event.target instanceof Element ? event.target : null;

  return target?.closest<HTMLElement>(`${BODY_SELECTOR} mark[data-highlights]`) ?? null;
}

function useHighlightWrites(itemId: number, actions: DetailActions, note: Note) {
  const { reload, editHighlights } = actions;

  const keep = useCallback(
    async (draft: Readonly<KeepDraft>): Promise<void> => {
      const { target, revision, selector } = draft;
      const answer = await keepHighlight(itemId, { target, revision, selector }).catch(() => null);

      if (answer === null) note(null, KEEP_FAILED);
      else if (answer.outcome === "changed") {
        reload();
        note(null, KEEP_STALE);
      } else {
        editHighlights((view) => added(view, answer.highlight));
        note(KEPT_ANNOUNCEMENT, null);
      }
    },
    [itemId, reload, editHighlights, note],
  );

  const remove = useCallback(
    async (id: number): Promise<void> => {
      const done = await dropHighlight(itemId, id).then(
        () => true,
        () => false,
      );

      if (done) {
        editHighlights((view) => without(view, id));
        note(REMOVED_ANNOUNCEMENT, null);
      } else note(null, REMOVE_FAILED);
    },
    [itemId, editHighlights, note],
  );

  return { keep, remove };
}

function usePanel(revisions: HighlightsView["revisions"]) {
  const [draft, setDraft] = useSelectionDraft(revisions);
  const [clicked, setClicked] = useState<Panel | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const mark = markOf(event);
      const id = Number(mark?.dataset["highlights"]?.split(" ")[0]);
      const key = mark?.closest<HTMLElement>(BODY_SELECTOR)?.dataset["target"];

      if (mark === null || key === undefined || !Number.isInteger(id)) setClicked(null);
      else if (document.getSelection()?.isCollapsed ?? true) {
        setClicked({ kind: "remove", key, id, mark });
      }
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
    };
  }, []);

  const panel = useMemo<Panel | null>(
    () => (draft === null ? clicked : { kind: "keep", key: keyOf(draft.target), draft }),
    [draft, clicked],
  );

  const dismiss = useCallback((): void => {
    setDraft(null);
    setClicked(null);
  }, [setDraft]);

  return { panel, draft, dismiss };
}

function useReveal() {
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const show = useCallback((highlight: Readonly<Highlight>): void => {
    setReveal({ id: highlight.id, key: keyOf(highlight.target) });
  }, []);

  useLayoutEffect(() => {
    if (reveal === null) return;

    const mark = document.querySelector<HTMLElement>(`mark[data-highlights~="${reveal.id}"]`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    mark?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    mark?.focus({ preventScroll: true });
  }, [reveal]);

  return { reveal, show };
}

function useNotes() {
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const note = useCallback<Note>((text, problem) => {
    setAnnouncement(text ?? "");
    setFailure(problem);
  }, []);

  return { announcement, failure, note };
}

export function HighlightsProvider({
  itemId,
  view,
  actions,
  children,
}: Readonly<{
  itemId: number;
  view: HighlightsView;
  actions: DetailActions;
  children: ReactNode;
}>) {
  const { panel, draft, dismiss } = usePanel(view.revisions);
  const { announcement, failure, note } = useNotes();
  const { reveal, show } = useReveal();
  const { keep: writeKeep, remove: writeRemove } = useHighlightWrites(itemId, actions, note);

  const keep = useCallback((): void => {
    if (draft === null) return;

    dismiss();
    document.getSelection()?.removeAllRanges();
    void writeKeep(draft);
  }, [draft, dismiss, writeKeep]);

  const remove = useCallback(
    (id: number): void => {
      dismiss();
      void writeRemove(id);
    },
    [dismiss, writeRemove],
  );

  const api = useMemo<HighlightsApi>(
    () => ({ items: view.items, panel, failure, reveal, keep, remove, dismiss, show }),
    [view.items, panel, failure, reveal, keep, remove, dismiss, show],
  );

  return (
    <HighlightsContext value={api}>
      {children}
      <HighlightList />
      <output className="vh" aria-live="polite">
        {announcement}
      </output>
    </HighlightsContext>
  );
}
