import { type TopicIndex, TopicIndexSchema } from "../../src/core/topic-index-contract.ts";
import { parsedFrom, withCursor } from "./calls.ts";

export function fetchTopicIndex(cursor: string | null): Promise<TopicIndex> {
  return parsedFrom("GET", withCursor("/api/topics", cursor), TopicIndexSchema);
}
