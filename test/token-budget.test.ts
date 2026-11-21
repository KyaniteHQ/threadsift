/* oxlint-disable eslint/max-lines, import/max-dependencies -- The four Daily budget suites exercise their request paths on one Instance. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  CreatedTokenResponseSchema,
  TokenListResponseSchema,
} from "../src/core/contract/access-wire.ts";
import { BatchResponseSchema } from "../src/core/contract/batch-wire.ts";
import { BudgetRefusalSchema } from "../src/core/contract/error-wire.ts";
import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { parseLink } from "../src/core/contract/links.ts";
import { saveUnresolved } from "../src/features/paste/core/item-save.ts";
import { Instance, type Json } from "./instance.ts";
import { callBoth, connectBoth, type Agents } from "./mcp-client.ts";
import {
  addBatch,
  addLink,
  budgetOf,
  execute,
  makeToken,
  nextMidnight,
  total,
  xLink,
  atClock,
  dayOf,
  itemsSavedByDay,
  secondsUntilMidnight,
  steppingClock,
} from "./token-budget-fixtures.ts";
import { POST_ID, authored } from "./x-thread-fixtures.ts";

const withAuthorization = (token: string) => ({
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  origin: "http://localhost",
});

describe("Daily budget", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const change = (id: number, body: Json) =>
    instance.send("PATCH", `/api/tokens/${String(id)}`, body);

  describe("the owner sets each agent token's daily budget when making it and afterwards", () => {
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

      await addLink(instance, token, 301);

      assert.equal((await addLink(instance, token, 302)).status, 429);
      assert.equal((await change(token.id, { dailyBudget: 2 })).status, 200);
      assert.deepEqual(await budgetOf(instance, token.id), {
        kind: "within",
        limit: 2,
        added: 1,
        left: 1,
      });

      assert.equal((await addLink(instance, token, 302)).status, 201);
      assert.equal((await addLink(instance, token, 303)).status, 429);

      assert.equal((await change(token.id, { dailyBudget: null })).status, 200);
      assert.deepEqual(await budgetOf(instance, token.id), { kind: "unlimited", added: 2 });
      assert.equal((await addLink(instance, token, 303)).status, 201);
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

  describe("an agent token adds up to its daily budget of Items and no more", () => {
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

    it("answers 429 with the budget-spent code when the budget is spent, saves nothing, and still answers a link the library holds", async () => {
      const now = Date.now();

      await atClock(
        () => now,
        async () => {
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

          assert.ok(state.kind === "spent" && state.until === nextMidnight(now));
        },
      );
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

      const single = await instance.sendWithToken(token.value, "POST", "/api/items", {
        url: short,
      });

      assert.equal(single.status, 200);

      assert.equal(
        (await instance.send("PATCH", `/api/tokens/${String(token.id)}`, { dailyBudget: 1 }))
          .status,
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

    it("keeps the Items a token added when the token is revoked", async () => {
      const token = await makeToken(instance, 4);

      await addLink(instance, token, 61);

      const items = total(instance, "items");

      assert.equal((await instance.send("DELETE", `/api/tokens/${String(token.id)}`)).status, 204);
      assert.equal(total(instance, "items"), items);
    });
  });

  const MINUTE_MS = 60_000;

  const LAST_REQUEST_STEPS = 200;

  describe("an agent token's day is the UTC day, and a refusal says how long until the next one", () => {
    it("sends Retry-After as the seconds until the next UTC midnight", async () => {
      const token = await makeToken(instance, 1);

      await addLink(instance, token, 21);

      const waitBefore = secondsUntilMidnight(Date.now());

      const response = await instance.fetch("/api/items", {
        method: "POST",
        headers: withAuthorization(token.value),
        body: JSON.stringify({ url: xLink(22) }),
      });

      const waitAfter = secondsUntilMidnight(Date.now());
      const wait = Number(response.headers.get("retry-after"));

      assert.equal(response.status, 429);
      assert.ok(
        waitAfter > waitBefore || (wait <= waitBefore && wait >= waitAfter),
        `Retry-After was ${String(wait)}, between ${String(waitAfter)} and ${String(waitBefore)} expected`,
      );
    });

    it("never sends a Retry-After below one second, whatever millisecond midnight falls on while the refusal is built", async () => {
      const token = await makeToken(instance, 1);
      const midnight = nextMidnight(Date.now());

      assert.equal(
        (
          await atClock(
            () => midnight - 1,
            () => addLink(instance, token, 24),
          )
        ).status,
        201,
      );

      const addAhead = (ahead: number) =>
        atClock(steppingClock(midnight - ahead), () =>
          instance.fetch("/api/items", {
            method: "POST",
            headers: withAuthorization(token.value),
            body: JSON.stringify({ url: xLink(1000 + ahead) }),
          }),
        );

      const waits: number[] = [];

      for (let ahead = 1; ahead <= LAST_REQUEST_STEPS; ahead += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Each request runs on its own clock, one after the other.
        const response = await addAhead(ahead);

        if (response.status === 429) waits.push(Number(response.headers.get("retry-after")));
      }

      assert.ok(waits.length > LAST_REQUEST_STEPS / 4, `${String(waits.length)} refusals`);
      assert.ok(
        waits.every((wait) => Number.isInteger(wait) && wait >= 1),
        `a Retry-After below one second: ${waits.filter((wait) => wait < 1).join(", ")}`,
      );
    });

    it("starts a new UTC day with a full budget when the clock passes midnight, and the earlier day no longer counts", async () => {
      const token = await makeToken(instance, 1);
      const midnight = nextMidnight(Date.now());

      const lastMinute = await atClock(
        () => midnight - MINUTE_MS,
        async () => [await addLink(instance, token, 51), await addLink(instance, token, 52)],
      );

      assert.deepEqual(
        lastMinute.map(({ status }) => status),
        [201, 429],
      );

      const firstMinute = await atClock(
        () => midnight + MINUTE_MS,
        async () => ({
          budget: await budgetOf(instance, token.id),
          adds: [await addLink(instance, token, 52), await addLink(instance, token, 53)],
        }),
      );

      assert.equal(firstMinute.budget.kind, "within");
      assert.deepEqual(
        firstMinute.adds.map(({ status }) => status),
        [201, 429],
      );
      assert.deepEqual(itemsSavedByDay(instance, token.id), [
        [dayOf(midnight - MINUTE_MS), 1],
        [dayOf(midnight + MINUTE_MS), 1],
      ]);
    });
  });

  const PAGE = {
    markdown: "A page of text that an agent read in its own tab.\n\n".repeat(20),
    title: "A page",
  };

  const withPage = (token: Awaited<ReturnType<typeof makeToken>>, address: string) =>
    instance.sendWithToken(token.value, "POST", "/api/items", { url: address, page: PAGE });

  const withContent = (token: Awaited<ReturnType<typeof makeToken>>, postId: string) =>
    instance.sendWithToken(token.value, "POST", "/api/items", {
      url: `https://x.com/someone/status/${postId}`,
      content: [JSON.stringify(authored(postId))],
    });

  describe("every way a token adds an Item draws on the same daily budget", () => {
    let agents: Agents;
    let mcpToken: Awaited<ReturnType<typeof makeToken>>;

    before(async () => {
      mcpToken = await makeToken(instance, 2, "mcp budget");
      agents = await connectBoth(instance, mcpToken);
    });

    after(async () => {
      await agents.legacy.close();
      await agents.modern.close();
    });

    it("counts a link, a link with a page, a link with a thread and each new link of a batch", async () => {
      const token = await makeToken(instance, 10);

      assert.equal((await addLink(instance, token, 201)).status, 201);
      assert.equal((await withPage(token, "https://example.com/budget-page")).status, 201);
      assert.equal((await withContent(token, POST_ID)).status, 201);
      assert.equal((await addBatch(instance, token, [202, 203])).status, 200);

      const state = await budgetOf(instance, token.id);

      assert.ok(state.kind === "within" && state.added === 5 && state.left === 5);
    });

    it("attributes a short link whose resolution failed to its token and counts it toward the budget", async () => {
      const token = await makeToken(instance, 1);
      const short = "https://t.co/failedfirst";

      const first = await saveUnresolved(instance.core, {
        paste: { address: short, addedByToken: token.id },
        link: parseLink(short),
        fetched: { status: "unresolved" },
        existing: "refresh",
      });

      assert.equal(first?.kind === "saved" && first.created, true);

      const state = await budgetOf(instance, token.id);

      assert.ok(state.kind === "spent" && state.added === 1);
    });

    it("refuses a link, a page, a thread and a batch of new links with 429 once the budget is spent, and saves none", async () => {
      const token = await makeToken(instance, 1);

      await addLink(instance, token, 211);

      const itemsBefore = total(instance, "items");

      const answers = await Promise.all([
        addLink(instance, token, 212),
        withPage(token, "https://example.com/budget-page-two"),
        withContent(token, "1000000000000000099"),
        addBatch(instance, token, [213, 214]),
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
      const first = await callBoth(agents, "add", { url: xLink(221) });
      const second = await callBoth(agents, "add", { url: xLink(222) });

      assert.deepEqual(
        [...first, ...second].map(({ isError }) => isError),
        [false, false, false, false],
      );

      const over = await callBoth(agents, "add", { url: xLink(223) });

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
});
