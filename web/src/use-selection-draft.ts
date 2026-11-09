import { useEffect, useEffectEvent, useState } from "react";

import type { HighlightsView } from "../../src/core/highlight-contract.ts";
import type { SelectionDraft } from "./highlight-draft.ts";
import { BODY_SELECTOR, keyOf } from "./highlight-target.ts";

const SETTLE_MS = 150;

export interface KeepDraft extends SelectionDraft {
  readonly revision: number;
}

function revisionOf(draft: Readonly<SelectionDraft>, revisions: HighlightsView["revisions"]) {
  return draft.target.kind === "post" ? revisions.post : revisions.comments;
}

function sameDraft(was: Readonly<KeepDraft>, next: Readonly<KeepDraft>): boolean {
  return (
    was.revision === next.revision &&
    keyOf(was.target) === keyOf(next.target) &&
    was.selector.hint === next.selector.hint &&
    was.selector.exact === next.selector.exact
  );
}

function watchSelection(read: () => void): () => void {
  let timer: number | undefined;
  let pressed = false;

  const settle = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(read, SETTLE_MS);
  };

  const onChange = (): void => {
    if (!pressed) settle();
  };

  const onDown = (): void => {
    pressed = true;
  };

  const onUp = (): void => {
    pressed = false;
    settle();
  };

  document.addEventListener("selectionchange", onChange);
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointerup", onUp, true);
  document.addEventListener("pointercancel", onUp, true);

  return () => {
    window.clearTimeout(timer);
    document.removeEventListener("selectionchange", onChange);
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onUp, true);
  };
}

function inBody(selection: Selection): boolean {
  if (selection.rangeCount !== 1 || selection.isCollapsed) return false;

  const { commonAncestorContainer } = selection.getRangeAt(0);

  const element =
    commonAncestorContainer instanceof Element
      ? commonAncestorContainer
      : commonAncestorContainer.parentElement;

  return element?.closest(BODY_SELECTOR) instanceof Element;
}

export function useSelectionDraft(revisions: HighlightsView["revisions"]) {
  const [draft, setDraft] = useState<KeepDraft | null>(null);

  const read = useEffectEvent(async (): Promise<void> => {
    const selection = document.getSelection();

    const found =
      selection !== null && inBody(selection)
        ? (await import("./highlight-draft.ts")).draftOf(selection)
        : null;

    const revision = found === null ? null : revisionOf(found, revisions);
    const next = found === null || revision === null ? null : { ...found, revision };

    setDraft((was) => (was !== null && next !== null && sameDraft(was, next) ? was : next));
  });

  useEffect(
    () =>
      watchSelection(() => {
        void read();
      }),
    [],
  );

  return [draft, setDraft] as const;
}
