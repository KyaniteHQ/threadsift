import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { inspect } from "node:util";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import type { Instance, Json } from "./instance.ts";

export const SETTLE_DEADLINE_MS = 20_000;

const POLL_MS = 25;

const REFUSED_ADDRESS = "http://127.0.0.1:9/v1";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.";

export const REDDIT_THREAD = [
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t3",
          data: {
            id: "q1",
            title: "A thread",
            author: "asker",
            subreddit: "science",
            selftext: "Nothing to see.",
            created_utc: 1_700_000_000,
            num_comments: 1,
          },
        },
      ],
    },
  },
  {
    kind: "Listing",
    data: {
      children: [
        {
          kind: "t1",
          data: {
            id: "c1",
            author: "someone",
            body: "A quasar decoder remark that explains the lattice trick in detail.",
            parent_id: "t3_q1",
            score: 5,
            created_utc: 1_700_000_100,
            replies: "",
          },
        },
      ],
    },
  },
];

interface Fixture {
  readonly title: string;
  readonly topic?: string;
  readonly tags?: readonly string[];
  readonly summary?: string;
  readonly pageTitle?: string;
  readonly postText?: string;
  readonly content?: Json;
  readonly noDigest?: boolean;
  readonly kept?: readonly string[];
  readonly url?: string;
}

export async function saveProvider(instance: Instance): Promise<void> {
  const saved = await instance.send("PUT", "/api/settings/ai", {
    provider: "openai-compatible",
    baseUrl: REFUSED_ADDRESS,
    model: "offline",
    key: "not-used",
  });

  assert.equal(saved.status, 200);
}

const LAST_STATE = { depth: 3, maxArrayLength: 10, maxStringLength: 200, breakLength: Infinity };

export function until<Value, Done extends Value>(
  what: string,
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => value is Done,
): Promise<Done>;
export function until<Value>(
  what: string,
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value>;
export async function until<Value>(
  what: string,
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value> {
  const deadline = Date.now() + SETTLE_DEADLINE_MS;
  let value = await read();

  while (!isDone(value)) {
    if (Date.now() >= deadline) {
      assert.fail(
        `${what} did not happen before the deadline; the last state was ${inspect(value, LAST_STATE)}`,
      );
    }

    // oxlint-disable-next-line eslint/no-await-in-loop -- Each read waits for the previous poll to end.
    await delay(POLL_MS);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each read waits for the previous poll to end.
    value = await read();
  }

  return value;
}

export function inOrder<Item>(
  items: readonly Item[],
  step: (item: Item) => Promise<void>,
): Promise<void> {
  return items.reduce<Promise<void>>(
    (done, item) => done.then(() => step(item)),
    Promise.resolve(),
  );
}

export async function pasteInOrder(
  instance: Instance,
  fixtures: readonly (readonly [string, Fixture])[],
): Promise<number[]> {
  const ids: number[] = [];

  await inOrder(fixtures, async ([slug, fixture]) => {
    ids.push(await paste(instance, slug, fixture));
  });

  return ids;
}

export async function paste(instance: Instance, slug: string, fixture: Fixture): Promise<number> {
  const filler = Array.from({ length: 6 }, () => SENTENCE).join("\n\n");

  const page = {
    markdown: fixture.postText === undefined ? filler : `${fixture.postText}\n\n${filler}`,
    title: fixture.pageTitle ?? "A page",
  };

  const digest = {
    title: fixture.title,
    topic: fixture.topic ?? "Reading",
    tags: fixture.tags ?? [],
    summary: fixture.summary ?? "A short summary.",
    keyPoints: ["One point"],
    keptComments: fixture.kept ?? [],
  };

  const url = fixture.url ?? `https://example.com/related/${slug}`;
  const supplied = fixture.content === undefined ? { page } : { content: fixture.content };
  const request = fixture.noDigest === true ? { url, ...supplied } : { url, ...supplied, digest };

  const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, request);

  await instance.settledItem(item.id);
  if (fixture.noDigest !== true) {
    await until(
      `Item ${String(item.id)} has a Digest`,
      async () => (await instance.detail(item.id)).digest,
      (stored) => stored !== null,
    );
  }

  return item.id;
}
