import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/contract/proposal-contract.ts";
import { propose } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import { mergesOf } from "./lost-highlight-fixtures.ts";
import { proposeTopics } from "./topic-accept-fixtures.ts";
import { holdClaim, releaseClaim } from "./weekly-claim-fixtures.ts";

describe("the Proposals routes with Tag and Topic rows together", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "one", { title: "One", topic: "ML", tags: ["ml", "llm"] });
    await paste(instance, "two", { title: "Two", topic: "Machine learning", tags: ["llms"] });
    await paste(instance, "three", { title: "Three", topic: "Machine learning", tags: ["llm"] });
    await paste(instance, "four", { title: "Four", topic: "Games" });
    await paste(instance, "five", { title: "Five", topic: "Game" });
    propose(instance, ["llms", "llm"]);
    proposeTopics(instance, ["ML", "Machine learning"], "open", "Short form of the name.");
    proposeTopics(instance, ["Game", "Games"], "rejected", "Decided.");
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

describe("checkedAt is the most recent start of any weekly run", () => {
  let instance: Instance;

  const checkedAt = async () =>
    (await instance.read("GET", "/api/proposals", ProposalPageSchema)).checkedAt;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("is null with no claim, then the largest time among the weekly tasks, and ignores the sweep", async () => {
    assert.equal(await checkedAt(), null);

    holdClaim(instance, "topic_proposals", 5000);
    assert.equal(await checkedAt(), 5000);

    holdClaim(instance, "proposals", 3000);
    holdClaim(instance, "highlight_proposals", 2000);
    holdClaim(instance, "overview_proposals", 4000);
    assert.equal(await checkedAt(), 5000);

    holdClaim(instance, "disagreement_proposals", 9000);
    assert.equal(await checkedAt(), 9000);

    holdClaim(instance, "sweep", 20_000);
    assert.equal(await checkedAt(), 9000);

    releaseClaim(instance, "topic_proposals");
    assert.equal(await checkedAt(), 9000);
  });
});
