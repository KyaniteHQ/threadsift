import { type MouseEvent, type ReactNode, useCallback, useRef } from "react";

import { Skeleton } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { PageEmpty } from "./PageEmpty.tsx";
import { PageFrame } from "./PageFrame.tsx";
import type { PagedPage } from "./read-through.ts";
import { RetryNotice } from "./RetryRegions.tsx";
import { type LoadedRows, useFocusNewRows } from "./use-focus-new-rows.ts";
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
  readonly rowSelector?: string;
  readonly head: (ready: PagedReady<Page>) => string;
  readonly intro?: string;
  readonly emptyLine: (ready: PagedReady<Page>) => string;
  readonly emptyFoot?: (ready: PagedReady<Page>) => ReactNode;
  readonly rows: (ready: PagedReady<Page>) => readonly Row[];
}

interface Source<Page extends PagedPage> {
  readonly state: Paged<Page>;
  readonly retry: () => Promise<void>;
  readonly loadMore: () => void;
}

export interface FrameProps<Row> {
  readonly rows: readonly Row[];
  readonly listRef: (node: HTMLElement | null) => void;
}

type Drawn<Row> =
  | { readonly draw: (row: Row) => ReactNode; readonly Frame?: never }
  | { readonly Frame: (props: Readonly<FrameProps<Row>>) => ReactNode; readonly draw?: never };

type Shown<Page extends PagedPage, Row> = { readonly listing: Listing<Page, Row> } & Drawn<Row>;

function RowList<Row>({
  rows,
  listRef,
  draw,
}: Readonly<FrameProps<Row> & { draw: (row: Row) => ReactNode }>) {
  return (
    <ol ref={listRef} role="list" className="rl-list">
      {rows.map((row) => draw(row))}
    </ol>
  );
}

function useRowFocus<Page extends PagedPage, Row>(
  listing: Listing<Page, Row>,
  loaded: Readonly<LoadedRows>,
) {
  const list = useRef<HTMLElement>(null);
  const expectFocus = useFocusNewRows(list, loaded, {
    link: listing.focus,
    row: listing.rowSelector,
  });

  const listRef = useCallback((node: HTMLElement | null) => {
    list.current = node;
  }, []);

  return { listRef, expectFocus };
}

function Rows<Page extends PagedPage, Row>({
  ready,
  loadMore,
  listing,
  draw,
  Frame,
}: Readonly<{ ready: PagedReady<Page>; loadMore: () => void } & Shown<Page, Row>>) {
  const rows = listing.rows(ready);
  const { length } = rows;
  const { listRef, expectFocus } = useRowFocus(listing, { count: length, more: ready.more });

  const more = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      loadMore();
      expectFocus(event.detail === 0 ? length : null);
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
      {Frame === undefined ? (
        <RowList rows={rows} listRef={listRef} draw={draw} />
      ) : (
        <Frame rows={rows} listRef={listRef} />
      )}
      {ready.next === null ? null : (
        <LoadMore
          more={ready.more}
          failedText={listing.text.loadMoreFailed}
          disabled={ready.more === "loading"}
          loadMore={more}
        />
      )}
    </section>
  );
}

function Body<Page extends PagedPage, Row>({
  state,
  loadMore,
  ...shown
}: Readonly<{ state: Paged<Page>; loadMore: () => void } & Shown<Page, Row>>) {
  const { listing } = shown;

  switch (state.status) {
    case "loading":
      return <Skeleton label={listing.text.loading} row="rl-row" title="rl-title" />;
    case "failed":
      return null;
    case "ready":
      return listing.rows(state).length === 0 ? (
        <PageEmpty heading={listing.text.emptyHeading} line={listing.emptyLine(state)}>
          {listing.emptyFoot?.(state)}
        </PageEmpty>
      ) : (
        <Rows ready={state} loadMore={loadMore} {...shown} />
      );
    default:
      return state satisfies never;
  }
}

export function ListPage<Page extends PagedPage, Row>({
  source,
  notice = null,
  ...shown
}: Readonly<{ source: Source<Page>; notice?: string | null } & Shown<Page, Row>>) {
  const { state, retry, loadMore } = source;
  const { listing } = shown;
  const loading = state.status === "loading";

  const retryLoad = useCallback(() => {
    void retry();
  }, [retry]);

  return (
    <PageFrame title={listing.text.title} ready={!loading}>
      <main className="pg-col rl-col" aria-busy={loading}>
        {notice === null ? null : <p className="rd-note">{notice}</p>}
        <RetryNotice
          failed={state.status === "failed"}
          text={listing.text.loadFailed}
          action={retryLoad}
        />
        <Body state={state} loadMore={loadMore} {...shown} />
      </main>
    </PageFrame>
  );
}
