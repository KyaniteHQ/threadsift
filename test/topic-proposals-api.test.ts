import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import { exec, paste, rows } from "./related-fixtures.ts";

const IdSchema = z.object({ id: z.number() });

const StateSchema = z.object({ state: z.string() });

const idOf = (instance: Instance, table: "tags" | "topics", name: string): number => {
  const [found] = rows(instance, IdSchema, `select id from ${table} where name = ?`, name);

  assert.ok(found !== undefined, name);

  return found.id;
};

const states = (instance: Instance) =>
  rows(instance, StateSchema, "select state from proposals order by id").map(({ state }) => state);

describe("the Proposals routes with Tag and Topic rows together", () => {
  let instance: Instance;
  let token: string;

  const seedTopic = (from: string, into: string, state: string, reason: string | null) => {
    exec(
      instance,
      "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values ('topic-merge', ?, ?, ?, ?, 1)",
      idOf(instance, "topics", from),
      idOf(instance, "topics", into),
      reason,
      state,
    );
  };

  const seedTag = (from: string, into: string, state: string, reason: string | null) => {
    exec(
      instance,
      "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', ?, ?, ?, ?, 1)",
      idOf(instance, "tags", from),
      idOf(instance, "tags", into),
      reason,
      state,
    );
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "one", { title: "One", topic: "ML", tags: ["ml", "llm"] });
    await paste(instance, "two", { title: "Two", topic: "Machine learning", tags: ["llms"] });
    await paste(instance, "three", { title: "Three", topic: "Machine learning", tags: ["llm"] });
    await paste(instance, "four", { title: "Four", topic: "Games" });
    await paste(instance, "five", { title: "Five", topic: "Game" });
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "topic-proposals",
    }));
    seedTag("llms", "llm", "open", "Plural of the same word.");
    seedTopic("ML", "Machine learning", "open", "Short form of the name.");
    seedTopic("Game", "Games", "rejected", "Decided.");
  });

  after(() => instance.close());

  it("lists both kinds newest first with live Item counts to the owner and an agent token, and 401 signed out", async () => {
    const owner = await instance.read("GET", "/api/proposals", ProposalPageSchema);
    const agent = await instance.sendWithToken(token, "GET", "/api/proposals");
    const signedOut = await instance.fetch("/api/proposals");

    assert.deepEqual(
      owner.proposals.map(({ kind, from, into, state }) => ({
        kind,
        from: `${from.name}:${String(from.items)}`,
        into: `${into.name}:${String(into.items)}`,
        state,
      })),
      [
        { kind: "topic-merge", from: "ML:1", into: "Machine learning:2", state: "open" },
        { kind: "tag-merge", from: "llms:1", into: "llm:2", state: "open" },
      ],
    );
    assert.deepEqual([agent.status, signedOut.status], [200, 401]);
    assert.equal(agent.body, JSON.stringify(owner));
  });

  it("answers 409 not-supported to an Accept of a Topic row, whatever its state, and leaves it open", async () => {
    const [topic] = (await instance.read("GET", "/api/proposals", ProposalPageSchema)).proposals;

    const [rejected] = rows(
      instance,
      IdSchema,
      "select id from proposals where kind = 'topic-merge' and state = 'rejected'",
    );

    assert.ok(topic !== undefined && rejected !== undefined);

    const answers = await Promise.all(
      [topic.id, rejected.id].map((id) =>
        instance.send("POST", `/api/proposals/${String(id)}/accept`),
      ),
    );

    assert.deepEqual(
      answers.map(({ status, body }) => [status, body]),
      [
        [409, JSON.stringify({ error: "not-supported" })],
        [409, JSON.stringify({ error: "not-supported" })],
      ],
    );
    assert.deepEqual(states(instance), ["open", "open", "rejected"]);
  });

  it("rejects a Topic row once, answers 409 not-open after, lists it no more, and still rejects a Tag row", async () => {
    const [topic, tag] = (await instance.read("GET", "/api/proposals", ProposalPageSchema))
      .proposals;

    assert.ok(topic !== undefined && tag !== undefined);

    const first = await instance.send("POST", `/api/proposals/${String(topic.id)}/reject`);
    const second = await instance.send("POST", `/api/proposals/${String(topic.id)}/reject`);

    assert.deepEqual([first.status, first.body], [200, JSON.stringify({ state: "rejected" })]);
    assert.deepEqual([second.status, second.body], [409, JSON.stringify({ error: "not-open" })]);

    const rest = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(
      rest.proposals.map(({ kind }) => kind),
      ["tag-merge"],
    );
    assert.equal(
      (await instance.send("POST", `/api/proposals/${String(tag.id)}/reject`)).status,
      200,
    );
    assert.deepEqual(states(instance), ["rejected", "rejected", "rejected"]);
  });
});

describe("checkedAt is the most recent start of either weekly run", () => {
  let instance: Instance;

  const checkedAt = async () =>
    (await instance.read("GET", "/api/proposals", ProposalPageSchema)).checkedAt;

  const claim = (task: string, at: number) => {
    exec(
      instance,
      "insert or replace into scheduled_runs (task, last_run_at) values (?, ?)",
      task,
      at,
    );
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("is null with neither claim, the Topic claim's time with only that claim, and the larger time with both", async () => {
    assert.equal(await checkedAt(), null);

    claim("topic_proposals", 5000);
    assert.equal(await checkedAt(), 5000);

    claim("proposals", 3000);
    assert.equal(await checkedAt(), 5000);

    claim("proposals", 9000);
    assert.equal(await checkedAt(), 9000);

    exec(instance, "delete from scheduled_runs where task = 'topic_proposals'");
    assert.equal(await checkedAt(), 9000);
  });
});
