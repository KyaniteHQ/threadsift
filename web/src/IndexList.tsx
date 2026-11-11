import { type MouseEvent, useCallback, useRef } from "react";

import { INDEX_PAGE, indexHeadLabel } from "./index-text.ts";
import { IndexRow } from "./IndexRow.tsx";
import { RESULTS_ID } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { useFocusNewRows } from "./use-focus-new-rows.ts";
import type { IndexReady } from "./use-index-page.ts";

export function IndexList({
  state,
  loadMore,
  open,
}: Readonly<{ state: IndexReady; loadMore: () => void; open: (key: string) => void }>) {
  const list = useRef<HTMLOListElement>(null);
  const { length } = state.topics;
  const expectFocus = useFocusNewRows(list, length, ".rl-open");

  const more = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      loadMore();
      expectFocus(event.detail === 0 ? length : null);
    },
    [expectFocus, length, loadMore],
  );

  return (
    <section aria-labelledby={RESULTS_ID} className="rl-items">
      <header className="list-head">
        <h2 id={RESULTS_ID} className="results">
          {indexHeadLabel(state.total)}
        </h2>
        <p className="label">{INDEX_PAGE.sort}</p>
      </header>
      <ol
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from an ol with list-style none
        role="list"
        ref={list}
        className="rl-list"
      >
        {state.topics.map((topic) => (
          <IndexRow key={topic.key} topic={topic} open={open} />
        ))}
      </ol>
      {state.next === null ? null : (
        <LoadMore more={state.more} failedText={INDEX_PAGE.loadMoreFailed} loadMore={more} />
      )}
    </section>
  );
}
