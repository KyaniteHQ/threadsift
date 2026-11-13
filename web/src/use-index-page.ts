import type { TopicIndex } from "../../src/core/topic-index-contract.ts";
import { fetchTopicIndex } from "./index-api.ts";
import { type Paged, type PagedReady, usePagedRead } from "./use-paged-read.ts";

export type IndexReady = PagedReady<TopicIndex>;

export type IndexState = Paged<TopicIndex>;

function withMoreTopics(shown: Readonly<TopicIndex>, added: Readonly<TopicIndex>): TopicIndex {
  return { ...added, topics: [...shown.topics, ...added.topics] };
}

export function useIndexPage() {
  return usePagedRead(fetchTopicIndex, withMoreTopics);
}
