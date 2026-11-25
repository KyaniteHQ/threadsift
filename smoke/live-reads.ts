import { type APIRequestContext, expect, test } from "@playwright/test";

import { catalogKey } from "../src/core/contract/catalog-key.ts";
import {
  ItemDetailResponseSchema,
  ItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import type { SaveItemInput } from "../src/core/contract/save-wire.ts";
import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { topicApiPath } from "../src/core/contract/topic-path.ts";
import { savedItem } from "./saved-item.ts";

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

export async function pasteAndSettle(
  request: APIRequestContext,
  input: Readonly<SaveItemInput>,
): Promise<number> {
  const id = await savedItem(request, input);

  await expect
    .poll(
      async () => {
        const status = await request.get(`/api/items/${String(id)}/status`);

        return ItemResponseSchema.parse(await status.json()).item.status;
      },
      { message: `${input.url} leaves processing`, timeout: 60_000 },
    )
    .not.toBe("processing");

  const settled = await request.get(`/api/items/${String(id)}/status`);
  const { fetch: result, status } = ItemResponseSchema.parse(await settled.json()).item;

  expect({ status, fetch: result }, `${input.url} is read`).toEqual({
    status: "ready",
    fetch: "ok",
  });

  return id;
}

export function pasteStep(
  request: APIRequestContext,
  label: string,
  input: Readonly<SaveItemInput>,
): Promise<number> {
  return test.step(`Paste ${label} and read it`, () => pasteAndSettle(request, input));
}
