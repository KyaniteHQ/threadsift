import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ProposalPageSchema } from "../src/core/contract/proposal-contract.ts";
import { Instance } from "./instance.ts";
import { mergesOf } from "./lost-highlight-fixtures.ts";
import { seedProposal } from "./proposal-seed.ts";
import { paste } from "./related-fixtures.ts";
import { exec, rows } from "./sqlite-fixtures.ts";

const IdSchema = z.object({ id: z.number() });

const idOf = (instance: Instance, table: "tags" | "topics", name: string): number => {
  const [found] = rows(instance, IdSchema, `select id from ${table} where name = ?`, name);

  assert.ok(found !== undefined, name);

  return found.id;
};

describe("the Proposals routes with Tag and Topic rows together", () => {
  let instance: Instance;

  const seedTopic = (from: string, into: string, state: string, reason: string | null) => {
    seedProposal(
      instance,
      "topic-merge",
      {
        from_topic_id: idOf(instance, "topics", from),
        into_topic_id: idOf(instance, "topics", into),
      },
      { reason, state },
    );
  };

  const seedTag = (from: string, into: string, state: string, reason: string | null) => {
    seedProposal(
      instance,
      "tag-merge",
      { from_tag_id: idOf(instance, "tags", from), into_tag_id: idOf(instance, "tags", into) },
      { reason, state },
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
    seedTag("llms", "llm", "open", "Plural of the same word.");
    seedTopic("ML", "Machine learning", "open", "Short form of the name.");
    seedTopic("Game", "Games", "rejected", "Decided.");
  });

  after(() => instance.close());

  it("lists both merge kinds newest first with live Item counts", async () => {
    const owner = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(
      mergesOf(owner).map(({ kind, from, into, state }) => ({
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
