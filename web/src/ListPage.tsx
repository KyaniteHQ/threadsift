import { type MouseEvent, type ReactNode, useCallback, useRef } from "react";

import { EmptyState, Notice, RESULTS_ID, Skeleton } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { PageBar } from "./PageBar.tsx";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { useFocusNewRows } from "./use-focus-new-rows.ts";
import type { Paged, PagedPage, PagedReady } from "./use-paged-read.ts";

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
  readonly emptyLine: (ready: PagedReady<Page>) => string;
  readonly rows: (ready: PagedReady<Page>) => readonly Row[];
}

interface Source<Page extends PagedPage> {
  readonly state: Paged<Page>;
  readonly retry: () => void;
  readonly loadMore: () => void;
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
}: Readonly<{ ready: PagedReady<Page>; loadMore: () => void } & Shown<Page, Row>>) {
  const list = useRef<HTMLOListElement>(null);
  const { length } = listing.rows(ready);
  const expectFocus = useFocusNewRows(list, length, listing.focus);

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
        <h2 id={RESULTS_ID} className="results" tabIndex={-1}>
          {listing.head(ready)}
        </h2>
        <p className="label">{listing.text.sort}</p>
      </header>
      <ol
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from an ol with list-style none
        role="list"
        ref={list}
        className="rl-list"
      >
        {listing.rows(ready).map((row) => draw(row))}
      </ol>
      {ready.next === null ? null : (
        <LoadMore more={ready.more} failedText={listing.text.loadMoreFailed} loadMore={more} />
      )}
    </section>
  );
}

function Body<Page extends PagedPage, Row>({
  source: { state, retry, loadMore },
  listing,
  draw,
}: Readonly<{ source: Source<Page> } & Shown<Page, Row>>) {
  switch (state.status) {
    case "loading":
      return <Skeleton label={listing.text.loading} row="rl-row" title="rl-title" />;
    case "failed":
      return <Notice text={listing.text.loadFailed} action={retry} label={RETRY_LABEL} alert />;
    case "ready":
      return listing.rows(state).length === 0 ? (
        <EmptyState heading={listing.text.emptyHeading} line={listing.emptyLine(state)} />
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
  back,
  notice = null,
}: Readonly<
  { source: Source<Page>; back: () => void; notice?: string | null } & Shown<Page, Row>
>) {
  const loading = source.state.status === "loading";

  return (
    <div className="pg">
      <PageBar
        title={listing.text.title}
        back={back}
        backLabel={TOPIC_PAGE.back}
        ready={!loading}
      />
      <main className="pg-col rl-col" aria-busy={loading}>
        {notice === null ? null : <p className="rd-note">{notice}</p>}
        <Body source={source} listing={listing} draw={draw} />
      </main>
    </div>
  );
}
