import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { TopicPageSchema } from "../src/core/topic-overview-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { dump } from "./pin-fixtures.ts";
import { SECRET_KEY, exec, paste, rows, saveProvider, until } from "./related-fixtures.ts";
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
  readonly loserItems: readonly number[];
  readonly survivorItems: readonly number[];
}

const withLibrary = async (
  { provider }: Readonly<{ provider: boolean }>,
  run: (library: Library) => Promise<void>,
): Promise<void> => {
  const instance = await Instance.start({ secretKey: SECRET_KEY });

  try {
    await instance.setUp();

    const loserItems = [
      await paste(instance, "l1", { title: "L1", topic: "Loser" }),
      await paste(instance, "l2", { title: "L2", topic: "Loser" }),
    ];

    const survivorItems = [
      await paste(instance, "s1", { title: "S1", topic: "Survivor" }),
      await paste(instance, "s2", { title: "S2", topic: "Survivor" }),
    ];

    if (provider) await saveProvider(instance);

    await run({ instance, loserItems, survivorItems });
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
        () => count(instance, "select max(attempts) as n from jobs where kind = 'topic_overview'"),
        (attempts) => attempts > 0,
      );
    }));

  it("adds none when the survivor's owner Item already has a queued job", () =>
    withLibrary({ provider: true }, async ({ instance, loserItems }) => {
      const [owner = 0] = loserItems;

      queue(instance, owner);
      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
        200,
      );
      assert.deepEqual(overviewJobs(instance), [owner]);
    }));

  it("records the jobs that exist when queued jobs sit on the loser's owner Item and on another Item of each Topic", () =>
    withLibrary({ provider: true }, async ({ instance, loserItems, survivorItems }) => {
      const queued = [loserItems[1] ?? 0, survivorItems[1] ?? 0];

      for (const id of queued) queue(instance, id);

      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
        200,
      );

      const [owner = 0] = loserItems;

      assert.deepEqual(
        overviewJobs(instance),
        [owner, ...queued].toSorted((a, b) => a - b),
      );
    }));

  it("opens nothing with no Provider saved, and the Topic page lists the moved Items as not in the overview yet", () =>
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
      assert.equal(
        count(instance, "select count(*) as n from jobs where kind = 'topic_overview'"),
        0,
      );
      assert.equal(
        dump(
          instance,
          "select count(*) as n from topics where id = " + String(topicId(instance, "Survivor")),
        ),
        JSON.stringify([{ n: 1 }]),
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
