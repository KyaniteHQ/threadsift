import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/http/schemas.ts";
import { botProviderInstance } from "./grok-bot-provider-fixtures.ts";
import type { Instance } from "./instance.ts";
import { addressOf, threadOf, toolsOf } from "./one-hop-fixtures.ts";
import { rows, until } from "./related-fixtures.ts";

const ADDRESS = addressOf("q1");

const PAGE = {
  markdown: "The post text is long enough for the page reader to keep it.\n\n".repeat(12),
  title: "A thread",
};

const SAVES = {
  "a thread pasted with its comments": async (instance: Instance) =>
    (await toolsOf(instance).paste(ADDRESS, threadOf("q1", {}))).item.id,
  "a post text the Extension read from the page": async (instance: Instance) =>
    (
      await instance.read("POST", "/api/items", SavedItemResponseSchema, {
        url: ADDRESS,
        page: PAGE,
      })
    ).item.id,
} as const satisfies Readonly<Record<string, (instance: Instance) => Promise<number>>>;

const StoredJob = z.object({ state: z.string() });

const FetchResult = z.object({ fetch_result: z.string().nullable() });

describe("a saved Reddit thread that has a Digest source gets a Digest job when Grok Bot is the Provider", () => {
  for (const [save, saved] of Object.entries(SAVES)) {
    it(save, async () => {
      const instance = await botProviderInstance();

      try {
        const id = await saved(instance);

        await until(
          () => rows(instance, FetchResult, "select fetch_result from items where id = ?", id),
          ([stored]) => stored?.fetch_result === "ok",
        );

        const opened = rows(
          instance,
          StoredJob,
          "select state from jobs where kind = 'digest' and item_id = ?",
          id,
        );

        assert.equal(opened.length, 1);
        assert.equal((await instance.detail(id)).digestOutcome, "pending");
      } finally {
        await instance.close();
      }
    });
  }
});
