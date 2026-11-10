import { type SyntheticEvent, use, useCallback, useLayoutEffect, useRef } from "react";

import { type Panel, PanelContext, useHighlights } from "./highlights-context.ts";
import { placePopover, placementOf } from "./place-popover.ts";
import { KEEP_GROUP, KEEP_LABEL, REMOVE_GROUP, REMOVE_LABEL } from "./reader-text.ts";

function placedWhileShown(element: HTMLElement, panel: Readonly<Panel>): () => void {
  if (!element.matches(":popover-open")) element.showPopover();

  const source = panel.kind === "keep" ? panel.draft.range : panel.mark;
  const placement = placementOf(element);

  const place = (): void => {
    placePopover(element, source, placement);
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

  const act = useCallback((): void => {
    if (panel.kind === "keep") keep(panel.draft);
    else void remove(panel.id);
  }, [panel, keep, remove]);

  return (
    <div ref={popover} popover="auto" className="hl-pop" onToggle={closed}>
      {panel.kind === "keep" ? (
        <button type="button" className="btn btn-acc" aria-label={KEEP_GROUP} onClick={act}>
          {KEEP_LABEL}
        </button>
      ) : (
        <button type="button" className="btn" aria-label={REMOVE_GROUP} onClick={act}>
          {REMOVE_LABEL}
        </button>
      )}
    </div>
  );
}

export function HighlightAction({ targetKey }: Readonly<{ targetKey: string }>) {
  const panel = use(PanelContext);

  return panel?.key === targetKey ? <Popover panel={panel} /> : null;
}
