import { INDEX_PAGE, indexHeadLabel } from "./index-text.ts";
import { IndexRow } from "./IndexRow.tsx";
import { EmptyState, Notice, RESULTS_ID, Skeleton } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Pages } from "./routing.ts";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { type IndexReady, type IndexState, useIndexPage } from "./use-index-page.ts";

function Listed({
  state,
  loadMore,
  open,
}: Readonly<{ state: IndexReady; loadMore: () => void; open: (key: string) => void }>) {
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
        className="rl-list"
      >
        {state.topics.map((topic) => (
          <IndexRow key={topic.key} topic={topic} open={open} />
        ))}
      </ol>
      {state.next === null ? null : (
        <LoadMore more={state.more} failedText={INDEX_PAGE.loadMoreFailed} loadMore={loadMore} />
      )}
    </section>
  );
}

function Body({
  state,
  retry,
  loadMore,
  open,
}: Readonly<{
  state: IndexState;
  retry: () => void;
  loadMore: () => void;
  open: (key: string) => void;
}>) {
  switch (state.status) {
    case "loading":
      return <Skeleton label={INDEX_PAGE.loading} row="rl-row" title="rl-title" />;
    case "failed":
      return <Notice text={INDEX_PAGE.loadFailed} action={retry} label={RETRY_LABEL} alert />;
    case "ready":
      return state.topics.length === 0 ? (
        <EmptyState heading={INDEX_PAGE.emptyHeading} line={INDEX_PAGE.emptyLine} />
      ) : (
        <Listed state={state} loadMore={loadMore} open={open} />
      );
    default:
      return state satisfies never;
  }
}

export function IndexPage({ pages, back }: Readonly<{ pages: Pages; back: () => void }>) {
  const { state, retry, loadMore } = useIndexPage();

  return (
    <div className="pg ix">
      <PageBar
        title={INDEX_PAGE.title}
        back={back}
        backLabel={TOPIC_PAGE.back}
        ready={state.status !== "loading"}
      />
      <main className="pg-col rl-col" aria-busy={state.status === "loading"}>
        <Body state={state} retry={retry} loadMore={loadMore} open={pages.topic} />
      </main>
    </div>
  );
}
