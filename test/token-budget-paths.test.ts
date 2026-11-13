import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { BudgetRefusalSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import { callBoth, connectBoth, type Agents } from "./mcp-client.ts";
import {
  addBatch,
  addLink,
  budgetOf,
  itemsCounted,
  itemsSavedByDay,
  makeToken,
  secondsUntilMidnight,
  total,
  xLink,
} from "./token-budget-fixtures.ts";
import { POST_ID, authored } from "./x-thread-fixtures.ts";

const PAGE = {
  markdown: "A page of text that an agent read in its own tab.\n\n".repeat(20),
  title: "A page",
};

describe("every way a token adds an Item draws on the same daily budget", () => {
  let instance: Instance;
  let agents: Agents;
  let mcpToken: Awaited<ReturnType<typeof makeToken>>;

  const withPage = (token: Awaited<ReturnType<typeof makeToken>>, address: string) =>
    instance.sendWithToken(token.value, "POST", "/api/items", { url: address, page: PAGE });

  const withContent = (token: Awaited<ReturnType<typeof makeToken>>, postId: string) =>
    instance.sendWithToken(token.value, "POST", "/api/items", {
      url: `https://x.com/someone/status/${postId}`,
      content: [JSON.stringify(authored(postId))],
    });

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    mcpToken = await makeToken(instance, 2, "mcp budget");
    agents = await connectBoth(instance, mcpToken);
  });

  after(async () => {
    await agents.legacy.close();
    await agents.modern.close();
    await instance.close();
  });

  it("counts a link, a link with a page, a link with a thread and each new link of a batch", async () => {
    const token = await makeToken(instance, 10);

    assert.equal((await addLink(instance, token, 1)).status, 201);
    assert.equal((await withPage(token, "https://example.com/budget-page")).status, 201);
    assert.equal((await withContent(token, POST_ID)).status, 201);
    assert.equal((await addBatch(instance, token, [2, 3])).status, 200);

    const state = await budgetOf(instance, token.id);

    assert.ok(state.kind === "within" && state.added === 5 && state.left === 5);
    assert.deepEqual(itemsSavedByDay(instance, token.id), itemsCounted(instance, token.id));
    assert.equal(total(instance, "items"), 5);
    assert.equal(
      itemsSavedByDay(instance, token.id).reduce((sum, [, saved]) => sum + saved, 0),
      5,
    );
  });

  it("refuses a link, a page, a thread and a batch of new links with 429 once the budget is spent, and saves none", async () => {
    const token = await makeToken(instance, 1);

    await addLink(instance, token, 11);

    const itemsBefore = total(instance, "items");

    const answers = await Promise.all([
      addLink(instance, token, 12),
      withPage(token, "https://example.com/budget-page-two"),
      withContent(token, "1000000000000000099"),
      addBatch(instance, token, [13, 14]),
    ]);

    assert.deepEqual(
      answers.map(({ status }) => status),
      [429, 429, 429, 429],
    );

    assert.ok(
      answers.every(
        ({ body }) => BudgetRefusalSchema.parse(JSON.parse(body)).code === "budget-spent",
      ),
    );

    assert.equal(total(instance, "items"), itemsBefore);
  });

  it("counts the add tool of /mcp, and refuses it as a tool error once the budget is spent", async () => {
    const first = await callBoth(agents, "add", { url: xLink(21) });
    const second = await callBoth(agents, "add", { url: xLink(22) });

    assert.deepEqual(
      [...first, ...second].map(({ isError }) => isError),
      [false, false, false, false],
    );

    const over = await callBoth(agents, "add", { url: xLink(23) });

    assert.deepEqual(
      over.map(({ isError }) => isError),
      [true, true],
    );

    assert.ok(over.every(({ content }) => JSON.stringify(content).includes("daily budget")));

    const waitAfter = secondsUntilMidnight(Date.now());

    for (const { body } of over) {
      const refusal = z.object({ code: z.string(), retryAfter: z.number() }).parse(body);

      assert.equal(refusal.code, "budget-spent");
      assert.ok(refusal.retryAfter >= waitAfter && refusal.retryAfter <= waitAfter + 3);
    }

    assert.equal((await budgetOf(instance, mcpToken.id)).kind, "spent");
  });
});
