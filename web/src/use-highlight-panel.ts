import { useCallback, useEffect, useMemo, useState } from "react";

import type { HighlightsView } from "../../src/core/contract/highlight-contract.ts";
import { highlightIds } from "./highlight-ids.ts";
import { BODY_SELECTOR, keyOf } from "./highlight-target.ts";
import type { Panel, RemovePanel } from "./highlights-context.ts";
import { useSelectionDraft } from "./use-selection-draft.ts";

function markOf(event: MouseEvent | KeyboardEvent): HTMLElement | null {
  const target = event.target instanceof Element ? event.target : null;

  return target?.closest<HTMLElement>(`${BODY_SELECTOR} mark[data-highlights]`) ?? null;
}

function removePanelOf(
  event: MouseEvent | KeyboardEvent,
  viaKeyboard: boolean,
): RemovePanel | null {
  const mark = markOf(event);
  const ids = highlightIds(mark?.dataset["highlights"] ?? "");
  const key = mark?.closest<HTMLElement>(BODY_SELECTOR)?.dataset["target"];

  return mark === null || key === undefined || !ids.every((id) => Number.isInteger(id))
    ? null
    : { kind: "remove", key, ids, mark, viaKeyboard };
}

function followsLink(event: MouseEvent, mark: Element): boolean {
  const modified =
    event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

  return modified && mark.closest("a") !== null;
}

export function useHighlightPanel(revisions: HighlightsView["revisions"]) {
  const [draft, setDraft, unavailable] = useSelectionDraft(revisions);
  const [clicked, setClicked] = useState<Panel | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const next = removePanelOf(event, false);

      if (next === null || followsLink(event, next.mark)) {
        setClicked(null);
      } else if (document.getSelection()?.isCollapsed ?? true) {
        event.preventDefault();
        setClicked(next);
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      const next = event.key === "Enter" && !modified ? removePanelOf(event, true) : null;

      if (next !== null && event.target === next.mark) {
        event.preventDefault();
        setClicked(next);
      }
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
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

  return { panel, dismiss, unavailable };
}
