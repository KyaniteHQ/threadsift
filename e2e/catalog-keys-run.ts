import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";
import { count, dataSteps } from "./identity-run.ts";
import { sweepNow } from "./ingest.ts";

const Rows = z.array(z.object({ id: z.number(), key: z.string(), name: z.string() }));

const Links = z.array(z.object({ item_id: z.number(), tag_id: z.number() }));

const Owners = z.array(z.object({ id: z.number(), topic_id: z.number().nullable() }));

const Parts = z.array(z.object({ item_id: z.number(), body: z.string() }));

const Stored = z.array(z.object({ item_id: z.number(), digest: z.string() }));

export function finishedSteps(instance: Instance): string[] {
  return dataSteps(instance)
    .filter(({ version, cursor }) => version >= 1 && cursor === null)
    .map(({ name }) => name)
    .toSorted();
}

export async function runCatalogSteps(owner: APIRequestContext, instance: Instance) {
  await sweepNow(owner, instance);
  await expect
    .poll(() => finishedSteps(instance), { timeout: 120_000 })
    .toEqual(["item-identity", "tag-keys", "topic-keys"]);
}

export function catalogState(instance: Instance) {
  return {
    topics: instance.query("SELECT id, key, name FROM topics ORDER BY id", Rows),
    tags: instance.query("SELECT id, key, name FROM tags ORDER BY id", Rows),
    owners: instance.query("SELECT id, topic_id FROM items ORDER BY id", Owners),
    links: instance.query("SELECT item_id, tag_id FROM item_tags ORDER BY item_id, tag_id", Links),
    parts: instance
      .query("SELECT item_id, body FROM search_parts WHERE kind = 'tags' ORDER BY item_id", Parts)
      .map(({ item_id: itemId, body }) => ({ itemId, names: body.split("\n").toSorted() })),
    digests: instance.query("SELECT item_id, digest FROM digests ORDER BY item_id", Stored),
    staged: count(instance, "SELECT 1 FROM data_step_renames"),
  };
}

export function expectIntegrity(instance: Instance): void {
  expect(instance.query("PRAGMA foreign_key_check", z.array(z.unknown()))).toEqual([]);

  expect(() => {
    instance.sql("INSERT INTO search_index(search_index) VALUES ('integrity-check')");
  }).not.toThrow();

  for (const table of ["topics", "tags"]) {
    expect(() => {
      instance.sql(
        `INSERT INTO ${table} (key, name) SELECT key, 'again' FROM ${table} ORDER BY id LIMIT 1`,
      );
    }, `${table} keep their unique key`).toThrow();
  }
}
