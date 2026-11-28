import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { BatchBudgetRefusalSchema } from "../src/core/contract/batch-wire.ts";
import { Instance } from "./instance.ts";
import { addLink, budgetOf, makeToken, xLink } from "./token-budget-fixtures.ts";

function beforeSecondStatementBatch(instance: Instance, staged: () => Promise<void>): () => number {
  const { db } = instance.core;
  const real = db.batch.bind(db);
  let calls = 0;

  Object.defineProperty(db, "batch", {
    configurable: true,
    value: async (queries: Parameters<typeof real>[0]) => {
      calls += 1;

      if (calls === 2) {
        Reflect.deleteProperty(db, "batch");
        await staged();
      }

      return real(queries);
    },
  });

  return () => calls;
}

describe("requests of one agent token at the same moment add no more Items than its daily budget", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("saves one of three concurrent Pastes of new links on a budget of 1 and answers 429 to the others", async () => {
    const token = await makeToken(instance, 1);

    const answers = await Promise.all([1, 2, 3].map((number) => addLink(instance, token, number)));

    assert.deepEqual(
      answers.map(({ status }) => status).toSorted((first, second) => first - second),
      [201, 429, 429],
    );
    assert.equal((await budgetOf(instance, token.id)).added, 1);
  });

  it("stops a batch that another request overtook at the link that would cross the budget, answers the saved links and keeps the cursor", async () => {
    const token = await makeToken(instance, 3);
    const links = [11, 12, 13].map((number) => ({ url: xLink(number) }));
    let competitor = 0;
    const batches = beforeSecondStatementBatch(instance, async () => {
      competitor = (await addLink(instance, token, 10)).status;
    });

    const answer = await instance.sendWithToken(token.value, "POST", "/api/items/batch", {
      links,
      import: { name: "overtaken", cursor: "c1" },
    });

    assert.equal(batches(), 2);
    assert.equal(competitor, 201);
    assert.equal(answer.status, 429);
    assert.deepEqual(
      BatchBudgetRefusalSchema.parse(JSON.parse(answer.body)).results?.map(
        ({ outcome }) => outcome,
      ),
      ["added", "added"],
    );
    assert.equal((await budgetOf(instance, token.id)).added, 3);
    assert.equal((await instance.send("GET", "/api/imports/overtaken")).status, 404);

    const total = await instance.itemTotal();
    const resent = await instance.sendWithToken(token.value, "POST", "/api/items/batch", {
      links: links.slice(0, 2),
    });

    assert.equal(resent.status, 200);
    assert.equal(await instance.itemTotal(), total);
  });
});
