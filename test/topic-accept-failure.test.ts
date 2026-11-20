import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/contract/proposal-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { mergesOf } from "./lost-highlight-fixtures.ts";
import { script } from "./pin-fixtures.ts";
import { exec, paste } from "./related-fixtures.ts";
import {
  acceptsAtOnce,
  proposeTopics,
  topicId,
  topicMergeLines,
  unchanged,
  withLibrary,
} from "./topic-accept-fixtures.ts";

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
  let proposal = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "loser", { title: "Loser", topic: "Loser" });
    await paste(instance, "keeper", { title: "Keeper", topic: "Survivor" });
    survivor = topicId(instance, "Survivor");
    proposal = proposeTopics(instance, ["Loser", "Survivor"], "accepting");
    exec(instance, "update proposals set moved = 0, unit_revision = 1 where id = ?", proposal);
    exec(
      instance,
      "insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'loser', 'Loser', ?, 1)",
      survivor,
    );
  });

  after(() => instance.close());

  it("finishes an accepting Topic row with one merge-topic entry", async () => {
    await sweep(instance);

    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 1 Items"]);
  });

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
