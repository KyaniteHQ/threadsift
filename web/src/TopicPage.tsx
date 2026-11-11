import { useState } from "react";

import { EmptyState, Notice, RESULTS_ID, Skeleton } from "./ListBody.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Route } from "./routing.ts";
import { LOAD_MORE, RETRY_LABEL, SORT_LABEL } from "./text.ts";
import { TOPIC_PAGE, itemsLabel } from "./topic-text.ts";
import { TopicItemRow } from "./TopicItems.tsx";
import { TopicOverview } from "./TopicOverview.tsx";
import { type TopicReady, type TopicState, useTopicPage } from "./use-topic-page.ts";

function Loading() {
  return <Skeleton label={TOPIC_PAGE.loading} row="tp-it" title="tp-title" />;
}

function moreLabel(more: TopicReady["more"]): string {
  if (more === "loading") return TOPIC_PAGE.loadingMore;

  return more === "failed" ? RETRY_LABEL : LOAD_MORE;
}

function ItemList({
  state,
  navigate,
}: Readonly<{ state: TopicReady; navigate: (to: string) => void }>) {
  const [now] = useState(Date.now);
  const listed = state.overview.text !== null;

  if (state.items.length === 0) {
    return <EmptyState heading={TOPIC_PAGE.emptyHeading} line={TOPIC_PAGE.emptyLine} />;
  }

  return (
    <ol
      // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics from an ol with list-style none
      role="list"
      className="tp-list"
    >
      {state.items.map((item) => (
        <TopicItemRow
          key={item.id}
          item={item}
          now={now}
          flagged={listed && !item.inOverview}
          navigate={navigate}
        />
      ))}
    </ol>
  );
}

function More({ state, loadMore }: Readonly<{ state: TopicReady; loadMore: () => void }>) {
  if (state.next === null) return null;

  return (
    <div className="tp-more">
      {state.more === "failed" ? (
        <p className="rd-note" role="alert">
          {TOPIC_PAGE.loadMoreFailed}
        </p>
      ) : null}
      <button
        type="button"
        className="btn"
        aria-disabled={state.more === "loading"}
        onClick={loadMore}
      >
        {moreLabel(state.more)}
      </button>
    </div>
  );
}

function Items({
  state,
  loadMore,
  navigate,
}: Readonly<{ state: TopicReady; loadMore: () => void; navigate: (to: string) => void }>) {
  return (
    <section aria-labelledby={RESULTS_ID} className="tp-items">
      <header className="list-head">
        <h2 id={RESULTS_ID} className="results">
          {itemsLabel(state.topic.itemCount)}
        </h2>
        <p className="label">{SORT_LABEL}</p>
      </header>
      <ItemList state={state} navigate={navigate} />
      <More state={state} loadMore={loadMore} />
    </section>
  );
}

function Body({
  state,
  retry,
  loadMore,
  write,
  navigate,
}: Readonly<{
  state: TopicState;
  retry: () => void;
  loadMore: () => void;
  write: () => void;
  navigate: (to: string) => void;
}>) {
  switch (state.status) {
    case "loading":
      return <Loading />;
    case "failed":
      return <Notice text={TOPIC_PAGE.loadFailed} action={retry} label={RETRY_LABEL} alert />;
    case "missing":
      return <EmptyState heading={TOPIC_PAGE.notFoundHeading} line={TOPIC_PAGE.notFoundLine} />;
    case "ready":
      return (
        <>
          <TopicOverview
            overview={state.overview}
            itemCount={state.topic.itemCount}
            write={write}
            navigate={navigate}
          />
          <Items state={state} loadMore={loadMore} navigate={navigate} />
        </>
      );
    default:
      return state satisfies never;
  }
}

export function TopicPage({
  topicKey,
  route,
  back,
}: Readonly<{ topicKey: string; route: Route; back: () => void }>) {
  const { state, retry, loadMore, writeOverview } = useTopicPage(topicKey);
  const name = state.status === "ready" ? state.topic.name : "";

  return (
    <div className="pg tp">
      <PageBar
        title={name}
        back={back}
        backLabel={TOPIC_PAGE.back}
        ready={state.status !== "loading"}
      />
      <main className="pg-col tp-col" aria-busy={state.status === "loading"}>
        <Body
          state={state}
          retry={retry}
          loadMore={loadMore}
          write={writeOverview}
          navigate={route.navigate}
        />
      </main>
    </div>
  );
}
