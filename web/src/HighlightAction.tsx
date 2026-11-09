import { type SyntheticEvent, useCallback, useLayoutEffect, useRef } from "react";

import { type Panel, useHighlights } from "./highlights-context.ts";
import { type Edges, edgesOf, placePopover, visibleBox } from "./place-popover.ts";
import { KEEP_GROUP, KEEP_LABEL, REMOVE_GROUP, REMOVE_LABEL } from "./reader-text.ts";

function edgesOfPanel(panel: Readonly<Panel>): Edges {
  const source = panel.kind === "keep" ? panel.draft.range : panel.mark;

  return edgesOf(Array.from(source.getClientRects()), source.getBoundingClientRect());
}

function placedWhileShown(element: HTMLElement, panel: Readonly<Panel>): () => void {
  if (!element.matches(":popover-open")) element.showPopover();

  const place = (): void => {
    const below = window.matchMedia("(pointer: coarse)").matches;

    placePopover(element, edgesOfPanel(panel), visibleBox(element), below);
  };

  let frame = 0;

  const again = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  };

  place();
  window.addEventListener("scroll", again, true);
  window.addEventListener("resize", again);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", again, true);
    window.removeEventListener("resize", again);
  };
}

function Popover({ panel }: Readonly<{ panel: Panel }>) {
  const { keep, remove, dismiss } = useHighlights();
  const popover = useRef<HTMLDivElement>(null);

  useLayoutEffect(
    () => (popover.current === null ? undefined : placedWhileShown(popover.current, panel)),
    [panel],
  );

  const closed = useCallback(
    (event: SyntheticEvent<HTMLDivElement>): void => {
      if (!event.currentTarget.matches(":popover-open")) dismiss();
    },
    [dismiss],
  );

  const removeMarked = useCallback((): void => {
    if (panel.kind === "remove") remove(panel.id);
  }, [panel, remove]);

  return (
    <div ref={popover} popover="auto" className="hl-pop" onToggle={closed}>
      {panel.kind === "keep" ? (
        <button type="button" className="btn btn-acc" aria-label={KEEP_GROUP} onClick={keep}>
          {KEEP_LABEL}
        </button>
      ) : (
        <button type="button" className="btn" aria-label={REMOVE_GROUP} onClick={removeMarked}>
          {REMOVE_LABEL}
        </button>
      )}
    </div>
  );
}

export function HighlightAction({ targetKey }: Readonly<{ targetKey: string }>) {
  const { panel } = useHighlights();

  return panel?.key === targetKey ? <Popover panel={panel} /> : null;
}
