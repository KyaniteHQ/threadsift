import { KnownDisagreements } from "./KnownDisagreements.tsx";
import { EmptyState, Notice, Skeleton } from "./ListBody.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Route } from "./routing.ts";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { TopicItemsSection } from "./TopicItemsSection.tsx";
import { TopicOverview } from "./TopicOverview.tsx";
import { type TopicState, useTopicPage } from "./use-topic-page.ts";

function Loading() {
  return <Skeleton label={TOPIC_PAGE.loading} row="rl-row" title="rl-title" />;
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
          <KnownDisagreements disagreements={state.disagreements} navigate={navigate} />
          <TopicItemsSection state={state} loadMore={loadMore} navigate={navigate} />
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
  const { state, retry, loadMore, writeOverview } = useTopicPage(topicKey, route.replace);
  const name = state.status === "ready" ? state.topic.name : "";

  return (
    <div className="pg tp">
      <PageBar
        title={name}
        back={back}
        backLabel={TOPIC_PAGE.back}
        ready={state.status !== "loading"}
      />
      <main className="pg-col rl-col" aria-busy={state.status === "loading"}>
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
