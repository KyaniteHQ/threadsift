import { type MouseEvent, memo, useCallback } from "react";

import type { Highlight } from "../../src/core/contract/highlight-contract.ts";
import { HIGHLIGHTS_TITLE, NOT_FOUND } from "../../src/core/contract/reader-text.ts";
import { watchFocus } from "./focus-watch.ts";
import { useHighlights } from "./highlights-context.ts";
import { QuoteText } from "./QuoteText.tsx";
import { REMOVE_LABEL, removeNamed } from "./reader-text.ts";
import { AlertRegion } from "./RetryRegions.tsx";
import { readerTitleOf } from "./reveal.ts";

function neighbourOf(entry: Element): HTMLElement | null {
  const next = entry.nextElementSibling ?? entry.previousElementSibling;

  return next?.querySelector<HTMLElement>(".btn") ?? null;
}

async function removeAndRefocus(
  entry: Element | null,
  removed: () => Promise<boolean>,
): Promise<void> {
  const neighbour = entry === null ? null : neighbourOf(entry);
  const title = entry === null ? null : readerTitleOf(entry);
  const focus = watchFocus();

  try {
    if ((await removed()) && focus.unmoved()) {
      (neighbour?.isConnected === true ? neighbour : title)?.focus();
    }
  } finally {
    focus.stop();
  }
}

function Entry({ highlight }: Readonly<{ highlight: Highlight }>) {
  const { remove, show } = useHighlights();
  const { exact } = highlight.selector;

  const showIt = useCallback((): void => {
    show(highlight);
  }, [show, highlight]);

  const removeIt = useCallback(
    (event: MouseEvent<HTMLButtonElement>): void => {
      void removeAndRefocus(event.currentTarget.closest("li"), () => remove(highlight.id));
    },
    [remove, highlight.id],
  );

  return (
    <li className="hl-entry" data-highlight={highlight.id} tabIndex={-1}>
      {highlight.status === "attached" ? (
        <button type="button" className="hl-quote" onClick={showIt}>
          <QuoteText text={exact} />
        </button>
      ) : (
        <>
          <p className="hl-quote">
            <QuoteText text={exact} />
          </p>
          <p className="rd-note hl-gone">{NOT_FOUND}</p>
        </>
      )}
      <button type="button" className="btn" aria-label={removeNamed(exact)} onClick={removeIt}>
        {REMOVE_LABEL}
      </button>
    </li>
  );
}

function reloadPage(): void {
  window.location.reload();
}

export const HighlightList = memo(function HighlightList() {
  const { items, failure } = useHighlights();

  return (
    <>
      <AlertRegion
        text={failure?.text ?? null}
        retry={failure?.reloads === true ? reloadPage : null}
      />
      {items.length === 0 ? null : (
        <section className="rd-hl">
          <h3 className="rd-h">{HIGHLIGHTS_TITLE}</h3>
          <ul role="list" className="hl-list">
            {items.map((highlight) => (
              <Entry key={highlight.id} highlight={highlight} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
});
