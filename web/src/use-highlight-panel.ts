import { useCallback, useEffect, useMemo, useState } from "react";

import type { HighlightsView } from "../../src/core/highlight-contract.ts";
import { highlightIds } from "./highlight-ids.ts";
import { BODY_SELECTOR, keyOf } from "./highlight-target.ts";
import type { Panel } from "./highlights-context.ts";
import { useSelectionDraft } from "./use-selection-draft.ts";

function markOf(event: MouseEvent): HTMLElement | null {
  const target = event.target instanceof Element ? event.target : null;

  return target?.closest<HTMLElement>(`${BODY_SELECTOR} mark[data-highlights]`) ?? null;
}

export function useHighlightPanel(revisions: HighlightsView["revisions"]) {
  const [draft, setDraft] = useSelectionDraft(revisions);
  const [clicked, setClicked] = useState<Panel | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const mark = markOf(event);
      const id = highlightIds(mark?.dataset["highlights"] ?? "")[0];
      const key = mark?.closest<HTMLElement>(BODY_SELECTOR)?.dataset["target"];

      if (mark === null || key === undefined || id === undefined || !Number.isInteger(id)) {
        setClicked(null);
      } else if (document.getSelection()?.isCollapsed ?? true) {
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

  return { panel, dismiss };
}
