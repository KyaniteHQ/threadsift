import type { IndexTopic, TopicIndex } from "../../src/core/contract/topic-index-contract.ts";
import { AiSettingsLink } from "./AiSettingsLink.tsx";
import { INDEX_PAGE, indexHeadLabel } from "./index-text.ts";
import { IndexRow } from "./IndexRow.tsx";
import { type Listing, ListPage } from "./ListPage.tsx";
import { useIndexPage } from "./use-index-page.ts";

const LISTING: Listing<TopicIndex, IndexTopic> = {
  text: INDEX_PAGE,
  focus: ".rl-open",
  head: ({ total }) => indexHeadLabel(total),
  emptyLine: () => INDEX_PAGE.emptyLine,
  emptyFoot: () => <AiSettingsLink />,
  rows: ({ topics }) => topics,
};

function draw(topic: IndexTopic) {
  return <IndexRow key={topic.key} topic={topic} />;
}

export function IndexPage() {
  const source = useIndexPage();

  return <ListPage source={source} listing={LISTING} draw={draw} />;
}
