import { KnownDisagreements } from "./KnownDisagreements.tsx";
import { EmptyState, Notice, Skeleton } from "./ListBody.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Route } from "./routing.ts";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { TopicItemsSection } from "./TopicItemsSection.tsx";
import { TopicOverview } from "./TopicOverview.tsx";
import { usePageName } from "./use-document-title.ts";
import { type TopicState, useTopicPage } from "./use-topic-page.ts";

function Loading() {
  return <Skeleton label={TOPIC_PAGE.loading} row="rl-row" title="rl-title" />;
}

function Body({
  state,
  retry,
  loadMore,
  write,
}: Readonly<{
  state: TopicState;
  retry: () => void;
  loadMore: () => void;
  write: () => void;
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
  usePageName(name);

  return (
    <div className="pg">
      <PageBar title={name} ready={state.status !== "loading"} />
      <main className="pg-col rl-col" aria-busy={state.status === "loading"}>
        <Body state={state} retry={retry} loadMore={loadMore} write={writeOverview} />
      </main>
    </div>
  );
}
