import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
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

export function until<Value, Done extends Value>(
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => value is Done,
): Promise<Done>;
export function until<Value>(
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value>;
export async function until<Value>(
  read: () => Value | Promise<Value>,
  isDone: (value: Value) => boolean,
): Promise<Value> {
  const deadline = Date.now() + DEADLINE_MS;
  let value = await read();

  while (!isDone(value)) {
    if (Date.now() >= deadline) {
      assert.fail(`the state did not settle before its deadline: ${JSON.stringify(value)}`);
    }

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

type Param = string | number | null;

export function exec(instance: Instance, query: string, ...params: readonly Param[]) {
  using database = new DatabaseSync(instance.databaseFile);

  database.prepare(query).run(...params);
}

export function script(instance: Instance, statements: string): void {
  using database = new DatabaseSync(instance.databaseFile);

  database.exec(statements);
}

export function rows<Schema extends z.ZodType>(
  instance: Instance,
  schema: Schema,
  query: string,
  ...params: readonly Param[]
): z.infer<Schema>[] {
  using database = new DatabaseSync(instance.databaseFile, { readOnly: true });

  return database
    .prepare(query)
    .all(...params)
    .map((row) => schema.parse(row));
}

const CountSchema = z.object({ n: z.number() });

export function count(instance: Instance, query: string, ...params: readonly Param[]) {
  const [row] = rows(instance, CountSchema, query, ...params);
  if (row === undefined) throw new Error("The count query returned no row");

  return row.n;
}

export const catalogVersion = (instance: Instance): number =>
  count(instance, "select version as n from catalog_version where id = 1");

export function seedPair(
  instance: Instance,
  source: number,
  related: number,
  position: number,
  reason: string,
): void {
  exec(
    instance,
    "insert into related_items (item_id, related_id, position, reason) values (?, ?, ?, ?)",
    source,
    related,
    position,
    reason,
  );
}

export async function nextSweep(instance: Instance): Promise<void> {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
}

const MigrationSchema = z.object({ name: z.string() });

export const latestMigration = (instance: Instance): string | undefined =>
  rows(instance, MigrationSchema, "select max(name) as name from d1_migrations")[0]?.name;
