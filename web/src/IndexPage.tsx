import { useCallback } from "react";

import type { IndexTopic, TopicIndex } from "../../src/core/topic-index-contract.ts";
import { INDEX_PAGE, indexHeadLabel } from "./index-text.ts";
import { IndexRow } from "./IndexRow.tsx";
import { type Listing, ListPage } from "./ListPage.tsx";
import type { Pages } from "./routing.ts";
import { useIndexPage } from "./use-index-page.ts";

const LISTING: Listing<TopicIndex, IndexTopic> = {
  text: INDEX_PAGE,
  focus: ".rl-open",
  head: ({ total }) => indexHeadLabel(total),
  emptyLine: () => INDEX_PAGE.emptyLine,
  rows: ({ topics }) => topics,
};

export function IndexPage({ pages, back }: Readonly<{ pages: Pages; back: () => void }>) {
  const source = useIndexPage();

  const draw = useCallback(
    (topic: IndexTopic) => <IndexRow key={topic.key} topic={topic} open={pages.topic} />,
    [pages],
  );

  return <ListPage source={source} listing={LISTING} draw={draw} back={back} />;
}
