import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import type { Instance, Json } from "./instance.ts";

export const SECRET_KEY = "0".repeat(64);

const REFUSED_ADDRESS = "http://127.0.0.1:9/v1";

const DEADLINE_MS = 20_000;

const POLL_MS = 25;

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

export interface Fixture {
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

export async function until<Value>(
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value> {
  const deadline = Date.now() + DEADLINE_MS;
  let value = await read();

  while (!isDone(value)) {
    assert.ok(Date.now() < deadline, "the state did not settle before its deadline");
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each read waits for the previous poll to end.
    await delay(POLL_MS);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each read waits for the previous poll to end.
    value = await read();
  }

  return value;
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
  await until(
    () => instance.detail(item.id),
    (detail) => fixture.noDigest === true || detail.digest !== null,
  );

  return item.id;
}

export function rows<Schema extends z.ZodType>(
  instance: Instance,
  schema: Schema,
  query: string,
  ...params: readonly (string | number)[]
): z.infer<Schema>[] {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    return database
      .prepare(query)
      .all(...params)
      .map((row) => schema.parse(row));
  } finally {
    database.close();
  }
}

export function exec(
  instance: Instance,
  query: string,
  ...params: readonly (string | number | null)[]
) {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database.prepare(query).run(...params);
  } finally {
    database.close();
  }
}

const TaskSchema = z.object({
  id: z.number(),
  inputs: z.string(),
  input_revision: z.number(),
  state: z.string(),
  refusal: z.string().nullable(),
  item_id: z.number(),
});

export function pickTasks(instance: Instance, itemId: number) {
  return rows(
    instance,
    TaskSchema,
    "select id, inputs, input_revision, state, refusal, item_id from ai_tasks where kind = 'related_pick' and item_id = ? order by id",
    itemId,
  );
}

export async function firstPickTask(instance: Instance, itemId: number) {
  const [task] = await until(
    () => pickTasks(instance, itemId),
    (tasks) => tasks.some(({ state }) => state !== "running"),
  );

  assert.ok(task !== undefined);

  return task;
}

const InputSchema = z.object({
  source: z.object({
    id: z.number(),
    title: z.string(),
    topic: z.string(),
    tags: z.array(z.string()),
    summary: z.string(),
  }),
  candidates: z.array(
    z.object({ id: z.number(), title: z.string(), topic: z.string(), summary: z.string() }),
  ),
});

export function sentInput(inputs: string) {
  return InputSchema.parse(JSON.parse(inputs));
}

const PairSchema = z.object({
  item_id: z.number(),
  related_id: z.number(),
  position: z.number(),
  reason: z.string(),
});

export function pairsOf(instance: Instance, itemId: number) {
  return rows(
    instance,
    PairSchema,
    "select item_id, related_id, position, reason from related_items where item_id = ? order by position",
    itemId,
  );
}

const JobSchema = z.object({
  id: z.number(),
  kind: z.string(),
  state: z.string(),
  attempts: z.number(),
});

export function pickJobs(instance: Instance, itemId: number) {
  return rows(
    instance,
    JobSchema,
    "select id, kind, state, attempts from jobs where kind = 'related_pick' and item_id = ? order by id",
    itemId,
  );
}

export async function pasteInOrder(
  instance: Instance,
  fixtures: readonly (readonly [string, Fixture])[],
): Promise<number[]> {
  const ids: number[] = [];

  for (const [slug, fixture] of fixtures) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Items are saved one after the other so their ids rise in order.
    ids.push(await paste(instance, slug, fixture));
  }

  return ids;
}
