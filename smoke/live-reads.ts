import { type APIRequestContext, expect, test } from "@playwright/test";

import { catalogKey } from "../src/core/contract/catalog-key.ts";
import type { Item } from "../src/core/contract/item-wire.ts";
import type { SaveItemInput } from "../src/core/contract/save-wire.ts";
import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { topicApiPath } from "../src/core/contract/topic-path.ts";
import { itemDetail, itemStatus, savedItem } from "./saved-item.ts";

export function digestStates(request: APIRequestContext, ids: readonly number[]) {
  return Promise.all(
    ids.map(async (id) => {
      const item = await itemDetail(request, id);

      return item.digest === null ? item.digestOutcome : "digest";
    }),
  );
}

export async function digestedTopic(
  request: APIRequestContext,
  ids: readonly number[],
): Promise<string> {
  const topics = await Promise.all(
    ids.map(async (id) => (await itemDetail(request, id)).digestTopic),
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
  return (await itemDetail(request, id)).related.map((entry) => entry.id);
}

export async function itemIdle(request: APIRequestContext, id: number): Promise<boolean> {
  return (await itemStatus(request, id)).status !== "processing";
}

export async function pasteAndSettle(
  request: APIRequestContext,
  input: Readonly<SaveItemInput>,
): Promise<number> {
  const id = await savedItem(request, input);
  let settled: Item | undefined;

  await expect
    .poll(
      async () => {
        settled = await itemStatus(request, id);

        return settled.status;
      },
      { message: `${input.url} leaves processing`, timeout: 60_000 },
    )
    .not.toBe("processing");

  expect({ status: settled?.status, fetch: settled?.fetch }, `${input.url} is read`).toEqual({
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
