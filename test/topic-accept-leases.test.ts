import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { script, seedTopicItems } from "./pin-fixtures.ts";
import { exec, paste } from "./related-fixtures.ts";
import {
  heldLeases,
  holdLease,
  itemsOf,
  proposeTopics,
  topicId,
  topicMergeLines,
} from "./topic-accept-fixtures.ts";

const AnswerSchema = z.object({ state: z.string().optional(), error: z.string().optional() });

const answerOf = async (instance: Instance, id: number) => {
  const { status, body } = await accept(instance, id);

  return [status, AnswerSchema.parse(JSON.parse(body))];
};

const sweep = async (instance: Instance): Promise<void> => {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
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
    await paste(instance, "loser", { title: "Loser", topic: "Loser" });
    await paste(instance, "keeper", { title: "Keeper", topic: "Survivor" });

    const loser = topicId(instance, "Loser");
    const survivor = topicId(instance, "Survivor");

    seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: 2 });
    assert.ok(loser < survivor);
    await run({
      instance,
      loser,
      survivor,
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
  assert.equal(heldLeases(instance), 0);
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

  it("releases both leases when a key merge deletes the row between the claims and the batch, and then answers 404", () =>
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

  it("frees its leases when a Reject-like change moves the unit revision under every unit, and stops at the bound", async () => {
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
