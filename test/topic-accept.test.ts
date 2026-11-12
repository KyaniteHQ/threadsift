import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { CreatedTokenResponseSchema, ItemReadResponseSchema } from "../src/http/schemas.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { seedLogEntries } from "./pin-fixtures.ts";
import { exec, paste, rows } from "./related-fixtures.ts";
import {
  heldLeases,
  itemsOf,
  leaseGeneration,
  proposeTopics,
  topicId,
  topicMergeLines,
} from "./topic-accept-fixtures.ts";

const StateSchema = z.object({ state: z.string() });

const PinSchema = z.object({
  from_key: z.string(),
  from_name: z.string(),
  into_topic_id: z.number(),
});

const DigestSchema = z.object({ topic: z.string(), json: z.string() });

const JsonTopicSchema = z.object({ topic: z.string() });

const byNumber = (first: number, second: number): number => first - second;

const itemsWithTopic = async (instance: Instance, name: string) =>
  (
    await instance.read(
      "GET",
      `/api/items?topic=${encodeURIComponent(name)}`,
      ItemReadResponseSchema,
    )
  ).items.map(({ id }) => id);

const catalogVersion = (instance: Instance): number =>
  count(instance, "select coalesce(max(version), 0) as n from catalog_version");

describe("Accept of a Topic row answers by the row's state and refuses the wrong caller", () => {
  let instance: Instance;
  let token: string;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "a", { title: "A", topic: "Alpha" });
    await paste(instance, "b", { title: "B", topic: "Beta" });
    await paste(instance, "c", { title: "C", topic: "Gamma" });
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "topic-accept",
    }));
  });

  after(() => instance.close());

  it("answers 403 to an agent token, 401 signed out and 404 for an unknown id", async () => {
    const id = proposeTopics(instance, ["Alpha", "Beta"]);

    const agent = await instance.sendWithToken(
      token,
      "POST",
      `/api/proposals/${String(id)}/accept`,
    );

    const signedOut = await instance.fetch(`/api/proposals/${String(id)}/accept`, {
      method: "POST",
    });

    assert.deepEqual([agent.status, signedOut.status], [403, 401]);
    assert.equal((await accept(instance, 9999)).status, 404);
    assert.equal(count(instance, "select count(*) as n from pins"), 0);
    exec(instance, "delete from proposals");
  });

  it("answers not-open for a decided row and merge-busy while another row of either kind is accepting, and lists the accepting Topic row", async () => {
    const rejected = proposeTopics(instance, ["Alpha", "Gamma"], "rejected");
    const busy = proposeTopics(instance, ["Beta", "Gamma"], "accepting");
    const open = proposeTopics(instance, ["Alpha", "Beta"]);

    assert.deepEqual(
      [(await accept(instance, rejected)).body, (await accept(instance, open)).body],
      [JSON.stringify({ error: "not-open" }), JSON.stringify({ error: "merge-busy" })],
    );
    assert.deepEqual(
      rows(instance, StateSchema, "select state from proposals order by id").map(
        ({ state }) => state,
      ),
      ["rejected", "accepting", "open"],
    );
    assert.deepEqual(
      (await instance.read("GET", "/api/proposals", ProposalPageSchema)).proposals.map(
        ({ id, state }) => [id, state],
      ),
      [
        [open, "open"],
        [busy, "accepting"],
      ],
    );
    assert.equal(count(instance, "select count(*) as n from pins"), 0);
    exec(instance, "delete from proposals");
  });
});

describe("Accept of a Topic row moves everything the Topic owns in one batch", () => {
  let instance: Instance;
  let ids: readonly number[];
  let loser = 0;
  let survivor = 0;
  let versionBefore = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    ids = [
      await paste(instance, "one", { title: "One", topic: "ML", tags: ["ml"] }),
      await paste(instance, "two", { title: "Two", topic: "ML", tags: ["ml"] }),
      await paste(instance, "three", { title: "Three", topic: "Machine learning" }),
      await paste(instance, "four", { title: "Four", topic: "Games" }),
    ];
    loser = topicId(instance, "ML");
    survivor = topicId(instance, "Machine learning");
    exec(instance, "update digests set digest = 'not json' where item_id = ?", ids[1] ?? 0);
    exec(
      instance,
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values ('topic-merge', ?, ?, 'Other.', 'open', 1), ('topic-merge', ?, ?, 'Kept.', 'open', 1)",
      loser,
      topicId(instance, "Games"),
      survivor,
      topicId(instance, "Games"),
    );
    exec(
      instance,
      "insert into topic_pages (topic_id, overview, revision, built_from, updated_at) values (?, 'About ML.', 1, '[]', 1)",
      loser,
    );
    versionBefore = catalogVersion(instance);
  });

  after(() => instance.close());

  it("answers 200 done and leaves the one batch as the only unit", async () => {
    const id = proposeTopics(instance, ["ML", "Machine learning"]);
    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [200, { state: "done" }]);
    assert.equal(leaseGeneration(instance, survivor), 1);
    assert.equal(heldLeases(instance), 0);
  });

  it("links every Item to the survivor and finds them by its name and none by the merged-away name", async () => {
    assert.equal(itemsOf(instance, survivor), 3);
    assert.equal(itemsOf(instance, loser), 0);
    assert.deepEqual(
      [...(await itemsWithTopic(instance, "Machine learning"))].toSorted(byNumber),
      ids.slice(0, 3).toSorted(byNumber),
    );
    assert.deepEqual(await itemsWithTopic(instance, "ML"), []);
  });

  it("writes the survivor's name into digests.topic and the Digest JSON read from digests, and keeps the text of one that is not JSON", () => {
    assert.deepEqual(
      rows(
        instance,
        DigestSchema,
        "select topic, digest as json from digests where item_id in (?, ?) order by item_id",
        ids[0] ?? 0,
        ids[1] ?? 0,
      ).map(({ topic, json }) => [
        topic,
        json.startsWith("{") ? JsonTopicSchema.parse(JSON.parse(json)).topic : json,
      ]),
      [
        ["Machine learning", "Machine learning"],
        ["Machine learning", "not json"],
      ],
    );
    assert.equal(count(instance, "select count(*) as n from digests where topic = 'ML'"), 0);
  });

  it("moves the Log lines that named the merged-away Topic and removes the Topic, its page and its lease", () => {
    assert.equal(
      count(
        instance,
        "select count(*) as n from log_entries where topic = 'ML' and topic_id is null",
      ),
      0,
    );
    assert.equal(
      count(instance, "select count(*) as n from log_entries where topic_id = ?", survivor) >= 2,
      true,
    );
    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(
      count(instance, "select count(*) as n from topic_pages where topic_id = ?", loser),
      0,
    );
    assert.equal(
      count(instance, "select count(*) as n from topic_leases where topic_id = ?", loser),
      0,
    );
  });

  it("records the Pin, moves catalog_version by one and writes one merge-topic Log entry with the count", async () => {
    assert.deepEqual(
      rows(instance, PinSchema, "select from_key, from_name, into_topic_id from pins"),
      [{ from_key: "ml", from_name: "ML", into_topic_id: survivor }],
    );
    assert.equal(catalogVersion(instance), versionBefore + 1);
    assert.deepEqual(await topicMergeLines(instance), ["ML into Machine learning | 2 Items"]);
  });

  it("removes every other row that named the merged-away Topic and keeps the rest", () => {
    assert.deepEqual(
      rows(
        instance,
        z.object({ reason: z.string() }),
        "select reason from proposals order by id",
      ).map(({ reason }) => reason),
      ["Kept."],
    );
  });
});

describe("Accept of a Topic row on more Items and Log entries than one unit holds", () => {
  let instance: Instance;
  let loser = 0;
  let survivor = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "keeper", { title: "Keeper", topic: "Survivor" });
    await paste(instance, "few", { title: "Few", topic: "Loser" });
    loser = topicId(instance, "Loser");
    survivor = topicId(instance, "Survivor");
  });

  after(() => instance.close());

  it("takes more than one unit for a Topic with few Items and more Log entries than one unit holds, and writes the Log entry once", async () => {
    seedLogEntries(instance, { topicId: loser, name: "Loser", entries: 1001 });

    const id = proposeTopics(instance, ["Loser", "Survivor"]);

    const logged = count(
      instance,
      "select count(*) as n from log_entries where topic_id = ?",
      loser,
    );

    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [200, { state: "done" }]);
    assert.equal(leaseGeneration(instance, survivor), 3);
    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where topic_id = ?", survivor) >=
        logged,
      true,
    );
    assert.deepEqual(await topicMergeLines(instance), ["Loser into Survivor | 1 Items"]);
  });
});
