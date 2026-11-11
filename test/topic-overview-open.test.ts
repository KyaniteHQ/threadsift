import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { TopicPageSchema } from "../src/core/topic-overview-contract.ts";
import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.";

const PAGE = { markdown: Array.from({ length: 6 }, () => SENTENCE).join("\n\n"), title: "A page" };

const SECRET_KEY = "0".repeat(64);

const REFUSED_ADDRESS = "http://127.0.0.1:9/v1";

const DIGEST_DEADLINE_MS = 20_000;

async function digestOf(instance: Instance, id: number, deadline: number) {
  const item = await instance.detail(id);

  if (item.digest !== null || Date.now() > deadline) return item;

  await delay(50);

  return digestOf(instance, id, deadline);
}

describe("a published Digest opens the Topic overview run when a Provider is saved", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("publishes the Digest and lists the Item on its Topic page", async () => {
    const saved = await instance.send("PUT", "/api/settings/ai", {
      provider: "openai-compatible",
      baseUrl: REFUSED_ADDRESS,
      model: "offline",
      key: "not-used",
    });

    assert.equal(saved.status, 200);

    const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
      url: "https://example.com/opens/overview",
      page: PAGE,
      digest: {
        title: "Opens an overview",
        topic: "Overview runs",
        tags: ["jobs"],
        summary: "A published Digest queues the overview.",
        keyPoints: ["The overview run starts after the Digest"],
      },
    });

    await instance.settledItem(item.id);

    const published = await digestOf(instance, item.id, Date.now() + DIGEST_DEADLINE_MS);

    assert.deepEqual(
      {
        published: published.digest !== null,
        outcome: published.digestOutcome,
        topic: published.digestTopic,
      },
      { published: true, outcome: "none", topic: "Overview runs" },
    );
    assert.equal((await instance.send("GET", "/api/topics/overview%20runs")).status, 200);
  });
});

const OVERVIEW_DEADLINE_MS = 20_000;

const TOPIC = "Removals";

const TOPIC_PATH = "/api/topics/removals";

async function overviewSettled(instance: Instance, deadline: number) {
  const page = await instance.read("GET", TOPIC_PATH, TopicPageSchema);

  if (page.overview.state !== "pending" || Date.now() > deadline) return page;

  await delay(50);

  return overviewSettled(instance, deadline);
}

async function saveAndPublish(instance: Instance, slug: string): Promise<number> {
  const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
    url: `https://example.com/removals/${slug}`,
    page: PAGE,
    digest: {
      title: `Removal ${slug}`,
      topic: TOPIC,
      tags: ["jobs"],
      summary: `The ${slug} Item.`,
      keyPoints: [`The ${slug} Item in one line`],
    },
  });

  await instance.settledItem(item.id);
  await digestOf(instance, item.id, Date.now() + DIGEST_DEADLINE_MS);

  return item.id;
}

function storeOverview(instance: Instance, overview: string): void {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    const [topic] = database.prepare("select id from topics where key = 'removals'").all();

    const sources = database
      .prepare("select item_id as item, task_id as digest from digests")
      .all();

    database
      .prepare(
        "insert into topic_pages (topic_id, overview, revision, built_from, failure, updated_at) values (?, ?, 1, ?, null, ?)",
      )
      .run(Number(topic?.["id"]), overview, JSON.stringify(sources), Date.now());
  } finally {
    database.close();
  }
}

async function removeAndWrite(instance: Instance, id: number) {
  const saved = await instance.send("PUT", "/api/settings/ai", {
    provider: "openai-compatible",
    baseUrl: REFUSED_ADDRESS,
    model: "offline",
    key: "not-used",
  });

  assert.equal(saved.status, 200);
  assert.equal((await instance.send("DELETE", `/api/items/${String(id)}`)).status, 204);
  assert.equal((await instance.send("POST", `${TOPIC_PATH}/overview`)).status, 202);

  const { overview, topic } = await overviewSettled(instance, Date.now() + OVERVIEW_DEADLINE_MS);

  return {
    state: overview.state,
    failure: overview.failure,
    text: overview.text,
    builtFrom: overview.builtFrom,
    items: topic.itemCount,
  };
}

describe("a removed Item leaves the overview without a model call when nothing was added", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("keeps the text when no line cites the removed Item", async () => {
    const kept = await saveAndPublish(instance, "kept");
    const removed = await saveAndPublish(instance, "removed");

    storeOverview(instance, `Only one Item matters [${String(kept)}]`);

    assert.deepEqual(await removeAndWrite(instance, removed), {
      state: "idle",
      failure: null,
      text: `Only one Item matters [${String(kept)}]`,
      builtFrom: 1,
      items: 1,
    });
  });
});

describe("a removed Item that lines cite leaves those lines, without a model call", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("drops its id from shared lines and drops the lines it alone supports", async () => {
    const first = await saveAndPublish(instance, "first");
    const second = await saveAndPublish(instance, "second");
    const removed = await saveAndPublish(instance, "removed");

    const [one, two, gone] = [first, second, removed].map(String);

    storeOverview(
      instance,
      `About the first [${one}]\nAbout both [${two}][${gone}]\nAbout the removed one [${gone}]`,
    );

    assert.deepEqual(await removeAndWrite(instance, removed), {
      state: "idle",
      failure: null,
      text: `About the first [${one}]\nAbout both [${two}]`,
      builtFrom: 2,
      items: 2,
    });
  });
});
