import { readdirSync } from "node:fs";
import { join } from "node:path";

import type { Seed } from "./seeded.ts";

export const BEFORE_TASK_OWNER: Seed = {
  files: readdirSync(join(import.meta.dirname, "..", "migrations"))
    .filter((name) => name.endsWith(".sql") && name < "0014")
    .toSorted(),
  sql: `
INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title) VALUES
  ('article', 'article', 'https://example.com/a', 'https://example.com/a', 1111, 'First'),
  ('article', 'article', 'https://example.com/b', 'https://example.com/b', 2222, 'Second'),
  ('article', 'article', 'https://example.com/c', 'https://example.com/c', 3333, 'Third');
INSERT INTO ai_tasks (id, kind, inputs, input_revision, executor, provider, model, attempts, deadline, state, result, refusal, status) VALUES
  (1, 'digest', 'input one', 1, 'http', 'openrouter', 'kept-model', 1, 11, 'done', '{"one":1}', NULL, NULL),
  (2, 'digest', 'input two', 1, 'http', 'openrouter', 'kept-model', 1, 22, 'failed', NULL, 'unreachable', NULL),
  (3, 'digest', 'input three', 2, 'caller', NULL, NULL, 2, 33, 'done', '{"three":3}', NULL, NULL),
  (4, 'digest', 'input four', 1, 'http', 'openrouter', 'kept-model', 1, 44, 'done', '{"four":4}', NULL, NULL),
  (5, 'digest', 'input five', 1, 'http', 'openrouter', 'kept-model', 1, 55, 'failed', NULL, 'wrong-key', 401);
INSERT INTO digests (item_id, digest, title, topic, task_id, provider, model, generation, created_at) VALUES
  (1, '{"title":"First digest"}', 'First digest', 'Reading', 1, 'openrouter', 'kept-model', 0, 1),
  (2, '{"title":"Second digest"}', 'Second digest', 'Reading', 3, NULL, NULL, 0, 2);
`,
};
