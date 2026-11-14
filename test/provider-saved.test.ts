import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { loadAiConfig } from "../src/core/ai-load.ts";
import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { providerSet } from "../src/core/provider-saved.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { inOrder } from "./grok-bot-fixtures.ts";
import { chooseGrokBot } from "./grok-bot-provider-fixtures.ts";
import { exec } from "./related-fixtures.ts";

const MODEL_ROW =
  "insert into settings (id, provider, base_url, model, sealed_key) values (1, 'openrouter', 'https://openrouter.ai/api/v1', 'a-model', 'sealed')";

const bot = (flag: number) =>
  `insert into grok_bot_settings (id, webhook_url, sealed_key, updated_at, use_as_provider) values (1, 'https://example.com/hook', 'sealed', 1, ${String(flag)})`;

const STATES = {
  "nothing saved": [],
  "a model Provider": [MODEL_ROW],
  "Grok Bot saved and not chosen": [bot(0)],
  "Grok Bot chosen": [bot(1)],
  "Grok Bot flag holding 2": [bot(2)],
  "Grok Bot chosen and a model Provider": [bot(1), MODEL_ROW],
  "Grok Bot not chosen and a model Provider": [bot(0), MODEL_ROW],
} as const satisfies Readonly<Record<string, readonly string[]>>;

async function savedInSql(ports: Parameters<typeof loadAiConfig>[0]): Promise<boolean> {
  const [row] = await ports.db.select({ set: sql<number>`${providerSet()}` }).from(sql`(select 1)`);

  return row?.set === 1;
}

describe("a Provider counts as saved in SQL exactly when it does in loadAiConfig", () => {
  it("agrees in every state of the two Provider tables", async () => {
    const instance = await botInstance();

    try {
      await inOrder(Object.entries(STATES), async ([state, statements]) => {
        exec(instance, "delete from settings");
        exec(instance, "delete from grok_bot_settings");

        for (const statement of statements) exec(instance, statement);

        const loaded = await loadAiConfig(instance.core);

        assert.equal(
          await savedInSql(instance.core),
          loaded.saved !== undefined || loaded.botSelected,
          state,
        );
      });
    } finally {
      await instance.close();
    }
  });

  it("makes the Proposals page answer provider false until Grok Bot is chosen and true after", async () => {
    const instance = await botInstance();

    try {
      const before = await instance.read("GET", "/api/proposals", ProposalPageSchema);

      assert.equal(before.provider, false);

      const chosen = await chooseGrokBot(instance);

      assert.equal(chosen.status, 200, chosen.body);

      const after = await instance.read("GET", "/api/proposals", ProposalPageSchema);

      assert.equal(after.provider, true);
    } finally {
      await instance.close();
    }
  });
});
