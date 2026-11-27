import { useState } from "react";

import { LoadMore } from "./LoadMore.tsx";
import { PageEmpty } from "./PageEmpty.tsx";
import { SORT_LABEL } from "./text.ts";
import { TOPIC_PAGE, itemsLabel } from "./topic-text.ts";
import { TopicItemRow } from "./TopicItems.tsx";
import type { TopicReady } from "./use-topic-page.ts";

function ItemList({ state }: Readonly<{ state: TopicReady }>) {
  const [now] = useState(Date.now);
  const listed = state.overview.text !== null;

  if (state.items.length === 0) {
    return <PageEmpty heading={TOPIC_PAGE.emptyHeading} line={TOPIC_PAGE.emptyLine} />;
  }

  return (
    <ol role="list" className="rl-list">
      {state.items.map((item) => (
        <TopicItemRow key={item.id} item={item} now={now} flagged={listed && !item.inOverview} />
      ))}
    </ol>
  );
}

export function TopicItemsSection({
  state,
  loadMore,
}: Readonly<{ state: TopicReady; loadMore: () => void }>) {
  return (
    <section className="rl-items">
      <header className="list-head">
        <h2 className="results">{itemsLabel(state.topic.itemCount)}</h2>
        <p className="label">{SORT_LABEL}</p>
      </header>
      <ItemList state={state} />
      {state.next === null ? null : (
        <LoadMore
          more={state.more}
          failedText={TOPIC_PAGE.loadMoreFailed}
          disabled={state.more === "loading"}
          loadMore={loadMore}
        />
      )}
    </section>
  );
}
