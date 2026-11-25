import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  OverviewRetryResponseSchema,
  TopicPageSchema,
} from "../src/core/contract/topic-overview-contract.ts";
import { accept } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { pasteTopics } from "./overview-gap-fixtures.ts";
import { SECRET_KEY, saveProvider, until, count, exec, rows } from "./related-fixtures.ts";
import { proposeTopics, topicId } from "./topic-accept-fixtures.ts";

const IdSchema = z.object({ id: z.number() });

const queue = (instance: Instance, itemId: number): void => {
  exec(
    instance,
    "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at) select 'topic_overview', id, original_url, 'queued', 0, 0, 9999999999999 from items where id = ?",
    itemId,
  );
};

const overviewJobs = (instance: Instance): readonly number[] =>
  rows(
    instance,
    z.object({ item_id: z.number() }),
    "select item_id from jobs where kind = 'topic_overview' order by item_id",
  ).map(({ item_id }) => item_id);

interface Library {
  readonly instance: Instance;
  readonly loserItems: readonly [number, number];
  readonly survivorItems: readonly [number, number];
}

const withLibrary = async (
  { provider }: Readonly<{ provider: boolean }>,
  run: (library: Library) => Promise<void>,
): Promise<void> => {
  const instance = await Instance.start({ secretKey: SECRET_KEY });

  try {
    await instance.setUp();

    const { Loser: [loserOwner, loserOther] = [], Survivor: [survivorOwner, survivorOther] = [] } =
      await pasteTopics(instance, { Loser: ["l1", "l2"], Survivor: ["s1", "s2"] });

    assert.ok(
      loserOwner !== undefined &&
        loserOther !== undefined &&
        survivorOwner !== undefined &&
        survivorOther !== undefined,
    );

    if (provider) await saveProvider(instance);

    await run({
      instance,
      loserItems: [loserOwner, loserOther],
      survivorItems: [survivorOwner, survivorOther],
    });
  } finally {
    await instance.close();
  }
};

describe("the closing writes of a Topic merge make one attempt to open an overview run for the survivor", () => {
  it("opens a topic_overview job on the survivor's owner Item when a Provider is saved and no job is open", () =>
    withLibrary({ provider: true }, async ({ instance, loserItems }) => {
      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
        200,
      );

      const [owner] = loserItems;

      assert.deepEqual(overviewJobs(instance), [owner]);
      await until(
        "a topic_overview job has spent an attempt",
        () => count(instance, "select max(attempts) as n from jobs where kind = 'topic_overview'"),
        (attempts) => attempts > 0,
      );
    }));

  it("adds none when the survivor's owner Item already has a queued job", () =>
    withLibrary({ provider: true }, async ({ instance, loserItems }) => {
      const [owner] = loserItems;

      queue(instance, owner);
      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
        200,
      );
      assert.deepEqual(overviewJobs(instance), [owner]);
    }));

  it("records the jobs that exist when queued jobs sit on the loser's owner Item and on another Item of each Topic", () =>
    withLibrary({ provider: true }, async ({ instance, loserItems, survivorItems }) => {
      const queued = [loserItems[1], survivorItems[1]];

      for (const id of queued) queue(instance, id);

      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
        200,
      );

      const [owner] = loserItems;

      assert.deepEqual(
        overviewJobs(instance),
        [owner, ...queued].toSorted((a, b) => a - b),
      );
    }));

  it("opens nothing with no Provider saved, and the survivor page lists every Item as not in the overview yet", () =>
    withLibrary({ provider: false }, async ({ instance, survivorItems }) => {
      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
        200,
      );
      assert.deepEqual(overviewJobs(instance), []);

      const page = await instance.read("GET", "/api/topics/loser", TopicPageSchema);

      assert.deepEqual(
        [
          page.topic.name,
          page.items.length,
          page.items.every(({ inOverview }) => !inOverview),
          page.overview.provider,
        ],
        ["Survivor", survivorItems.length + 2, true, false],
      );
    }));
});

describe("the overview a merge leaves behind", () => {
  it("is the survivor's own, with every moved Item uncovered", () =>
    withLibrary({ provider: false }, async ({ instance }) => {
      const survivor = topicId(instance, "Survivor");

      exec(
        instance,
        "insert into topic_pages (topic_id, overview, revision, built_from, updated_at) values (?, 'About it.', 1, '[]', 1)",
        survivor,
      );
      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
        200,
      );

      const page = await instance.read("GET", "/api/topics/survivor", TopicPageSchema);

      assert.deepEqual([page.overview.text, page.overview.builtFrom], ["About it.", 0]);
      assert.equal(rows(instance, IdSchema, "select topic_id as id from topic_pages").length, 1);
    }));
});

const OwnerSchema = z.object({ item_id: z.number() });

describe("the address of a merged-away Topic opens the Topic it was merged into", () => {
  let instance: Instance;
  let gamma = 0;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteTopics(instance, {
      ML: ["ml"],
      "Machine learning": ["machine-learning"],
      "Artificial intelligence": ["ai"],
    });
    gamma = topicId(instance, "Artificial intelligence");
    assert.equal(
      (await accept(instance, proposeTopics(instance, ["ML", "Machine learning"]))).status,
      200,
    );
  });

  after(() => instance.close());

  it("answers the survivor's page with the survivor's key for the old key in any spelling", async () => {
    const pages = await Promise.all(
      ["ml", "ML", "Ml"].map((spelling) =>
        instance.read("GET", `/api/topics/${spelling}`, TopicPageSchema),
      ),
    );

    assert.deepEqual(
      pages.map((page) => [page.topic.key, page.topic.name, page.items.length]),
      Array.from({ length: 3 }, () => ["machine learning", "Machine learning", 2]),
    );
  });

  it("answers 404 on both routes for a key that no Topic and no Pin has", async () => {
    assert.equal((await instance.send("GET", "/api/topics/nothing")).status, 404);
    assert.equal((await instance.send("POST", "/api/topics/nothing/overview")).status, 404);
  });

  describe("after both merges", () => {
    before(async () => {
      assert.equal(
        (
          await accept(
            instance,
            proposeTopics(instance, ["Machine learning", "Artificial intelligence"]),
          )
        ).status,
        200,
      );
    });

    it("resolves a chain of merges from the first merged-away key to the last survivor", async () => {
      const page = await instance.read("GET", "/api/topics/ml", TopicPageSchema);

      assert.deepEqual([page.topic.key, page.items.length], ["artificial intelligence", 3]);
    });

    it("runs Try again on the survivor for the old key", async () => {
      assert.equal(
        (await instance.read("GET", "/api/topics/ml", TopicPageSchema)).topic.key,
        "artificial intelligence",
      );
      await saveProvider(instance);

      const answer = await instance.send("POST", "/api/topics/ml/overview");

      assert.equal(answer.status, 202);
      assert.equal(
        OverviewRetryResponseSchema.parse(JSON.parse(answer.body)).overview.provider,
        true,
      );
      assert.equal(
        rows(
          instance,
          OwnerSchema,
          "select jobs.item_id from jobs join items on items.id = jobs.item_id where jobs.kind = 'topic_overview' and items.topic_id = ?",
          gamma,
        ).length > 0,
        true,
      );
      assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
    });
  });
});
