import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { withinBudget } from "../src/core/agent-token-budget.ts";
import { type BatchEntry } from "../src/core/batch-paste.ts";
import { saveFailedResolution } from "../src/core/failed-resolution.ts";
import { parseLink } from "../src/core/links.ts";
import { saveItem } from "../src/core/save-link.ts";
import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import {
  addLink,
  budgetOf,
  dayOf,
  execute,
  itemsCounted,
  itemsSavedByDay,
  makeToken,
  rows,
  total,
  xLink,
} from "./token-budget-fixtures.ts";

const ONE_DAY = 86_400_000;

describe("the counts of a token stay equal to the Items it created", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("counts and attributes the Items a batch recreates when a held link is deleted while the batch runs, so the count passes the budget by at most the deleted links", async () => {
    const token = await makeToken(instance, 2);

    const held = await Promise.all(
      [401, 402].map(async (number) =>
        SavedItemResponseSchema.parse(
          JSON.parse((await instance.send("POST", "/api/items", { url: xLink(number) })).body),
        ),
      ),
    );

    await addLink(instance, token, 403);

    const urls = [xLink(401), xLink(402), xLink(404)];

    const saved = await withinBudget(
      instance.core,
      { kind: "token", id: token.id },
      urls,
      async (saveAs) => {
        await Promise.all(
          held.map(({ item }) => instance.send("DELETE", `/api/items/${String(item.id)}`)),
        );

        const results = await Promise.all(
          urls.map((url) => saveItem(instance.core, url, undefined, "keep", saveAs)),
        );

        const entries = results.flatMap((result): BatchEntry[] =>
          result.kind === "saved"
            ? [{ outcome: result.created ? "added" : "known", item: result.item }]
            : [],
        );

        return { kind: "done", entries } as const;
      },
    );

    assert.equal(saved.kind, "done");
    assert.deepEqual(itemsSavedByDay(instance, token.id), itemsCounted(instance, token.id));

    const [[, counted] = [dayOf(Date.now()), 0]] = itemsCounted(instance, token.id);

    assert.equal(counted, 4);
    assert.equal(counted - 2, held.length);
  });

  it("charges and attributes a short link whose resolution failed", async () => {
    const token = await makeToken(instance, 1);

    const save = (short: string) =>
      saveFailedResolution(
        instance.core.db,
        short,
        parseLink(short),
        { status: "unresolved" },
        "refresh",
        token.id,
      );

    const first = await save("https://t.co/failedfirst");

    assert.equal(first?.kind === "saved" && first.created, true);
    const state = await budgetOf(instance, token.id);

    assert.ok(state.kind === "spent" && state.added === 1);

    const attributed = rows(
      instance,
      `select added_by_token as who from items where normalized_url = '${parseLink("https://t.co/failedfirst").normalizedUrl}'`,
    );

    assert.equal(attributed.length, 1);
    assert.equal(Object.values(attributed[0] ?? {})[0], token.id);

    const itemsBefore = total(instance, "items");

    await assert.rejects(save("https://t.co/failedsecond"), /agent_token_budget/u);
    assert.equal(total(instance, "items"), itemsBefore);
  });

  it("forgets the counts of days more than two days old when a token's last use renews, and keeps the recent days", async () => {
    const token = await makeToken(instance, 5);
    const now = Date.now();

    await addLink(instance, token, 410);

    for (const age of [10, 3, 2, 1]) {
      execute(
        instance,
        `insert into agent_token_days (token_id, day, added) values (${String(token.id)}, '${dayOf(now - age * ONE_DAY)}', 1)`,
      );
    }

    execute(instance, `update agent_tokens set last_used_at = 0 where id = ${String(token.id)}`);

    assert.equal((await instance.sendWithToken(token.value, "GET", "/api/items")).status, 200);

    assert.deepEqual(
      itemsCounted(instance, token.id).map(([day]) => day),
      [2, 1, 0].map((age) => dayOf(now - age * ONE_DAY)),
    );
  });
});
