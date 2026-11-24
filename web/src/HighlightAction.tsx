import { type SyntheticEvent, use, useCallback, useLayoutEffect, useRef } from "react";

import type { Highlight } from "../../src/core/contract/highlight-contract.ts";
import { type Panel, PanelContext, useHighlights } from "./highlights-context.ts";
import { placePopover, placementOf } from "./place-popover.ts";
import { QuoteText } from "./QuoteText.tsx";
import { KEEP_GROUP, KEEP_LABEL, REMOVE_GROUP, REMOVE_LABEL, removeNamed } from "./reader-text.ts";

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

function RemoveButton({ id, label }: Readonly<{ id: number; label: string }>) {
  const { remove } = useHighlights();

  const removeIt = useCallback((): void => {
    void remove(id);
  }, [remove, id]);

  return (
    <button type="button" className="btn" aria-label={label} onClick={removeIt}>
      {REMOVE_LABEL}
    </button>
  );
}

function RemoveRow({ highlight }: Readonly<{ highlight: Highlight }>) {
  const { exact } = highlight.selector;

  return (
    <li className="hl-pop-row">
      <span className="hl-quote">
        <QuoteText text={exact} />
      </span>
      <RemoveButton id={highlight.id} label={removeNamed(exact)} />
    </li>
  );
}

function RemoveAction({ ids }: Readonly<{ ids: readonly number[] }>) {
  const { items } = useHighlights();
  const highlights = items.filter(({ id }) => ids.includes(id));
  const [only] = highlights;

  if (highlights.length > 1) {
    return (
      <ul role="list" className="hl-pop-list">
        {highlights.map((highlight) => (
          <RemoveRow key={highlight.id} highlight={highlight} />
        ))}
      </ul>
    );
  }

  return only === undefined ? null : <RemoveButton id={only.id} label={REMOVE_GROUP} />;
}

function Popover({ panel }: Readonly<{ panel: Panel }>) {
  const { keep, dismiss } = useHighlights();
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

  const keepIt = useCallback((): void => {
    if (panel.kind === "keep") keep(panel.draft);
  }, [panel, keep]);

  return (
    <div ref={popover} popover="auto" className="hl-pop" onToggle={closed}>
      {panel.kind === "keep" ? (
        <button type="button" className="btn btn-acc" aria-label={KEEP_GROUP} onClick={keepIt}>
          {KEEP_LABEL}
        </button>
      ) : (
        <RemoveAction ids={panel.ids} />
      )}
    </div>
  );
}

export function HighlightAction({ targetKey }: Readonly<{ targetKey: string }>) {
  const panel = use(PanelContext);

  return panel?.key === targetKey ? <Popover panel={panel} /> : null;
}
