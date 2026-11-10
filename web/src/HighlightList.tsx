import { type MouseEvent, memo, useCallback, useId } from "react";

import type { Highlight } from "../../src/core/highlight-contract.ts";
import { useHighlights } from "./highlights-context.ts";
import { HIGHLIGHTS_TITLE, NOT_FOUND, REMOVE_LABEL, removeNamed } from "./reader-text.ts";
import { RETRY_LABEL } from "./text.ts";

function neighbourOf(entry: Element): HTMLElement | null {
  const next = entry.nextElementSibling ?? entry.previousElementSibling;

  return next?.querySelector<HTMLElement>(".btn") ?? null;
}

function titleOf(entry: Element): HTMLElement | null {
  for (let at = entry.parentElement; at !== null; at = at.parentElement) {
    const title = at.querySelector<HTMLElement>(".rd-title");

    if (title !== null) return title;
  }

  return null;
}

async function removeAndRefocus(
  entry: Element | null,
  removed: () => Promise<boolean>,
): Promise<void> {
  const neighbour = entry === null ? null : neighbourOf(entry);
  const title = entry === null ? null : titleOf(entry);

  if (await removed()) (neighbour?.isConnected === true ? neighbour : title)?.focus();
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
    <li className="hl-entry">
      {highlight.status === "attached" ? (
        <button type="button" className="hl-quote" onClick={showIt}>
          {exact}
        </button>
      ) : (
        <>
          <p className="hl-quote">{exact}</p>
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
  const heading = useId();

  return items.length === 0 && failure === null ? null : (
    <section className="rd-hl" aria-labelledby={heading}>
      <h3 id={heading} className="label">
        {HIGHLIGHTS_TITLE}
      </h3>
      {failure === null ? null : (
        <div role="alert">
          <p className="rd-note">{failure.text}</p>
          {failure.reloads ? (
            <button type="button" className="btn" onClick={reloadPage}>
              {RETRY_LABEL}
            </button>
          ) : null}
        </div>
      )}
      {items.length === 0 ? null : (
        <ul className="hl-list">
          {items.map((highlight) => (
            <Entry key={highlight.id} highlight={highlight} />
          ))}
        </ul>
      )}
    </section>
  );
});
