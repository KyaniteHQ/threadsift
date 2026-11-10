import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

import { AiSettingsViewSchema } from "../src/core/ai-contract.ts";
import type { Instance } from "./access.ts";
import { type Seed, migrationsBefore } from "./seeded.ts";

const SEALED_HTTP_KEY = "v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export const BEFORE_WORKERS_AI: Seed = {
  files: migrationsBefore("0012"),
  sql: `INSERT INTO settings (id, provider, base_url, model, sealed_key) VALUES (1, 'openrouter', 'https://openrouter.ai/api/v1', 'kept-model', '${SEALED_HTTP_KEY}');
INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title) VALUES ('article', 'article', 'https://example.com/older', 'https://example.com/older', 1111, 'Older');
INSERT INTO ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, result) VALUES (1, 'digest', 'older input', 1, 'http', 1, 5, 'done', '{}');
INSERT INTO digests (item_id, digest, title, topic, task_id, provider, model, generation, created_at) VALUES (1, '{"title":"Older digest"}', 'Older digest', 'Reading', 1, 'openrouter', 'kept-model', 0, 1)`,
};

const StoredSettings = z.array(
  z.object({
    provider: z.string(),
    base_url: z.string().nullable(),
    model: z.string(),
    sealed_key: z.string().nullable(),
  }),
);

const StoredTasks = z.array(
  z.object({ executor: z.string(), provider: z.string().nullable(), model: z.string().nullable() }),
);

export async function expectHttpRowsKept(
  instance: Instance,
  owner: APIRequestContext,
): Promise<void> {
  expect(
    instance.query("SELECT provider, base_url, model, sealed_key FROM settings", StoredSettings),
  ).toEqual([
    {
      provider: "openrouter",
      base_url: "https://openrouter.ai/api/v1",
      model: "kept-model",
      sealed_key: SEALED_HTTP_KEY,
    },
  ]);

  expect(instance.query("SELECT executor, provider, model FROM ai_tasks", StoredTasks)).toEqual([
    { executor: "http", provider: null, model: null },
  ]);

  const view = await owner.get("/api/settings/ai");
  expect(AiSettingsViewSchema.parse(await view.json()).settings).toEqual({
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "kept-model",
    keySet: true,
  });

  expect(() => {
    instance.sql("UPDATE settings SET provider = 'workers-ai'");
  }).toThrow();

  expect(() => {
    instance.sql("UPDATE settings SET sealed_key = NULL");
  }).toThrow();
}
