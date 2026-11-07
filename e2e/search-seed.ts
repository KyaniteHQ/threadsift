import { readdirSync } from "node:fs";
import { join } from "node:path";

import type { Seed } from "./seeded.ts";

export const BEFORE_SEARCH = readdirSync(join(import.meta.dirname, "..", "migrations"))
  .filter((name) => name.endsWith(".sql") && name < "0009")
  .toSorted();

export const SEEDED_LATE_WORD = "untinctured";
export const SEEDED_WORD_COUNT = 90_000;

export const SEARCH_SEED: Seed = {
  files: BEFORE_SEARCH,
  sql: `
INSERT INTO ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, result) VALUES ('digest', '{}', 0, 'seed', 1, 0, 'done', '{}');
INSERT INTO topics (key, name) VALUES ('reading', 'Reading');
INSERT INTO tags (key, name) VALUES ('regency', 'Regency'), ('notes', 'Notes');
INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title, post_text, topic_id) VALUES
  ('article', 'article', 'https://example.com/long', 'https://example.com/long', 1111, 'Quillfeather ledger', replace(hex(zeroblob(${SEEDED_WORD_COUNT})), '00', 'abcdefghi ') || '${SEEDED_LATE_WORD}', 1),
  ('reddit', 'link', 'https://reddit.com/r/x/comments/1', 'https://reddit.com/r/x/comments/1', 2222, NULL, NULL, NULL),
  ('article', 'article', 'https://example.com/damaged', 'https://example.com/damaged', 3333, 'Marmalade notes', 'A short body.', 1);
INSERT INTO digests (item_id, digest, title, topic, task_id, provider, model, generation, created_at) VALUES
  (1, '{"title":"Ledger digest title","topic":"Reading","tags":["Regency"],"summary":"A marmalade summary.","keyPoints":["Kept."]}', 'Ledger digest title', 'Reading', 1, 'seed', 'seed', 0, 1),
  (3, 'not json', 'Damaged digest title', 'Reading', 1, 'seed', 'seed', 0, 1);
INSERT INTO item_tags (item_id, tag_id) VALUES (1, 1), (3, 2);
`,
};
