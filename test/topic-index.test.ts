import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { TopicIndexSchema } from "../src/core/topic-index-contract.ts";
import { CreatedTokenResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { Instance, type Json } from "./instance.ts";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.";

const PAGE = { markdown: Array.from({ length: 6 }, () => SENTENCE).join("\n\n"), title: "A page" };

function digestFor(topic: string, title: string): Json {
  return {
    title,
    topic,
    tags: ["notes"],
    summary: `${title} in two lines.`,
    keyPoints: [`${title} in one line`],
  };
}

async function save(instance: Instance, slug: string, topic: string): Promise<number> {
  const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
    url: `https://example.com/index/${slug}`,
    page: PAGE,
    digest: digestFor(topic, `Item ${slug}`),
  });

  await instance.settledItem(item.id);

  return item.id;
}

function storeOverview(
  instance: Instance,
  key: string,
  overview: string,
  failure: string | null,
): void {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database
      .prepare(
        "insert into topic_pages (topic_id, overview, revision, built_from, failure, updated_at) values ((select id from topics where key = ?), ?, 1, '[]', ?, ?)",
      )
      .run(key, overview, failure, Date.now());
  } finally {
    database.close();
  }
}

const read = (instance: Instance, query = "") =>
  instance.read("GET", `/api/topics${query}`, TopicIndexSchema);

describe("the Index lists every Topic once, ascending by key, with its Item count and overview line", () => {
  let instance: Instance;
  let ferries = 0;
  let gone = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    ferries = await save(instance, "ferries", "İstanbul");
    await save(instance, "bridges", "istanbul");
    await save(instance, "embeddings", "AI/ML");
    await save(instance, "plain", "Zebras");
    gone = await save(instance, "gone", "Gone");

    storeOverview(
      instance,
      "istanbul",
      `\nFerries cross the Bosphorus all day [${String(ferries)}] [12]\nThe bridges join the two shores [3]`,
      null,
    );
    storeOverview(instance, "ai/ml", "Vectors for text [the docs] [12][13]", "gave-up");
  });

  after(() => instance.close());

  it("gives İstanbul and istanbul one row, in the order of the keys", async () => {
    const { topics, total, next } = await read(instance);

    assert.deepEqual(
      topics.map(({ key, name, itemCount }) => [key, name, itemCount]),
      [
        ["ai/ml", "AI/ML", 1],
        ["gone", "Gone", 1],
        ["istanbul", "İstanbul", 2],
        ["zebras", "Zebras", 1],
      ],
    );
    assert.equal(total, 4);
    assert.equal(next, null);
  });

  it("shows the first line of a stored overview without its trailing marks, and null without an overview", async () => {
    const { topics } = await read(instance);

    assert.deepEqual(
      topics.map(({ key, overviewLine }) => [key, overviewLine]),
      [
        ["ai/ml", "Vectors for text [the docs]"],
        ["gone", null],
        ["istanbul", "Ferries cross the Bosphorus all day"],
        ["zebras", null],
      ],
    );
  });

  it("answers the owner's session and an agent token alike, and refuses a signed-out call", async () => {
    const { value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "reader",
    });

    const owner = await instance.send("GET", "/api/topics");
    const agent = await instance.sendWithToken(value, "GET", "/api/topics");

    assert.equal(agent.status, 200);
    assert.equal(agent.body, owner.body);
    assert.equal((await instance.fetch("/api/topics")).status, 401);
    assert.equal((await instance.sendWithToken("wrong", "GET", "/api/topics")).status, 401);
  });

  it("lowers the count when an Item is deleted and keeps a Topic left with none", async () => {
    assert.equal((await instance.send("DELETE", `/api/items/${String(ferries)}`)).status, 204);
    assert.equal((await instance.send("DELETE", `/api/items/${String(gone)}`)).status, 204);

    const { topics } = await read(instance);

    assert.deepEqual(
      topics.map(({ key, itemCount }) => [key, itemCount]),
      [
        ["ai/ml", 1],
        ["gone", 0],
        ["istanbul", 1],
        ["zebras", 1],
      ],
    );
  });

  it("refuses a cursor longer than 500 characters", async () => {
    assert.equal((await instance.send("GET", `/api/topics?cursor=${"a".repeat(501)}`)).status, 400);
    assert.equal((await instance.send("GET", `/api/topics?cursor=${"a".repeat(500)}`)).status, 200);
  });
});

describe("the Index pages through 51 Topics", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    await Promise.all(
      Array.from({ length: 51 }, (_, at) => {
        const name = `Topic ${String(at).padStart(2, "0")}`;

        return save(instance, `page-${String(at)}`, name);
      }),
    );
  });

  after(() => instance.close());

  it("gives a page of 50 and a second page of 1, each Topic once", async () => {
    const first = await read(instance);

    assert.equal(first.topics.length, 50);
    assert.equal(first.total, 51);
    assert.equal(first.next, first.topics.at(-1)?.key);

    const second = await read(instance, `?cursor=${encodeURIComponent(first.next ?? "")}`);

    assert.deepEqual(
      second.topics.map(({ key }) => key),
      ["topic 50"],
    );
    assert.equal(second.next, null);
    assert.equal(new Set([...first.topics, ...second.topics].map(({ key }) => key)).size, 51);
  });
});
