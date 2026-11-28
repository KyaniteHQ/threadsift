import { KnownDisagreements } from "./KnownDisagreements.tsx";
import { Skeleton } from "./ListBody.tsx";
import { PageFrame } from "./PageFrame.tsx";
import { RetryNotice } from "./RetryRegions.tsx";
import type { Route } from "./routing.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { TopicItemsSection } from "./TopicItemsSection.tsx";
import { TopicMissing } from "./TopicMissing.tsx";
import { TopicOverview } from "./TopicOverview.tsx";
import { usePageName } from "./use-document-title.ts";
import { type TopicState, useTopicPage } from "./use-topic-page.ts";

function Loading() {
  return <Skeleton label={TOPIC_PAGE.loading} row="rl-row" title="rl-title" />;
}

function Body({
  state,
  loadMore,
  write,
}: Readonly<{ state: TopicState; loadMore: () => void; write: () => void }>) {
  switch (state.status) {
    case "loading":
      return <Loading />;
    case "failed":
      return null;
    case "missing":
      return <TopicMissing />;
    case "ready":
      return (
        <>
          <TopicOverview
            overview={state.overview}
            itemCount={state.topic.itemCount}
            write={write}
          />
          <KnownDisagreements disagreements={state.disagreements} />
          <TopicItemsSection state={state} loadMore={loadMore} />
        </>
      );
    default:
      return state satisfies never;
  }
}

export function TopicPage({ topicKey, route }: Readonly<{ topicKey: string; route: Route }>) {
  const { state, retry, loadMore, writeOverview } = useTopicPage(topicKey, route.replace);
  const name = state.status === "ready" ? state.topic.name : "";
  const title = state.status === "missing" ? TOPIC_PAGE.notFoundHeading : name;
  usePageName(name);

  return (
    <PageFrame title={title} ready={title !== ""} back="index">
      <main className="pg-col rl-col" aria-busy={state.status === "loading"}>
        <RetryNotice
          failed={state.status === "failed"}
          text={TOPIC_PAGE.loadFailed}
          action={retry}
        />
        <Body state={state} loadMore={loadMore} write={writeOverview} />
      </main>
    </PageFrame>
  );
}
