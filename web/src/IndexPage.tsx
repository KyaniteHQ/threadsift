import { INDEX_PAGE, indexHeadLabel } from "./index-text.ts";
import { IndexRow } from "./IndexRow.tsx";
import { EmptyState, Notice, RESULTS_ID, Skeleton } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Pages } from "./routing.ts";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { type IndexReady, useIndexPage } from "./use-index-page.ts";

function Listed({
  state,
  loadMore,
  open,
}: Readonly<{ state: IndexReady; loadMore: () => void; open: (key: string) => void }>) {
  return (
    <section aria-labelledby={RESULTS_ID} className="tp-items">
      <header className="list-head">
        <h2 id={RESULTS_ID} className="results">
          {indexHeadLabel(state.total)}
        </h2>
        <p className="label">{INDEX_PAGE.sort}</p>
      </header>
      <ol
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from an ol with list-style none
        role="list"
        className="tp-list"
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

export function IndexPage({ pages, back }: Readonly<{ pages: Pages; back: () => void }>) {
  const { state, retry, loadMore } = useIndexPage();

  return (
    <div className="pg tp ix">
      <PageBar
        title={INDEX_PAGE.title}
        back={back}
        backLabel={TOPIC_PAGE.back}
        ready={state.status !== "loading"}
      />
      <main className="pg-col tp-col" aria-busy={state.status === "loading"}>
        {state.status === "loading" ? (
          <Skeleton label={INDEX_PAGE.loading} row="tp-it" title="tp-title" />
        ) : null}
        {state.status === "failed" ? (
          <Notice text={INDEX_PAGE.loadFailed} action={retry} label={RETRY_LABEL} alert />
        ) : null}
        {state.status === "ready" && state.topics.length === 0 ? (
          <EmptyState heading={INDEX_PAGE.emptyHeading} line={INDEX_PAGE.emptyLine} />
        ) : null}
        {state.status === "ready" && state.topics.length > 0 ? (
          <Listed state={state} loadMore={loadMore} open={pages.topic} />
        ) : null}
      </main>
    </div>
  );
}
