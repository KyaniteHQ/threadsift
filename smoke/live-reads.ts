import { type APIRequestContext, expect } from "@playwright/test";

import { catalogKey } from "../src/core/catalog-key.ts";
import { TopicPageSchema } from "../src/core/topic-overview-contract.ts";
import { topicApiPath } from "../src/core/topic-path.ts";
import { ItemDetailResponseSchema, ItemResponseSchema } from "../src/http/schemas.ts";

export function digestStates(request: APIRequestContext, ids: readonly number[]) {
  return Promise.all(
    ids.map(async (id) => {
      const answer = await request.get(`/api/items/${String(id)}`);
      const { item } = ItemDetailResponseSchema.parse(await answer.json());

      return item.digest === null ? item.digestOutcome : "digest";
    }),
  );
}

export async function digestedTopic(
  request: APIRequestContext,
  ids: readonly number[],
): Promise<string> {
  const topics = await Promise.all(
    ids.map(async (id) => {
      const answer = await request.get(`/api/items/${String(id)}`);

      return ItemDetailResponseSchema.parse(await answer.json()).item.digestTopic;
    }),
  );

  const topic = topics.find((name) => name !== null);

  if (topic === undefined || topic === null) throw new Error("no Item holds a Digest with a Topic");

  return topic;
}

export async function overviewText(
  request: APIRequestContext,
  topic: string,
): Promise<string | null> {
  const answer = await request.get(topicApiPath(catalogKey(topic)));

  expect(answer.status(), `the Topic page of ${topic}`).toBe(200);

  return TopicPageSchema.parse(await answer.json()).overview.text;
}

export async function relatedOf(
  request: APIRequestContext,
  id: number,
): Promise<readonly number[]> {
  const answer = await request.get(`/api/items/${String(id)}`);

  return ItemDetailResponseSchema.parse(await answer.json()).item.related.map((entry) => entry.id);
}

export async function itemIdle(request: APIRequestContext, id: number): Promise<boolean> {
  const status = await request.get(`/api/items/${String(id)}/status`);

  return ItemResponseSchema.parse(await status.json()).item.status !== "processing";
}
