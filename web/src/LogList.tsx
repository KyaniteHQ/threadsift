import { type MouseEvent, useCallback, useRef } from "react";

import { RESULTS_ID } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { localDate } from "./log-date.ts";
import { LOG_PAGE, logSince } from "./log-text.ts";
import { LogRow } from "./LogRow.tsx";
import type { Pages } from "./routing.ts";
import { useFocusNewRows } from "./use-focus-new-rows.ts";
import type { LogReady } from "./use-log-page.ts";

export function LogList({
  state,
  loadMore,
  pages,
}: Readonly<{ state: LogReady; loadMore: () => void; pages: Pages }>) {
  const list = useRef<HTMLOListElement>(null);
  const { length } = state.entries;
  const expectFocus = useFocusNewRows(list, length, ".lg-link");

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
          {logSince(localDate(state.startedAt))}
        </h2>
        <p className="label">{LOG_PAGE.sort}</p>
      </header>
      <ol
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from an ol with list-style none
        role="list"
        ref={list}
        className="rl-list"
      >
        {state.entries.map((entry) => (
          <LogRow key={entry.id} entry={entry} pages={pages} />
        ))}
      </ol>
      {state.next === null ? null : (
        <LoadMore more={state.more} failedText={LOG_PAGE.loadMoreFailed} loadMore={more} />
      )}
    </section>
  );
}
