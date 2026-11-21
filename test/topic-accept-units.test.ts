import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/contract/proposal-contract.ts";
import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { mergesOf } from "./lost-highlight-fixtures.ts";
import { script, seedLogEntries, seedTopicItems } from "./pin-fixtures.ts";
import { exec, paste } from "./related-fixtures.ts";
import {
  pasteTopics,
  acceptsAtOnce,
  itemsOf,
  proposeTopics,
  topicId,
  topicMergeLines,
  unchanged,
  withLibrary,
} from "./topic-accept-fixtures.ts";

describe("Accept of a Topic row that one request cannot finish", () => {
  const UNIT = 500;
  const ITEMS = 50 * UNIT + 1;
  let instance: Instance;
  let loser = 0;
  let proposal = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await pasteTopics(instance, ["Survivor", "Loser"]);
    loser = topicId(instance, "Loser");
    seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: ITEMS });
    proposal = proposeTopics(instance, ["Loser", "Survivor"]);
  });

  after(() => instance.close());

  it("answers 202 with the Pin in place and the last two Items still on the source Topic", async () => {
    const answer = await accept(instance, proposal);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [202, { state: "accepting" }]);
    assert.equal(count(instance, "select count(*) as n from pins where kind = 'topic-merge'"), 1);
    const page = await instance.read("GET", "/api/topics/loser", TopicPageSchema);

    assert.equal(page.topic.name, "Loser");
    assert.equal(itemsOf(instance, loser), 2);
    assert.deepEqual(await topicMergeLines(instance), []);
  });

  it("is finished by the sweep stage with one merge-topic entry that counts every Item", async () => {
    script(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.deepEqual(await topicMergeLines(instance), [
      `Loser into Survivor | ${String(ITEMS + 1)} Items`,
    ]);
  });
});

describe("Accept of a Topic row that the sweep continues after an Item was deleted", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await pasteTopics(instance, ["Survivor", "Loser"]);
    seedTopicItems(instance, {
      topicId: topicId(instance, "Loser"),
      name: "Loser",
      from: 1000,
      items: 10,
    });
  });

  after(() => instance.close());

  it("counts only the Items that moved", async () => {
    const id = proposeTopics(instance, ["Loser", "Survivor"], "accepting");

    exec(instance, "update proposals set moved = 0, unit_revision = 1 where id = ?", id);
    exec(
      instance,
      "insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'loser', 'Loser', ?, 1)",
      topicId(instance, "Survivor"),
    );
    assert.equal((await instance.send("DELETE", "/api/items/1005")).status, 204);
    script(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 10 Items"]);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
  });
});

const sweep = async (instance: Instance): Promise<void> => {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
};

describe("Accept of a Topic row hands back a failed first unit", () => {
  it("when the unit throws leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(
        instance,
        "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
      );

      assert.equal((await accept(instance, proposal)).status, 500);

      assert.equal(count(instance, "select count(*) as n from proposals where state = 'open'"), 1);
      unchanged(library);
      script(instance, "drop trigger test_on_pin");
      await acceptsAtOnce(library);
    }));

  it("when reading the unit throws leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(instance, "alter table log_entries rename column topic_id to renamed_topic_id");

      assert.equal((await accept(instance, proposal)).status, 500);

      assert.equal(count(instance, "select count(*) as n from proposals where state = 'open'"), 1);
      unchanged(library);
      script(instance, "alter table log_entries rename column renamed_topic_id to topic_id");
      await acceptsAtOnce(library);
    }));
});

describe("the sweep stage records failed Topic merge units", () => {
  let instance: Instance;
  let survivor = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await pasteTopics(instance, ["Survivor"]);
    survivor = topicId(instance, "Survivor");
  });

  after(() => instance.close());

  it("counts each run of the merges stage whose unit fails, shows the count on the Proposals page, and finishes once the cause is gone", async () => {
    await paste(instance, "second", { title: "Second", topic: "Second" });
    const second = proposeTopics(instance, ["Second", "Survivor"], "accepting");
    exec(instance, "update proposals set moved = 0, unit_revision = 1 where id = ?", second);
    exec(
      instance,
      "insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'second', 'Second', ?, 1)",
      survivor,
    );
    script(
      instance,
      "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
    );

    const failedRuns = (): number =>
      count(instance, "select coalesce(failed_runs, 0) as n from proposals where id = ?", second);

    const failingSweep = async (runs: number): Promise<void> => {
      await sweep(instance);

      assert.equal(failedRuns(), runs);
    };

    await failingSweep(1);
    await failingSweep(2);
    await failingSweep(3);

    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(
      mergesOf(page).map(({ id, state, failedRuns: shown }) => [id, state, shown]),
      [[second, "accepting", 3]],
    );
    script(instance, "drop trigger test_on_pin");
    await sweep(instance);

    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
  });
});

describe("Accept of a Topic row on more Items and Log entries than one unit holds", () => {
  let instance: Instance;
  let loser = 0;
  let survivor = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await pasteTopics(instance, ["Survivor", "Loser"]);
    loser = topicId(instance, "Loser");
    survivor = topicId(instance, "Survivor");
  });

  after(() => instance.close());

  it("moves more Log entries than one unit holds and writes the merge Log entry once", async () => {
    seedLogEntries(instance, { topicId: loser, name: "Loser", entries: 1001 });

    const id = proposeTopics(instance, ["Loser", "Survivor"]);

    const logged = count(
      instance,
      "select count(*) as n from log_entries where topic_id = ?",
      loser,
    );

    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [200, { state: "done" }]);
    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where topic_id = ?", survivor) >=
        logged,
      true,
    );
    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 1 Items"]);
  });
});
