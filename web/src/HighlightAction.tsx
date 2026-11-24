import {
  type ReactNode,
  type SyntheticEvent,
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import type { Highlight } from "../../src/core/contract/highlight-contract.ts";
import { highlightIds } from "./highlight-ids.ts";
import { type Panel, PanelContext, type RemovePanel, useHighlights } from "./highlights-context.ts";
import { placePopover, placementOf } from "./place-popover.ts";
import { QuoteText } from "./QuoteText.tsx";
import {
  ELLIPSIS,
  KEEP_GROUP,
  KEEP_LABEL,
  REMOVE_GROUP,
  REMOVE_LABEL,
  contextTail,
  quoteEnds,
  removeNamed,
} from "./reader-text.ts";
import { readerTitleOf } from "./reveal.ts";

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

  const resized = new ResizeObserver(again);
  const listeners = new AbortController();
  const { signal } = listeners;

  place();
  resized.observe(element);
  element.addEventListener("keydown", refuseRepeat, { signal });
  window.addEventListener("resize", again, { signal });
  window.addEventListener(
    "scroll",
    (event) => {
      if (!(event.target instanceof Node && element.contains(event.target))) again();
    },
    { capture: true, signal },
  );

  return () => {
    resized.disconnect();
    cancelAnimationFrame(frame);
    listeners.abort();
  };
}

function carries(mark: HTMLElement, left: readonly number[]): boolean {
  return highlightIds(mark.dataset["highlights"] ?? "").some((id) => left.includes(id));
}

function markAfterRemove(
  panel: Readonly<RemovePanel>,
  left: readonly number[],
): HTMLElement | null {
  if (panel.mark.isConnected && carries(panel.mark, left)) return panel.mark;

  return left.length === 0
    ? null
    : document.querySelector<HTMLElement>(
        left.map((id) => `mark[data-highlights~="${id}"]`).join(),
      );
}

function refuseRepeat(event: KeyboardEvent): void {
  if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
}

function RemoveButton({
  panel,
  id,
  label,
  described,
}: Readonly<{ panel: RemovePanel; id: number; label: string; described?: string }>) {
  const { remove } = useHighlights();
  const button = useRef<HTMLButtonElement>(null);

  const removeIt = useCallback((): void => {
    const title = button.current === null ? null : readerTitleOf(button.current);

    const refocus = (removed: boolean): void => {
      const left = removed ? panel.ids.filter((each) => each !== id) : panel.ids;

      (markAfterRemove(panel, left) ?? title)?.focus({ preventScroll: true });
    };

    void remove(id).then(refocus);
  }, [remove, panel, id]);

  return (
    <button
      ref={button}
      type="button"
      className="btn"
      aria-label={label}
      aria-describedby={described}
      onClick={removeIt}
    >
      {REMOVE_LABEL}
    </button>
  );
}

function RowPart({
  id,
  className,
  whole,
  children,
}: Readonly<{ id: string; className: string; whole: string | null; children: ReactNode }>) {
  return whole === null ? (
    <span id={id} className={className}>
      {children}
    </span>
  ) : (
    <>
      <span id={id} className="vh">
        <QuoteText text={whole} />
      </span>
      <span className={className} aria-hidden="true">
        {children}
      </span>
    </>
  );
}

function RemoveRow({ panel, highlight }: Readonly<{ panel: RemovePanel; highlight: Highlight }>) {
  const { exact, prefix, suffix } = highlight.selector;
  const { head, tail } = quoteEnds(exact);
  const before = contextTail(prefix);
  const id = useId();
  const parts = [`${id}-before`, `${id}-quote`, `${id}-after`] as const;

  return (
    <li className="hl-pop-row">
      <span className="hl-quote">
        <span>
          <RowPart id={parts[0]} className="hl-ctx" whole={before === prefix ? null : prefix}>
            <QuoteText text={before} />
          </RowPart>
          <RowPart id={parts[1]} className="hl-exact" whole={tail === null ? null : exact}>
            <QuoteText text={head} />
            {tail === null ? null : (
              <>
                {ELLIPSIS}
                <QuoteText text={tail} />
              </>
            )}
          </RowPart>
          <span id={parts[2]} className="hl-ctx">
            <QuoteText text={suffix} />
          </span>
        </span>
      </span>
      <RemoveButton
        panel={panel}
        id={highlight.id}
        label={removeNamed(exact)}
        described={parts.join(" ")}
      />
    </li>
  );
}

function RemoveAction({
  panel,
  rows,
}: Readonly<{ panel: RemovePanel; rows: readonly Highlight[] }>) {
  const [only] = rows;

  if (rows.length > 1) {
    return (
      <ul role="list" className="hl-pop-list">
        {rows.map((highlight) => (
          <RemoveRow key={highlight.id} panel={panel} highlight={highlight} />
        ))}
      </ul>
    );
  }

  return only === undefined ? null : (
    <RemoveButton panel={panel} id={only.id} label={REMOVE_GROUP} />
  );
}

const NO_ROWS: readonly Highlight[] = [];

function Popover({ panel }: Readonly<{ panel: Panel }>) {
  const { keep, dismiss, items } = useHighlights();
  const popover = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => (panel.kind === "remove" ? items.filter(({ id }) => panel.ids.includes(id)) : NO_ROWS),
    [items, panel],
  );

  const lost = panel.kind === "remove" && rows.length === 0;

  useLayoutEffect(() => {
    if (panel.kind === "remove" && (rows.length === 0 || !panel.mark.isConnected)) dismiss();
  }, [panel, rows, dismiss]);

  useLayoutEffect(
    () => (popover.current === null ? undefined : placedWhileShown(popover.current, panel)),
    [panel],
  );

  useLayoutEffect(() => {
    if (panel.kind === "remove" && panel.viaKeyboard)
      popover.current?.querySelector("button")?.focus();
  }, [panel]);

  const closed = useCallback(
    (event: SyntheticEvent<HTMLDivElement>): void => {
      if (!event.currentTarget.matches(":popover-open")) dismiss();
    },
    [dismiss],
  );

  const keepIt = useCallback((): void => {
    if (panel.kind === "keep") keep(panel.draft);
  }, [panel, keep]);

  if (lost) return null;

  return (
    <div ref={popover} popover="auto" className="hl-pop" onToggle={closed}>
      {panel.kind === "keep" ? (
        <button type="button" className="btn btn-acc" aria-label={KEEP_GROUP} onClick={keepIt}>
          {KEEP_LABEL}
        </button>
      ) : (
        <RemoveAction panel={panel} rows={rows} />
      )}
    </div>
  );
}

export function HighlightAction({ targetKey }: Readonly<{ targetKey: string }>) {
  const panel = use(PanelContext);

  return panel?.key === targetKey ? <Popover panel={panel} /> : null;
}
