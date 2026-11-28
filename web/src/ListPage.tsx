import { type MouseEvent, type ReactNode, useCallback, useRef } from "react";

import { EmptyState, Skeleton } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { PageBar } from "./PageBar.tsx";
import type { PagedPage } from "./read-through.ts";
import { RetryNotice } from "./RetryRegions.tsx";
import { useFocusNewRows } from "./use-focus-new-rows.ts";
import type { Paged, PagedReady } from "./use-paged-read.ts";

interface ListText {
  readonly title: string;
  readonly loading: string;
  readonly loadFailed: string;
  readonly emptyHeading: string;
  readonly loadMoreFailed: string;
  readonly sort: string;
}

export interface Listing<Page extends PagedPage, Row> {
  readonly text: ListText;
  readonly focus: string;
  readonly head: (ready: PagedReady<Page>) => string;
  readonly intro?: string;
  readonly emptyLine: (ready: PagedReady<Page>) => string;
  readonly emptyFoot?: (ready: PagedReady<Page>) => ReactNode;
  readonly rows: (ready: PagedReady<Page>) => readonly Row[];
}

interface Source<Page extends PagedPage> {
  readonly state: Paged<Page>;
  readonly retry: () => Promise<void>;
  readonly loadMore: () => boolean;
}

interface Shown<Page extends PagedPage, Row> {
  readonly listing: Listing<Page, Row>;
  readonly draw: (row: Row) => ReactNode;
}

function Rows<Page extends PagedPage, Row>({
  ready,
  loadMore,
  listing,
  draw,
}: Readonly<{ ready: PagedReady<Page>; loadMore: () => boolean } & Shown<Page, Row>>) {
  const list = useRef<HTMLOListElement>(null);
  const { length } = listing.rows(ready);
  const expectFocus = useFocusNewRows(list, { count: length, more: ready.more }, listing.focus);

  const more = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (loadMore()) expectFocus(event.detail === 0 ? length : null);
    },
    [expectFocus, length, loadMore],
  );

  return (
    <section className="rl-items">
      <header className="list-head">
        <h2 className="results" tabIndex={-1}>
          {listing.head(ready)}
        </h2>
        <p className="label">{listing.text.sort}</p>
      </header>
      {listing.intro === undefined ? null : <p className="rl-intro">{listing.intro}</p>}
      <ol ref={list} role="list" className="rl-list">
        {listing.rows(ready).map((row) => draw(row))}
      </ol>
      {ready.next === null ? null : (
        <LoadMore
          more={ready.more}
          failedText={listing.text.loadMoreFailed}
          disabled={ready.more === "loading" || ready.rereading}
          loadMore={more}
        />
      )}
    </section>
  );
}

function Body<Page extends PagedPage, Row>({
  state,
  loadMore,
  listing,
  draw,
}: Readonly<{ state: Paged<Page>; loadMore: () => boolean } & Shown<Page, Row>>) {
  switch (state.status) {
    case "loading":
      return <Skeleton label={listing.text.loading} row="rl-row" title="rl-title" />;
    case "failed":
      return null;
    case "ready":
      return listing.rows(state).length === 0 ? (
        <>
          {listing.intro === undefined ? null : <p className="rl-intro">{listing.intro}</p>}
          <EmptyState heading={listing.text.emptyHeading} line={listing.emptyLine(state)}>
            {listing.emptyFoot?.(state)}
          </EmptyState>
        </>
      ) : (
        <Rows ready={state} loadMore={loadMore} listing={listing} draw={draw} />
      );
    default:
      return state satisfies never;
  }
}

export function ListPage<Page extends PagedPage, Row>({
  source,
  listing,
  draw,
  notice = null,
}: Readonly<{ source: Source<Page>; notice?: string | null } & Shown<Page, Row>>) {
  const { state, retry, loadMore } = source;
  const loading = state.status === "loading";

  const retryLoad = useCallback(() => {
    void retry();
  }, [retry]);

  return (
    <div className="pg">
      <PageBar title={listing.text.title} ready={!loading} />
      <main className="pg-col rl-col" aria-busy={loading}>
        {notice === null ? null : <p className="rd-note">{notice}</p>}
        <RetryNotice
          failed={state.status === "failed"}
          text={listing.text.loadFailed}
          action={retryLoad}
        />
        <Body state={state} loadMore={loadMore} listing={listing} draw={draw} />
      </main>
    </div>
  );
}
