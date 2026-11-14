import { type RefObject, useCallback } from "react";

import { type Filters, isEmptyResult, isFiltered, isSearching } from "./filters.ts";
import { HighlightEntry } from "./HighlightEntry.tsx";
import { HIGHLIGHTS_PAGE, pageHeadLabel } from "./highlights-page-text.ts";
import { matchedCount } from "./list-counts.ts";
import { EmptyState, Notice, RESULTS_ID, Skeleton } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { CLEAR_ALL, RETRY_LABEL } from "./text.ts";
import { useFocusNewEntries } from "./use-highlights-focus.ts";
import { type PageState, type Ready, canLoadMore } from "./use-highlights-page.ts";

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

function More({
  state,
  filters,
  loadMore,
}: Readonly<{ state: Ready; filters: Filters; loadMore: () => void }>) {
  if (state.next === null) return null;

  return (
    <LoadMore
      more={state.more}
      failedText={HIGHLIGHTS_PAGE.loadMoreFailed}
      disabled={!canLoadMore(state, filters)}
      loadMore={loadMore}
    />
  );
}

function EntryList({
  entries,
  now,
  navigate,
  list,
}: Readonly<{
  entries: Ready["entries"];
  now: number;
  navigate: (to: string) => void;
  list: RefObject<HTMLOListElement | null>;
}>) {
  return (
    <ol ref={list} role="list" className="hp-list" aria-labelledby={RESULTS_ID}>
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
  list,
}: Readonly<{
  state: Ready;
  filters: Filters;
  now: number;
  navigate: (to: string) => void;
  loadMore: () => boolean;
  clearAll: () => void;
  list: RefObject<HTMLOListElement | null>;
}>) {
  const { length } = state.entries;
  const expectFocus = useFocusNewEntries(list, { count: length, more: state.more });

  const more = useCallback(() => {
    if (loadMore()) expectFocus(length);
  }, [expectFocus, length, loadMore]);

  return (
    <>
      <Head state={state} filters={filters} />
      {isEmptyResult(length, state.next) ? (
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
  list: RefObject<HTMLOListElement | null>;
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
