import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { pasteItems, tokenOf } from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import { script } from "./pin-fixtures.ts";

describe("the Proposals list filters disagreement rows before the page limit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await pasteItems(
      instance,
      Array.from({ length: 12 }, () => ({ topic: "Reading" })),
    );

    const pairs = Array.from({ length: 12 }, (_unused, low) =>
      Array.from({ length: 12 - low - 1 }, (_, at) => [low + 1, low + at + 2] as const),
    ).flat();

    script(
      instance,
      pairs
        .map(
          ([low, high], at) =>
            `insert into proposals (kind, from_item_id, into_item_id, from_digest, into_digest, reason, state, created_at) values ('items-disagree', ${String(low)}, ${String(high)}, ${String(at >= 55 ? 0 : tokenOf(instance, low))}, ${String(tokenOf(instance, high))}, 'Reason.', 'open', 1);`,
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
