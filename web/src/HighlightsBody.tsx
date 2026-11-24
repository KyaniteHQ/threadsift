import { type MouseEvent, type RefObject, useCallback } from "react";

import { type Filters, isEmptyResult } from "./filters.ts";
import { HighlightEntry } from "./HighlightEntry.tsx";
import { HIGHLIGHTS_PAGE } from "./highlights-page-text.ts";
import { EmptyState, ListHead, Notice, RESULTS_ID, RetryNotice, Skeleton } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { CLEAR_ALL } from "./text.ts";
import { useFocusNewEntries } from "./use-highlights-focus.ts";
import { type PageState, type Ready, canLoadMore } from "./use-highlights-page.ts";

function Loading() {
  return <Skeleton label={HIGHLIGHTS_PAGE.loading} row="hp-it" title="hp-title" />;
}

function More({
  state,
  filters,
  loadMore,
}: Readonly<{
  state: Ready;
  filters: Filters;
  loadMore: (event: MouseEvent<HTMLButtonElement>) => void;
}>) {
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
  list,
}: Readonly<{
  entries: Ready["entries"];
  now: number;
  list: RefObject<HTMLOListElement | null>;
}>) {
  return (
    <ol ref={list} role="list" className="hp-list" aria-labelledby={RESULTS_ID}>
      {entries.map((entry) => (
        <HighlightEntry key={`${entry.kind}:${String(entry.id)}`} entry={entry} now={now} />
      ))}
    </ol>
  );
}

interface ShownProps {
  readonly head: string;
  readonly filters: Filters;
  readonly now: number;
  readonly loadMore: () => boolean;
  readonly clearAll: () => void;
  readonly list: RefObject<HTMLOListElement | null>;
}

function Listed({
  state,
  head,
  filters,
  now,
  loadMore,
  clearAll,
  list,
}: Readonly<{ state: Ready } & ShownProps>) {
  const { length } = state.entries;
  const expectFocus = useFocusNewEntries(list, { count: length, more: state.more });

  const more = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (loadMore()) expectFocus(event.detail === 0 ? length : null);
    },
    [expectFocus, length, loadMore],
  );

  return (
    <>
      <ListHead label={head} sort={HIGHLIGHTS_PAGE.sort} />
      {isEmptyResult(length, state.next) ? (
        <Notice text={HIGHLIGHTS_PAGE.noResults} action={clearAll} label={CLEAR_ALL} />
      ) : (
        <EntryList entries={state.entries} now={now} list={list} />
      )}
      <More state={state} filters={filters} loadMore={more} />
    </>
  );
}

function HighlightsContent({ state, ...listed }: Readonly<{ state: PageState } & ShownProps>) {
  if (state.status === "failed") return null;

  if (state.status === "loading") return <Loading />;

  return state.counts.total === 0 ? (
    <EmptyState heading={HIGHLIGHTS_PAGE.emptyHeading} line={HIGHLIGHTS_PAGE.emptyLine} />
  ) : (
    <Listed state={state} {...listed} />
  );
}

export function HighlightsBody({
  state,
  retry,
  ...listed
}: Readonly<{ state: PageState; retry: () => void } & ShownProps>) {
  return (
    <>
      <RetryNotice
        failed={state.status === "failed"}
        text={HIGHLIGHTS_PAGE.loadFailed}
        action={retry}
      />
      <HighlightsContent state={state} {...listed} />
    </>
  );
}
