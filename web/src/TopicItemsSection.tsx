import { useState } from "react";

import { EmptyState, RESULTS_ID } from "./ListBody.tsx";
import { LoadMore } from "./LoadMore.tsx";
import { SORT_LABEL } from "./text.ts";
import { TOPIC_PAGE, itemsLabel } from "./topic-text.ts";
import { TopicItemRow } from "./TopicItems.tsx";
import type { TopicReady } from "./use-topic-page.ts";

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
      className="rl-list"
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

export function TopicItemsSection({
  state,
  loadMore,
  navigate,
}: Readonly<{ state: TopicReady; loadMore: () => void; navigate: (to: string) => void }>) {
  return (
    <section aria-labelledby={RESULTS_ID} className="rl-items">
      <header className="list-head">
        <h2 id={RESULTS_ID} className="results">
          {itemsLabel(state.topic.itemCount)}
        </h2>
        <p className="label">{SORT_LABEL}</p>
      </header>
      <ItemList state={state} navigate={navigate} />
      {state.next === null ? null : (
        <LoadMore more={state.more} failedText={TOPIC_PAGE.loadMoreFailed} loadMore={loadMore} />
      )}
    </section>
  );
}
