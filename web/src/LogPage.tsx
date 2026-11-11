import { EmptyState, Notice, Skeleton } from "./ListBody.tsx";
import { localDate } from "./log-date.ts";
import { LOG_PAGE, logEmptyLine } from "./log-text.ts";
import { LogList } from "./LogList.tsx";
import { PageBar } from "./PageBar.tsx";
import type { Pages } from "./routing.ts";
import { RETRY_LABEL } from "./text.ts";
import { TOPIC_PAGE } from "./topic-text.ts";
import { type LogState, useLogPage } from "./use-log-page.ts";

function Body({
  state,
  retry,
  loadMore,
  pages,
}: Readonly<{ state: LogState; retry: () => void; loadMore: () => void; pages: Pages }>) {
  switch (state.status) {
    case "loading":
      return <Skeleton label={LOG_PAGE.loading} row="lg-row" title="rl-title" />;
    case "failed":
      return <Notice text={LOG_PAGE.loadFailed} action={retry} label={RETRY_LABEL} alert />;
    case "ready":
      return state.entries.length === 0 ? (
        <EmptyState
          heading={LOG_PAGE.emptyHeading}
          line={logEmptyLine(localDate(state.startedAt))}
        />
      ) : (
        <LogList state={state} loadMore={loadMore} pages={pages} />
      );
    default:
      return state satisfies never;
  }
}

export function LogPage({ pages, back }: Readonly<{ pages: Pages; back: () => void }>) {
  const { state, retry, loadMore } = useLogPage();

  return (
    <div className="pg lg">
      <PageBar
        title={LOG_PAGE.title}
        back={back}
        backLabel={TOPIC_PAGE.back}
        ready={state.status !== "loading"}
      />
      <main className="pg-col rl-col" aria-busy={state.status === "loading"}>
        <Body state={state} retry={retry} loadMore={loadMore} pages={pages} />
      </main>
    </div>
  );
}
