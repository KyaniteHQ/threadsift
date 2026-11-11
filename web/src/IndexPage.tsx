import { INDEX_PAGE } from "./index-text.ts";
import { IndexList } from "./IndexList.tsx";
import { EmptyState, Notice, Skeleton } from "./ListBody.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Pages } from "./routing.ts";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { type IndexState, useIndexPage } from "./use-index-page.ts";

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
        <IndexList state={state} loadMore={loadMore} open={open} />
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
