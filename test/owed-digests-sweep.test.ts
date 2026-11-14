import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { botInstance } from "./bot-task-fixtures.ts";
import { inOrder } from "./grok-bot-fixtures.ts";
import type { Instance } from "./instance.ts";
import { addressOf, threadOf, toolsOf } from "./one-hop-fixtures.ts";
import { exec, rows } from "./related-fixtures.ts";

const STRANDED = 45;

const ItemId = z.object({ item_id: z.number() });

async function strandedItems(instance: Instance, count: number): Promise<readonly number[]> {
  const tools = toolsOf(instance);
  const ids: number[] = [];

  await inOrder(
    Array.from({ length: count }, (_, index) => `stranded${String(index)}`),
    async (slug) => {
      const { item } = await tools.paste(addressOf(slug), threadOf(slug, {}));

      ids.push(item.id);
    },
  );

  return ids;
}

function digestJobItems(instance: Instance): readonly number[] {
  return rows(
    instance,
    ItemId,
    "select item_id from jobs where kind = 'digest' order by item_id",
  ).map(({ item_id: id }) => id);
}

async function nextSweep(instance: Instance): Promise<void> {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
}

describe("the sweep opens Digest jobs for Items that have a Digest source and no Digest, a few at a time, oldest first, while Grok Bot is the Provider", () => {
  it("opens 20 jobs a sweep for the oldest Items first until none is left", async () => {
    const instance = await botInstance();

    try {
      const ids = await strandedItems(instance, STRANDED);

      assert.deepEqual(digestJobItems(instance), []);

      exec(instance, "update grok_bot_settings set use_as_provider = 1 where id = 1");

      await nextSweep(instance);
      assert.deepEqual(digestJobItems(instance), ids.slice(0, 20));

      await nextSweep(instance);
      assert.deepEqual(digestJobItems(instance), ids.slice(0, 40));

      await nextSweep(instance);
      assert.deepEqual(digestJobItems(instance), ids);
    } finally {
      await instance.close();
    }
  });

  it("opens nothing while a model Provider is saved and Grok Bot is not chosen", async () => {
    const instance = await botInstance();

    try {
      await strandedItems(instance, 1);

      exec(
        instance,
        "insert into settings (id, provider, base_url, model, sealed_key) values (1, 'openrouter', 'https://openrouter.ai/api/v1', 'a-model', 'not-yet-active')",
      );

      await nextSweep(instance);

      assert.deepEqual(digestJobItems(instance), []);
    } finally {
      await instance.close();
    }
  });
});
