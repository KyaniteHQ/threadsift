import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { script } from "./pin-fixtures.ts";
import { exec, paste } from "./related-fixtures.ts";
import {
  acceptsAtOnce,
  answerOf,
  heldLeases,
  holdLease,
  itemsOf,
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

describe("Accept of a Topic row releases every lease it claimed on every exit", () => {
  it("answers topic-busy and changes nothing when the first lease is taken", () =>
    withLibrary(async (library) => {
      const { instance, loser, proposal } = library;

      holdLease(instance, loser, "topic_overview:1:1:0");

      assert.deepEqual(await answerOf(instance, proposal), [409, { error: "topic-busy" }]);
      assert.equal(count(instance, "select count(*) as n from proposals where state = 'open'"), 1);
      assert.equal(heldLeases(instance), 1);
      unchanged(library);
    }));

  it("releases the first lease when the second claim finds one taken, and accepts at once after the holder ends", () =>
    withLibrary(async (library) => {
      const { instance, survivor, proposal } = library;

      holdLease(instance, survivor, "topic_overview:1:1:0");

      assert.deepEqual(await answerOf(instance, proposal), [409, { error: "topic-busy" }]);
      assert.equal(heldLeases(instance), 1);
      unchanged(library);
      exec(instance, "update topic_leases set expires_at = 0");
      await acceptsAtOnce(library);
    }));

  it("releases both leases when a Reject lands between the claims and the batch, and then answers not-open", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(
        instance,
        "create trigger test_on_lease_insert after insert on topic_leases when new.holder like 'topic_merge:%' begin update proposals set state = 'rejected'; end;",
      );

      assert.deepEqual(await answerOf(instance, proposal), [409, { error: "not-open" }]);
      assert.equal(heldLeases(instance), 0);
      unchanged(library);
    }));

  it("releases both leases when the row is deleted between the claims and the batch, as a key merge that makes both Topics one does, and then answers 404", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(
        instance,
        "create trigger test_on_lease_insert after insert on topic_leases when new.holder like 'topic_merge:%' begin delete from proposals; end;",
      );

      assert.equal((await accept(instance, proposal)).status, 404);
      assert.equal(heldLeases(instance), 0);
      unchanged(library);
    }));

  it("releases both leases when the unit throws, leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(
        instance,
        "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
      );

      assert.equal((await accept(instance, proposal)).status, 500);
      assert.equal(heldLeases(instance), 0);
      assert.equal(count(instance, "select count(*) as n from proposals where state = 'open'"), 1);
      unchanged(library);
      script(instance, "drop trigger test_on_pin");
      await acceptsAtOnce(library);
    }));

  it("releases both leases when reading the unit throws, leaves the row open, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, proposal } = library;

      script(instance, "alter table log_entries rename column topic_id to renamed_topic_id");

      assert.equal((await accept(instance, proposal)).status, 500);
      assert.equal(heldLeases(instance), 0);
      assert.equal(count(instance, "select count(*) as n from proposals where state = 'open'"), 1);
      unchanged(library);
      script(instance, "alter table log_entries rename column renamed_topic_id to topic_id");
      await acceptsAtOnce(library);
    }));

  it("writes nothing when another holder takes a lease between the claim and the batch, and releases the one it still holds", () =>
    withLibrary(async (library) => {
      const { instance, loser, survivor, proposal } = library;

      script(
        instance,
        `create trigger test_takeover after insert on topic_leases when new.topic_id = ${String(survivor)} begin update topic_leases set holder = 'someone else' where topic_id = new.topic_id; end;`,
      );

      assert.deepEqual(await answerOf(instance, proposal), [409, { error: "topic-busy" }]);
      assert.equal(
        count(
          instance,
          "select count(*) as n from topic_leases where topic_id = ? and expires_at > ?",
          loser,
          Date.now(),
        ),
        0,
      );
      assert.equal(heldLeases(instance), 1);
      unchanged(library);
    }));

  it("releases the first lease when the second claim throws, and accepts at once after the cause is gone", () =>
    withLibrary(async (library) => {
      const { instance, survivor, proposal } = library;

      script(
        instance,
        `create trigger test_on_lease_insert before insert on topic_leases when new.topic_id = ${String(survivor)} begin select raise(abort, 'the claim fails'); end;`,
      );

      assert.equal((await accept(instance, proposal)).status, 500);
      assert.equal(heldLeases(instance), 0);
      unchanged(library);
      script(instance, "drop trigger test_on_lease_insert");
      await acceptsAtOnce(library);
    }));
});

describe("the sweep stage continues an accepting Topic row and frees its leases on every exit", () => {
  let instance: Instance;
  let loser = 0;
  let survivor = 0;
  let proposal = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "loser", { title: "Loser", topic: "Loser" });
    await paste(instance, "keeper", { title: "Keeper", topic: "Survivor" });
    loser = topicId(instance, "Loser");
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

  it("leaves the row accepting and writes nothing while a lease is taken", async () => {
    holdLease(instance, survivor, "topic_overview:1:1:0");
    await sweep(instance);

    assert.equal(count(instance, "select unit_revision as n from proposals"), 1);
    assert.equal(itemsOf(instance, loser), 1);
    assert.equal(heldLeases(instance), 1);
  });

  it("frees its leases and writes nothing when another runner moves the unit revision under every unit, and leaves the row accepting", async () => {
    exec(instance, "update topic_leases set expires_at = 0");
    script(
      instance,
      "create trigger test_on_lease_update after update on topic_leases when new.holder like 'topic_merge:%' begin update proposals set unit_revision = unit_revision + 1; end; create trigger test_on_lease_insert after insert on topic_leases when new.holder like 'topic_merge:%' begin update proposals set unit_revision = unit_revision + 1; end;",
    );
    await sweep(instance);

    assert.equal(
      count(instance, "select count(*) as n from proposals where state = 'accepting'"),
      1,
    );
    assert.equal(itemsOf(instance, loser), 1);
    assert.equal(heldLeases(instance), 0);
    script(instance, "drop trigger test_on_lease_update; drop trigger test_on_lease_insert");
  });

  it("finishes once the cause is gone, with one merge-topic entry", async () => {
    await sweep(instance);

    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 1 Items"]);
    assert.equal(heldLeases(instance), 0);
  });
});
