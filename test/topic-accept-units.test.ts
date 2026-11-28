import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { Instance } from "./instance.ts";
import { seedLogEntries } from "./log-fixtures.ts";
import { mergesOf, readPage } from "./lost-highlight-fixtures.ts";
import { pasteTopics } from "./overview-gap-fixtures.ts";
import { seedTopicItems } from "./pin-fixtures.ts";
import {
  type Library,
  answerOf,
  beforeFirstBatch,
  itemsOf,
  pinsFrom,
  proposeTopics,
  runMergesStage,
  topicId,
  topicMergeLines,
  withInstance,
  withLibrary,
} from "./topic-accept-fixtures.ts";
import { nextSweep } from "./weekly-claim-fixtures.ts";

const ITEMS = 25_002;

async function partialAccept(instance: Instance) {
  await pasteTopics(instance, { Survivor: ["survivor"], Loser: ["loser"] });
  const loser = topicId(instance, "Loser");
  seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: ITEMS - 1 });
  const proposal = proposeTopics(instance, ["Loser", "Survivor"]);
  assert.deepEqual(await answerOf(instance, proposal), [202, { state: "accepting" }]);

  return { proposal, loser };
}

async function acceptingProposal(instance: Instance) {
  await pasteTopics(instance, { Survivor: ["moved-1", "moved-2"], Loser: ["left", "last"] });
  const proposal = proposeTopics(instance, ["Loser", "Survivor"], "accepting");
  const loser = topicId(instance, "Loser");
  const survivor = topicId(instance, "Survivor");
  instance.database
    .script(`update proposals set moved = 2, unit_revision = 1 where id = ${String(proposal)};
     insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'loser', 'Loser', ${String(survivor)}, 1);`);

  return { proposal, loser };
}

describe("Accept of a Topic row that one request cannot finish", () => {
  let instance: Instance;
  let loser: number;
  let proposal: number;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    ({ loser, proposal } = await partialAccept(instance));
  });

  after(() => instance.close());

  it("answers 202 with the Pin in place and the last two Items still on the source Topic", async () => {
    assert.equal(
      instance.database.count("select count(*) as n from pins where kind = 'topic-merge'"),
      1,
    );
    const page = await instance.read("GET", "/api/topics/loser", TopicPageSchema);

    assert.equal(page.topic.name, "Loser");
    assert.equal(itemsOf(instance, loser), 2);
    assert.deepEqual(await topicMergeLines(instance), []);
  });

  it("is finished by the sweep stage with one merge-topic entry that counts every Item", async () => {
    assert.equal(
      instance.database.count(
        "select count(*) as n from proposals where id = ? and state = 'accepting'",
        proposal,
      ),
      1,
    );
    await nextSweep(instance);

    assert.equal(
      instance.database.count("select count(*) as n from topics where id = ?", loser),
      0,
    );
    assert.equal(instance.database.count("select count(*) as n from proposals"), 0);
    assert.deepEqual(await topicMergeLines(instance), [
      `Loser into Survivor | ${String(ITEMS)} Items`,
    ]);
  });
});

describe("Accept of a Topic row that the sweep continues after an Item was deleted", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("counts only the Items that moved", async () => {
    const { loser } = await acceptingProposal(instance);
    const remaining = instance.database.count(
      "select max(id) as n from items where topic_id = ?",
      loser,
    );
    assert.equal((await instance.send("DELETE", `/api/items/${String(remaining)}`)).status, 204);
    await nextSweep(instance);

    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 3 Items"]);
    assert.equal(instance.database.count("select count(*) as n from proposals"), 0);
  });
});

const unchanged = ({ instance, loser }: Library): void => {
  assert.equal(itemsOf(instance, loser), 3);
  assert.equal(instance.database.count("select count(*) as n from pins"), 0);
};

const acceptsAtOnce = async ({ instance, survivor, proposal }: Library): Promise<void> => {
  assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
  assert.equal(itemsOf(instance, survivor), 4);
};

describe("Accept of a Topic row hands back a failed first unit", () => {
  it("when the unit throws leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      instance.database.script(
        "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
      );

      assert.deepEqual(await answerOf(instance, proposal), [500, { error: "Internal error" }]);

      assert.equal(
        instance.database.count("select count(*) as n from proposals where state = 'open'"),
        1,
      );
      unchanged(library);
      instance.database.script("drop trigger test_on_pin");
      await acceptsAtOnce(library);
    }));

  it("when reading the unit throws leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      instance.database.script(
        "alter table log_entries rename column topic_id to renamed_topic_id",
      );

      assert.deepEqual(await answerOf(instance, proposal), [500, { error: "Internal error" }]);

      assert.equal(
        instance.database.count("select count(*) as n from proposals where state = 'open'"),
        1,
      );
      unchanged(library);
      instance.database.script(
        "alter table log_entries rename column renamed_topic_id to topic_id",
      );
      await acceptsAtOnce(library);
    }));
});

describe("Accept of a Topic row whose claimed merge the merges stage runs first", () => {
  it("answers done when the stage finished the merge before the request's first unit", () =>
    withLibrary(async ({ instance, loser, proposal }) => {
      const swept = beforeFirstBatch(instance, () => runMergesStage(instance));

      assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
      assert.equal(swept(), true);
      assert.equal(pinsFrom(instance, "loser"), 1);
      assert.equal(
        instance.database.count("select count(*) as n from topics where id = ?", loser),
        0,
      );
    }));

  it("answers 404 when another merge removed the row after the stage handed the claim back", () =>
    withInstance(async (instance) => {
      await pasteTopics(instance, { A: ["a"], B: ["b"], C: ["c"] });
      const a = topicId(instance, "A");
      seedTopicItems(instance, { topicId: a, name: "A", from: 1000, items: 2 });
      const first = proposeTopics(instance, ["A", "B"]);
      const second = proposeTopics(instance, ["B", "C"]);
      let secondAnswer: readonly [number, unknown] | null = null;
      const staged = beforeFirstBatch(instance, async () => {
        instance.database.script(
          "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
        );
        await runMergesStage(instance).catch(() => {});
        instance.database.script("drop trigger test_on_pin");
        secondAnswer = await answerOf(instance, second);
      });

      assert.deepEqual(await answerOf(instance, first), [404, { error: "Not found" }]);
      assert.equal(staged(), true);
      assert.deepEqual(secondAnswer, [200, { state: "done" }]);
      assert.equal(instance.database.count("select count(*) as n from topics where id = ?", a), 1);
      assert.equal(pinsFrom(instance, "a"), 0);
    }));
});

describe("the sweep stage records failed Topic merge units", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("counts each run of the merges stage whose unit fails, shows the count on the Proposals page, and finishes once the cause is gone", async () => {
    const { proposal: second } = await acceptingProposal(instance);
    instance.database.script(
      "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
    );

    const failedRuns = (): number =>
      instance.database.count(
        "select coalesce(failed_runs, 0) as n from proposals where id = ?",
        second,
      );

    const failingSweep = async (runs: number): Promise<void> => {
      await assert.rejects(nextSweep(instance), /the unit fails/u);

      assert.equal(failedRuns(), runs);
    };

    await failingSweep(1);
    await failingSweep(2);
    await failingSweep(3);

    const page = await readPage(instance);

    assert.deepEqual(
      mergesOf(page).map(({ id, state, failedRuns: shown }) => [id, state, shown]),
      [[second, "accepting", 3]],
    );
    instance.database.script("drop trigger test_on_pin");
    await nextSweep(instance);

    assert.equal(instance.database.count("select count(*) as n from proposals"), 0);
  });
});

describe("Accept of a Topic row on more Log entries than one unit holds", () => {
  let instance: Instance;
  let loser = 0;
  let survivor = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await pasteTopics(instance, { Survivor: ["survivor"], Loser: ["loser"] });
    loser = topicId(instance, "Loser");
    survivor = topicId(instance, "Survivor");
  });

  after(() => instance.close());

  it("moves more Log entries than one unit holds and writes the merge Log entry once", async () => {
    seedLogEntries(instance, { key: "loser", entries: 1001, at: "ascending" });
    assert.ok(
      instance.database.count("select count(*) as n from log_entries where topic_id = ?", loser) >=
        1001,
    );

    const id = proposeTopics(instance, ["Loser", "Survivor"]);

    const logged = instance.database.count(
      "select count(*) as n from log_entries where topic_id in (?, ?)",
      loser,
      survivor,
    );

    assert.deepEqual(await answerOf(instance, id), [200, { state: "done" }]);
    assert.equal(
      instance.database.count("select count(*) as n from topics where id = ?", loser),
      0,
    );
    assert.equal(
      instance.database.count("select count(*) as n from log_entries where topic_id = ?", survivor),
      logged,
    );
    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 1 Items"]);
  });
});
