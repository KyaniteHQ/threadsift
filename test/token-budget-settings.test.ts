import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CreatedTokenResponseSchema, TokenListResponseSchema } from "../src/http/schemas.ts";
import { Instance, type Json } from "./instance.ts";
import { addLink, budgetOf, makeToken } from "./token-budget-fixtures.ts";

describe("the owner sets each agent token's daily budget when making it and afterwards", () => {
  let instance: Instance;

  const change = (id: number, body: Json) =>
    instance.send("PATCH", `/api/tokens/${String(id)}`, body);

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("gives a token made without a budget the default, and one made with null no budget", async () => {
    const made = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "default",
    });

    assert.deepEqual(made.token.budget, { kind: "within", limit: 200, added: 0, left: 200 });

    const free = await makeToken(instance, null);

    assert.deepEqual(await budgetOf(instance, free.id), { kind: "unlimited", added: 0 });

    const listed = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.equal(listed.tokens.length, 2);
  });

  it("refuses a budget that is not a whole number above 0", async () => {
    const answers = await Promise.all(
      [0, -1, 1.5, "ten"].map((dailyBudget) =>
        instance.send("POST", "/api/tokens", { name: "bad", dailyBudget }),
      ),
    );

    assert.deepEqual(
      answers.map(({ status }) => status),
      [400, 400, 400, 400],
    );

    const token = await makeToken(instance, 3);

    assert.equal((await change(token.id, { dailyBudget: 0 })).status, 400);
    assert.equal((await change(token.id, {})).status, 400);
    assert.equal((await budgetOf(instance, token.id)).kind, "within");
  });

  it("changes a budget afterwards, to another number or to none, and the next add follows the new budget", async () => {
    const token = await makeToken(instance, 1);

    await addLink(instance, token, 1);

    assert.equal((await addLink(instance, token, 2)).status, 429);
    assert.equal((await change(token.id, { dailyBudget: 2 })).status, 200);
    assert.deepEqual(await budgetOf(instance, token.id), {
      kind: "within",
      limit: 2,
      added: 1,
      left: 1,
    });

    assert.equal((await addLink(instance, token, 2)).status, 201);
    assert.equal((await addLink(instance, token, 3)).status, 429);

    assert.equal((await change(token.id, { dailyBudget: null })).status, 200);
    assert.deepEqual(await budgetOf(instance, token.id), { kind: "unlimited", added: 2 });
    assert.equal((await addLink(instance, token, 3)).status, 201);
  });

  it("answers 404 for a token that does not exist, and 403 to an agent token", async () => {
    const token = await makeToken(instance, 3);

    assert.equal((await change(987_654, { dailyBudget: 1 })).status, 404);

    const asToken = await instance.sendWithToken(
      token.value,
      "PATCH",
      `/api/tokens/${String(token.id)}`,
      { dailyBudget: null },
    );

    assert.equal(asToken.status, 403);
    assert.equal((await budgetOf(instance, token.id)).kind, "within");
  });
});
