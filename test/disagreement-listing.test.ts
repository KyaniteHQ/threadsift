import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import {
  disagreementRows,
  proposeDisagreement,
  replaceDigest,
  seedDigested,
  seedTopics,
} from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { interrupted, touchesProposals } from "./interrupted-database.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import { script } from "./pin-fixtures.ts";

describe("the Proposals list filters disagreement rows before the page limit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(
      instance,
      Array.from({ length: 12 }, (_, at) => ({ id: at + 1, topic: 1 })),
    );

    const pairs = Array.from({ length: 12 }, (_unused, low) =>
      Array.from({ length: 12 - low - 1 }, (_, at) => [low + 1, low + at + 2] as const),
    ).flat();

    script(
      instance,
      pairs
        .map(
          ([low, high], at) =>
            `insert into proposals (kind, from_item_id, into_item_id, from_digest, into_digest, reason, state, created_at) values ('items-disagree', ${String(low)}, ${String(high)}, ${String(at >= 55 ? 0 : low)}, ${String(high)}, 'Reason.', 'open', 1);`,
        )
        .join("\n"),
    );
  });

  after(() => instance.close());

  it("fills the page with 50 eligible rows and pages on by the last id", async () => {
    const first = await readPage(instance);

    assert.equal(first.proposals.length, 50);
    assert.equal(first.proposals[0]?.id, 55);
    assert.equal(first.next, String(first.proposals.at(-1)?.id));

    const second = await readPage(instance, `?cursor=${first.next ?? ""}`);

    assert.deepEqual(
      second.proposals.map(({ id }) => id),
      [5, 4, 3, 2, 1],
    );
    assert.equal(second.next, null);
  });
});

describe("the Proposals page reads a disagreement row and both Summaries in one snapshot", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(instance, [
      { id: 1, topic: 1 },
      { id: 2, topic: 1 },
    ]);
    proposeDisagreement(instance, [1, 2]);
  });

  after(() => instance.close());

  it("makes one call, so a Digest replaced before it is read leaves no half-filled row", async () => {
    let counted = 0;

    const replacing = interrupted(instance.databaseFile, touchesProposals, {
      before: (call) => {
        counted = call;
        replaceDigest(instance, 2, 900);

        return Promise.resolve();
      },
    });

    const page = await instance.readThrough(replacing, "/api/proposals", ProposalPageSchema);

    assert.equal(counted, 1);
    assert.deepEqual(page.proposals, []);
    assert.equal(disagreementRows(instance).length, 1);
  });
});
