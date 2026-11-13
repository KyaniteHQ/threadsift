import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";
import {
  addBatch,
  addLink,
  budgetOf,
  itemsCounted,
  itemsSavedByDay,
  makeToken,
  total,
} from "./token-budget-fixtures.ts";

describe("parallel adds by one token never pass its daily budget", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("saves exactly the budget when more single adds than the budget run at once", async () => {
    const token = await makeToken(instance, 5);

    const answers = await Promise.all(
      Array.from({ length: 12 }, (_, index) => addLink(instance, token, 100 + index)),
    );

    assert.equal(answers.filter(({ status }) => status === 201).length, 5);
    assert.equal(answers.filter(({ status }) => status === 429).length, 7);
    assert.equal(total(instance, "items"), 5);
    const state = await budgetOf(instance, token.id);

    assert.ok(state.kind === "spent" && state.limit === 5 && state.added === 5);
  });

  it("saves one whole batch and refuses the others whole when batches that together cross the budget run at once", async () => {
    const token = await makeToken(instance, 6);

    const itemsBefore = total(instance, "items");

    const answers = await Promise.all(
      [0, 1, 2].map((batch) =>
        addBatch(
          instance,
          token,
          [0, 1, 2, 3].map((index) => 200 + batch * 10 + index),
        ),
      ),
    );

    assert.deepEqual(
      answers.map(({ status }) => status).toSorted((a, b) => a - b),
      [200, 429, 429],
    );
    assert.equal(total(instance, "items") - itemsBefore, 4);
    assert.equal((await budgetOf(instance, token.id)).kind, "within");
    assert.deepEqual(itemsSavedByDay(instance, token.id), itemsCounted(instance, token.id));
  });
});
