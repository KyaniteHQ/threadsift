import { test } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { storeItem } from "./ingest.ts";
import { type Seed, migrationsBefore } from "./seeded.ts";

export const DEFUDDLE = "https://github.com/kepano/defuddle";
export const NO_README_REPOSITORY = "https://github.com/KyaniteHQ/homebrew-linctl";
export const RENAMED_REPOSITORY = "https://github.com/KyaniteHQ/commonplace";
export const RENAMED_TO = "KyaniteHQ/threadsift";

export const GITHUB_REQUESTS_PER_RUN = 10;

const RateLimitSchema = z.object({
  resources: z.object({
    core: z.object({ remaining: z.number().int(), reset: z.number().int() }),
  }),
});

export async function requireGithubBudget(requests: number): Promise<void> {
  const response = await fetch("https://api.github.com/rate_limit", {
    headers: { "user-agent": "Threadsift-e2e", accept: "application/vnd.github+json" },
  });

  const { remaining, reset } = RateLimitSchema.parse(await response.json()).resources.core;

  if (remaining >= requests) return;

  const message = `GitHub rate limit: ${remaining} unauthenticated requests remain for this address until ${new Date(reset * 1000).toISOString()}, and this test sends ${requests}`;

  if (process.env["GITHUB_ACTIONS"] === "true")
    throw new Error(`${message}; rerun after the reset`);

  test.skip(true, message);
}

const StoredRepositories = z.array(
  z.object({
    description: z.string().nullable(),
    stars: z.number(),
    language: z.string().nullable(),
    license: z.string().nullable(),
    topics: z.string(),
    pushed_at: z.number().nullable(),
  }),
);

const StoredParts = z.array(z.object({ kind: z.string(), body: z.string() }));

export function storedOf(itemId: number) {
  const instance = mainInstance();

  return {
    repository: instance.query(
      `SELECT description, stars, language, license, topics, pushed_at FROM github_repos WHERE item_id = ${itemId}`,
      StoredRepositories,
    ),
    parts: instance.query(
      `SELECT kind, body FROM search_parts WHERE item_id = ${itemId} AND kind = 'repository'`,
      StoredParts,
    ),
  };
}

export const STALE = {
  title: "stale title",
  readme: "# Stale\n\nstale readme text",
  description: "stale description",
  topic: "stale-topic",
  stars: 1,
  language: "Stale",
  license: "STALE",
  pushedAt: 1000,
  fetchedAt: 1000,
} as const;

export function storeStaleRepository(url: string, word: string): number {
  const id = storeItem({
    normalized_url: url,
    source: "github",
    kind: "github-repo",
    title: STALE.title,
    post_text: `${STALE.readme} ${word}`,
    read_state: "read",
    fetch_result: "ok",
    fetched_at: STALE.fetchedAt,
  });

  const instance = mainInstance();

  instance.sql(
    `INSERT INTO github_repos (item_id, description, stars, language, license, topics, pushed_at) VALUES (${id}, '${STALE.description} ${word}', ${STALE.stars}, '${STALE.language}', '${STALE.license}', '["${STALE.topic}"]', ${STALE.pushedAt})`,
  );

  instance.sql(
    `INSERT INTO search_parts (item_id, kind, body) VALUES (${id}, 'repository', '${STALE.description} ${word}' || char(10) || '${STALE.topic}')`,
  );

  return id;
}

export const KEPT_DIGEST = {
  title: "Kept digest title",
  generation: 7,
} as const;

const StoredGeneration = z.array(z.object({ generation: z.number() }));

export function storeKeptDigest(itemId: number): void {
  const instance = mainInstance();

  instance.sql(`UPDATE items SET generation = ${KEPT_DIGEST.generation} WHERE id = ${itemId}`);
  instance.sql(
    `INSERT INTO ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, result, item_id) VALUES ('digest', '{}', ${KEPT_DIGEST.generation}, 'seed', 1, 0, 'done', '{}', ${itemId})`,
  );
  instance.sql(
    `INSERT INTO digests (item_id, digest, title, topic, task_id, provider, model, generation, created_at) VALUES (${itemId}, '{"title":"${KEPT_DIGEST.title}"}', '${KEPT_DIGEST.title}', 'Reading', (SELECT max(id) FROM ai_tasks), 'seed', 'seed', ${KEPT_DIGEST.generation}, 1)`,
  );
}

export function markDigestFailed(itemId: number): void {
  mainInstance().sql(`UPDATE items SET digest_failed = 1 WHERE id = ${itemId}`);
}

export function generationOf(itemId: number): number | undefined {
  return mainInstance().query(
    `SELECT generation FROM items WHERE id = ${itemId}`,
    StoredGeneration,
  )[0]?.generation;
}

export const BEFORE_GITHUB: Seed = {
  files: migrationsBefore("0016"),
  sql: `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title, author, post_text, read_state, status, fetch_result, fetched_at) VALUES
    ('github', 'github-repo', 'https://github.com/someone/older', 'https://github.com/someone/older', 1111, 'someone/older', 'someone', 'An older README.', 'read', 'ready', 'ok', 1500),
    ('github', 'github-repo', 'https://github.com/someone/linkonly', 'https://github.com/someone/linkonly', 2222, NULL, NULL, NULL, 'unread', 'ready', 'status', NULL),
    ('article', 'article', 'https://example.com/older', 'https://example.com/older', 3333, 'An older article', NULL, 'Older text.', 'unread', 'ready', 'ok', 3500)`,
};
