import { TopicIndexSchema, type TopicIndex } from "../../src/core/topic-index-contract.ts";
import { parsedFrom } from "./calls.ts";

export function fetchTopicIndex(cursor: string | null): Promise<TopicIndex> {
  const query = cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`;

  return parsedFrom("GET", `/api/topics${query}`, TopicIndexSchema);
}
