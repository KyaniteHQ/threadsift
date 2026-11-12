import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { script, seedTopicItems } from "./pin-fixtures.ts";
import { exec, paste, rows } from "./related-fixtures.ts";
import {
  heldLeases,
  itemsOf,
  proposeTopics,
  topicId,
  topicMergeLines,
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
    await paste(instance, "keeper", { title: "Keeper", topic: "Survivor" });
    await paste(instance, "few", { title: "Few", topic: "Loser" });
    loser = topicId(instance, "Loser");
    seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: ITEMS });
    proposal = proposeTopics(instance, ["Loser", "Survivor"]);
  });

  after(() => instance.close());

  it("answers 202 after 50 units with the row, the Pin and the count in place and both leases free", async () => {
    const answer = await accept(instance, proposal);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [202, { state: "accepting" }]);
    assert.deepEqual(
      rows(
        instance,
        z.object({ state: z.string(), moved: z.number(), revision: z.number() }),
        "select state, moved, unit_revision as revision from proposals where id = ?",
        proposal,
      ),
      [{ state: "accepting", moved: 50 * UNIT, revision: 50 }],
    );
    assert.equal(count(instance, "select count(*) as n from pins where kind = 'topic-merge'"), 1);
    assert.equal(itemsOf(instance, loser), 2);
    assert.equal(heldLeases(instance), 0);
    assert.deepEqual(await topicMergeLines(instance), []);
  });

  it("lists the accepting row and refuses another Accept with merge-busy", async () => {
    assert.deepEqual(
      (await instance.read("GET", "/api/proposals", ProposalPageSchema)).proposals.map(
        ({ state }) => state,
      ),
      ["accepting"],
    );

    exec(instance, "insert into topics (key, name) values ('third', 'Third')");

    const other = proposeTopics(instance, ["Survivor", "Third"]);

    assert.deepEqual(
      [(await accept(instance, other)).body],
      [JSON.stringify({ error: "merge-busy" })],
    );
    exec(instance, "delete from proposals where id = ?", other);
  });

  it("is finished by the sweep stage with one merge-topic entry that counts every Item", async () => {
    script(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.deepEqual(await topicMergeLines(instance), [
      `Loser into Survivor | ${String(ITEMS + 1)} Items`,
    ]);
    assert.equal(heldLeases(instance), 0);
  });
});

describe("Accept of a Topic row that the sweep continues after an Item was deleted", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "keeper", { title: "Keeper", topic: "Survivor" });
    await paste(instance, "few", { title: "Few", topic: "Loser" });
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
