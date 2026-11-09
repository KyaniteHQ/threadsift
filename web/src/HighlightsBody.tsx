import { type RefObject, useCallback, useRef } from "react";

import type { Entry } from "../../src/core/highlights-page-contract.ts";
import { type Filters, isFiltered, isSearching } from "./filters.ts";
import { HighlightEntry } from "./HighlightEntry.tsx";
import { HIGHLIGHTS_PAGE, pageHeadLabel } from "./highlights-page-text.ts";
import { EmptyState, Notice, RESULTS_ID, Skeleton } from "./ListBody.tsx";
import { CLEAR_ALL, RETRY_LABEL } from "./text.ts";
import { useEntryKeys, useFocusNewEntries } from "./use-highlights-focus.ts";
import { type PageState, type Ready, canLoadMore, matchedCount } from "./use-highlights-page.ts";

function Loading() {
  return <Skeleton label={HIGHLIGHTS_PAGE.loading} row="hp-it" title="hp-title" />;
}

function Head({ state, filters }: Readonly<{ state: Ready; filters: Filters }>) {
  const shown = isFiltered(filters) ? matchedCount(state.counts, filters) : null;
  const text = isSearching(filters) ? filters.q.trim() : "";

  return (
    <section className="list-head" aria-labelledby={RESULTS_ID}>
      <p id={RESULTS_ID} className="results" aria-live="polite">
        {pageHeadLabel(state.counts.total, shown, text)}
      </p>
      <p className="label">{HIGHLIGHTS_PAGE.sort}</p>
    </section>
  );
}

function moreLabel(more: Ready["more"]): string {
  if (more === "loading") return HIGHLIGHTS_PAGE.loadingMore;

  return more === "failed" ? RETRY_LABEL : HIGHLIGHTS_PAGE.loadMore;
}

function More({
  state,
  filters,
  loadMore,
}: Readonly<{ state: Ready; filters: Filters; loadMore: () => void }>) {
  if (state.next === null) return null;

  return (
    <div className="hp-more">
      {state.more === "failed" ? (
        <p className="rd-note" role="alert">
          {HIGHLIGHTS_PAGE.loadMoreFailed}
        </p>
      ) : null}
      <button
        type="button"
        className="btn"
        aria-disabled={!canLoadMore(state, filters)}
        onClick={loadMore}
      >
        {moreLabel(state.more)}
      </button>
    </div>
  );
}

function EntryList({
  entries,
  now,
  navigate,
  list,
}: Readonly<{
  entries: readonly Entry[];
  now: number;
  navigate: (to: string) => void;
  list: RefObject<HTMLOListElement | null>;
}>) {
  return (
    <ol
      ref={list}
      // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from an ol with list-style none
      role="list"
      className="hp-list"
      aria-labelledby={RESULTS_ID}
    >
      {entries.map((entry) => (
        <HighlightEntry
          key={`${entry.kind}:${String(entry.id)}`}
          entry={entry}
          now={now}
          navigate={navigate}
        />
      ))}
    </ol>
  );
}

function Listed({
  state,
  filters,
  now,
  navigate,
  loadMore,
  clearAll,
}: Readonly<{
  state: Ready;
  filters: Filters;
  now: number;
  navigate: (to: string) => void;
  loadMore: () => boolean;
  clearAll: () => void;
}>) {
  const list = useRef<HTMLOListElement>(null);
  const expectFocus = useFocusNewEntries(list, state.entries.length);
  const { length } = state.entries;
  useEntryKeys(list);

  const more = useCallback(() => {
    if (loadMore()) expectFocus(length);
  }, [expectFocus, length, loadMore]);

  return (
    <>
      <Head state={state} filters={filters} />
      {length === 0 ? (
        <Notice
          text={HIGHLIGHTS_PAGE.noResults}
          action={clearAll}
          label={CLEAR_ALL}
          alert={false}
        />
      ) : (
        <EntryList entries={state.entries} now={now} navigate={navigate} list={list} />
      )}
      <More state={state} filters={filters} loadMore={more} />
    </>
  );
}

export function HighlightsBody({
  state,
  retry,
  ...listed
}: Readonly<{
  state: PageState;
  filters: Filters;
  now: number;
  navigate: (to: string) => void;
  retry: () => void;
  loadMore: () => boolean;
  clearAll: () => void;
}>) {
  if (state.status === "loading") return <Loading />;

  if (state.status === "failed") {
    return <Notice text={HIGHLIGHTS_PAGE.loadFailed} action={retry} label={RETRY_LABEL} alert />;
  }

  return state.counts.total === 0 ? (
    <EmptyState heading={HIGHLIGHTS_PAGE.emptyHeading} line={HIGHLIGHTS_PAGE.emptyLine} />
  ) : (
    <Listed state={state} {...listed} />
  );
}
