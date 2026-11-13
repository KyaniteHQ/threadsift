import { type TopicIndex, TopicIndexSchema } from "../../src/core/topic-index-contract.ts";
import { parsedFrom, withCursor } from "./calls.ts";
import { usePagedRead } from "./use-paged-read.ts";

function fetchTopicIndex(cursor: string | null): Promise<TopicIndex> {
  return parsedFrom("GET", withCursor("/api/topics", cursor), TopicIndexSchema);
}

function withMoreTopics(shown: Readonly<TopicIndex>, added: Readonly<TopicIndex>): TopicIndex {
  return { ...added, topics: [...shown.topics, ...added.topics] };
}

export function useIndexPage() {
  return usePagedRead(fetchTopicIndex, withMoreTopics);
}
