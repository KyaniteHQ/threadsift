import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { parseLink } from "../src/core/links.ts";
import { BatchResponseSchema } from "../src/http/batch-schemas.ts";
import { BudgetRefusalSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import {
  addBatch,
  addLink,
  budgetOf,
  execute,
  makeToken,
  nextMidnight,
  total,
  xLink,
} from "./token-budget-fixtures.ts";

describe("an agent token adds up to its daily budget of Items and no more", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("counts the Items a token adds, and not a link the library holds, a refused host or a read", async () => {
    const token = await makeToken(instance, 5);

    assert.equal((await addLink(instance, token, 1)).status, 201);
    assert.equal((await addLink(instance, token, 1)).status, 200);

    const batch = BatchResponseSchema.parse(
      JSON.parse((await addBatch(instance, token, [1, 2])).body),
    );

    assert.deepEqual(
      batch.results.map(({ outcome }) => outcome),
      ["known", "added"],
    );

    const refused = await instance.sendWithToken(token.value, "POST", "/api/items", {
      url: "http://10.0.0.5/admin",
    });

    assert.equal(refused.status, 400);
    assert.equal((await instance.sendWithToken(token.value, "GET", "/api/items")).status, 200);

    assert.deepEqual(await budgetOf(instance, token.id), {
      kind: "within",
      limit: 5,
      added: 2,
      left: 3,
    });
  });

  it("answers 429 with a stable code and the seconds to the next UTC midnight when the budget is spent, saves nothing, and still answers a link the library holds", async () => {
    const token = await makeToken(instance, 1);

    assert.equal((await addLink(instance, token, 11)).status, 201);

    const itemsBefore = total(instance, "items");
    const over = await addLink(instance, token, 12);

    assert.equal(over.status, 429);
    assert.equal(BudgetRefusalSchema.parse(JSON.parse(over.body)).code, "budget-spent");
    assert.equal(total(instance, "items"), itemsBefore);

    const known = await addLink(instance, token, 11);

    assert.equal(known.status, 200);

    const state = await budgetOf(instance, token.id);

    assert.ok(state.kind === "spent" && state.until === nextMidnight(Date.now()));
  });

  it("refuses a batch that would cross the budget whole: nothing is saved, nothing is counted and the import cursor stays", async () => {
    const token = await makeToken(instance, 3);

    await addLink(instance, token, 31);
    await addLink(instance, token, 32);

    const itemsBefore = total(instance, "items");

    const refused = await instance.sendWithToken(token.value, "POST", "/api/items/batch", {
      links: [31, 33, 34].map((number) => ({ url: xLink(number) })),
      import: { name: "whole", cursor: "1" },
    });

    assert.equal(refused.status, 429);
    assert.equal(BudgetRefusalSchema.parse(JSON.parse(refused.body)).code, "budget-spent");
    assert.equal(total(instance, "items"), itemsBefore);
    assert.equal((await instance.send("GET", "/api/imports/whole")).status, 404);
    assert.equal((await budgetOf(instance, token.id)).kind, "within");

    assert.equal((await addBatch(instance, token, [31, 33])).status, 200);
    assert.equal((await budgetOf(instance, token.id)).kind, "spent");
  });

  it("refuses a first batch of the day that is bigger than the whole budget", async () => {
    const token = await makeToken(instance, 2);
    const itemsBefore = total(instance, "items");

    assert.equal((await addBatch(instance, token, [91, 92, 93])).status, 429);
    assert.equal(total(instance, "items"), itemsBefore);
    assert.deepEqual(await budgetOf(instance, token.id), {
      kind: "within",
      limit: 2,
      added: 0,
      left: 2,
    });
  });

  it("gives the owner's session and a token with no budget no limit, and counts a token with no budget", async () => {
    const free = await makeToken(instance, null);

    const freed = await Promise.all(
      [41, 42, 43, 44].map((number) => addLink(instance, free, number)),
    );

    assert.deepEqual(
      freed.map(({ status }) => status),
      [201, 201, 201, 201],
    );

    assert.deepEqual(await budgetOf(instance, free.id), { kind: "unlimited", added: 4 });

    const limited = await makeToken(instance, 1);

    const byOwner = await Promise.all(
      [45, 46, 47].map((number) => instance.send("POST", "/api/items", { url: xLink(number) })),
    );

    assert.deepEqual(
      byOwner.map(({ status }) => status),
      [201, 201, 201],
    );

    assert.deepEqual(await budgetOf(instance, limited.id), {
      kind: "within",
      limit: 1,
      added: 0,
      left: 1,
    });
  });

  it("answers a batch of links the library already holds, a short link among them, without counting or refusing it, even when the budget is spent or was lowered below today's count", async () => {
    const token = await makeToken(instance, 3);

    const saved = SavedItemResponseSchema.parse(
      JSON.parse((await instance.send("POST", "/api/items", { url: xLink(81) })).body),
    );

    const short = "https://t.co/knownshort";

    execute(
      instance,
      `insert into item_aliases (normalized_url, address, item_id) values ('${parseLink(short).normalizedUrl}', '${xLink(81)}', ${String(saved.item.id)})`,
    );

    await Promise.all([82, 83, 84].map((number) => addLink(instance, token, number)));

    assert.equal((await budgetOf(instance, token.id)).kind, "spent");

    const knownOnly = () =>
      instance.sendWithToken(token.value, "POST", "/api/items/batch", {
        links: [{ url: short }, { url: xLink(81) }, { url: xLink(82) }],
      });

    const atLimit = await knownOnly();

    assert.equal(atLimit.status, 200);
    assert.deepEqual(
      BatchResponseSchema.parse(JSON.parse(atLimit.body)).results.map(({ outcome }) => outcome),
      ["known", "known", "known"],
    );

    const single = await instance.sendWithToken(token.value, "POST", "/api/items", { url: short });

    assert.equal(single.status, 200);

    assert.equal(
      (await instance.send("PATCH", `/api/tokens/${String(token.id)}`, { dailyBudget: 1 })).status,
      200,
    );

    assert.equal((await knownOnly()).status, 200);
    assert.equal((await addBatch(instance, token, [85])).status, 429);
    assert.deepEqual(await budgetOf(instance, token.id), {
      kind: "spent",
      limit: 1,
      added: 3,
      until: nextMidnight(Date.now()),
    });
  });

  it("removes a token's counts when the token is revoked, and keeps the Items it added", async () => {
    const token = await makeToken(instance, 4);

    await addLink(instance, token, 61);

    const items = total(instance, "items");
    const counts = total(instance, "agent_token_days");

    assert.equal((await instance.send("DELETE", `/api/tokens/${String(token.id)}`)).status, 204);
    assert.equal(total(instance, "agent_token_days"), counts - 1);
    assert.equal(total(instance, "items"), items);
  });
});
