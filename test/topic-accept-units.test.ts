import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { Instance } from "./instance.ts";
import { seedLogEntries } from "./log-fixtures.ts";
import { mergesOf, readPage } from "./lost-highlight-fixtures.ts";
import { pasteTopics } from "./overview-gap-fixtures.ts";
import { script, seedTopicItems } from "./pin-fixtures.ts";
import { count } from "./related-fixtures.ts";
import {
  answerOf,
  itemsOf,
  proposeTopics,
  topicId,
  topicMergeLines,
} from "./topic-accept-fixtures.ts";

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
  script(
    instance,
    `update proposals set moved = 2, unit_revision = 1 where id = ${String(proposal)};
     insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'loser', 'Loser', ${String(survivor)}, 1);`,
  );

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
    assert.equal(count(instance, "select count(*) as n from pins where kind = 'topic-merge'"), 1);
    const page = await instance.read("GET", "/api/topics/loser", TopicPageSchema);

    assert.equal(page.topic.name, "Loser");
    assert.equal(itemsOf(instance, loser), 2);
    assert.deepEqual(await topicMergeLines(instance), []);
  });

  it("is finished by the sweep stage with one merge-topic entry that counts every Item", async () => {
    assert.equal(
      count(
        instance,
        "select count(*) as n from proposals where id = ? and state = 'accepting'",
        proposal,
      ),
      1,
    );
    await sweep(instance);

    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
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
    const remaining = count(instance, "select max(id) as n from items where topic_id = ?", loser);
    assert.equal((await instance.send("DELETE", `/api/items/${String(remaining)}`)).status, 204);
    await sweep(instance);

    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 3 Items"]);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
  });
});

const sweep = async (instance: Instance): Promise<void> => {
  script(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
};

interface Library {
  readonly instance: Instance;
  readonly loser: number;
  readonly survivor: number;
  readonly proposal: number;
}

const withLibrary = async (run: (library: Library) => Promise<void>): Promise<void> => {
  const instance = await Instance.start();

  try {
    await instance.setUp();

    await pasteTopics(instance, { Loser: ["loser"], Survivor: ["survivor"] });

    const loser = topicId(instance, "Loser");

    seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: 2 });
    await run({
      instance,
      loser,
      survivor: topicId(instance, "Survivor"),
      proposal: proposeTopics(instance, ["Loser", "Survivor"]),
    });
  } finally {
    await instance.close();
  }
};

const unchanged = ({ instance, loser }: Library): void => {
  assert.equal(itemsOf(instance, loser), 3);
  assert.equal(count(instance, "select count(*) as n from pins"), 0);
};

const acceptsAtOnce = async ({ instance, survivor, proposal }: Library): Promise<void> => {
  assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
  assert.equal(itemsOf(instance, survivor), 4);
};

describe("Accept of a Topic row hands back a failed first unit", () => {
  it("when the unit throws leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(
        instance,
        "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
      );

      assert.deepEqual(await answerOf(instance, proposal), [500, { error: "Internal error" }]);

      assert.equal(count(instance, "select count(*) as n from proposals where state = 'open'"), 1);
      unchanged(library);
      script(instance, "drop trigger test_on_pin");
      await acceptsAtOnce(library);
    }));

  it("when reading the unit throws leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(instance, "alter table log_entries rename column topic_id to renamed_topic_id");

      assert.deepEqual(await answerOf(instance, proposal), [500, { error: "Internal error" }]);

      assert.equal(count(instance, "select count(*) as n from proposals where state = 'open'"), 1);
      unchanged(library);
      script(instance, "alter table log_entries rename column renamed_topic_id to topic_id");
      await acceptsAtOnce(library);
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
    script(
      instance,
      "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
    );

    const failedRuns = (): number =>
      count(instance, "select coalesce(failed_runs, 0) as n from proposals where id = ?", second);

    const failingSweep = async (runs: number): Promise<void> => {
      await assert.rejects(sweep(instance), /the unit fails/u);

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
    script(instance, "drop trigger test_on_pin");
    await sweep(instance);

    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
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
      count(instance, "select count(*) as n from log_entries where topic_id = ?", loser) >= 1001,
    );

    const id = proposeTopics(instance, ["Loser", "Survivor"]);

    const logged = count(
      instance,
      "select count(*) as n from log_entries where topic_id in (?, ?)",
      loser,
      survivor,
    );

    assert.deepEqual(await answerOf(instance, id), [200, { state: "done" }]);
    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where topic_id = ?", survivor),
      logged,
    );
    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 1 Items"]);
  });
});
