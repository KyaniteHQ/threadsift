import { type Seed, migrationsBefore } from "./seeded.ts";

const BEFORE_IDENTITY_STEP = migrationsBefore("0024");

function xId(last: number): string {
  return `185000000000000000${last}`;
}

export const ITEMS = [
  [1, "x", "x-post", `https://x.com/Alice/status/${xId(1)}`],
  [2, "x", "x-post", `https://twitter.com/bob/status/${xId(2)}/photo/1`],
  [3, "github", "github-repo", "https://github.com/KyaniteHQ/threadsift"],
  [4, "github", "github-repo", "https://github.com/Foo/Bar.git"],
  [5, "reddit", "reddit-post", "https://reddit.com/r/all/comments/ABC123/"],
  [6, "reddit", "reddit-comment", "https://reddit.com/r/all/comments/abc123/_/DEF456/"],
  [7, "x", "x-post", `https://x.com/Carol/status/${xId(3)}`],
  [8, "x", "x-post", `https://twitter.com/carol/status/${xId(3)}/photo/1`],
  [9, "x", "x-post", `https://x.com/i/status/${xId(3)}`],
  [10, "github", "github-repo", "https://github.com/Dup/Repo"],
  [11, "github", "github-repo", "https://github.com/dup/repo/"],
  [12, "reddit", "reddit-post", "https://reddit.com/r/all/comments/ABC999/"],
  [13, "reddit", "reddit-post", "https://reddit.com/r/all/comments/abc999/"],
  [14, "article", "article", "https://example.com/a"],
  [15, "github", "github-repo", "https://github.com/KyaniteHQ/threadsift/issues/1"],
  [16, "x", "x-post", `https://x.com/i/status/${xId(9)}`],
  [17, "github", "github-repo", "https://github.com/kyanitehq/other"],
] as const;

export const RENAMED = [
  [1, `https://x.com/i/status/${xId(1)}`],
  [2, `https://x.com/i/status/${xId(2)}`],
  [3, "https://github.com/kyanitehq/threadsift"],
  [4, "https://github.com/foo/bar"],
  [5, "https://reddit.com/r/all/comments/abc123/"],
  [6, "https://reddit.com/r/all/comments/abc123/_/def456/"],
] as const;

export const COLLISIONS = [
  { ids: [7, 8, 9], identity: `https://x.com/i/status/${xId(3)}` },
  { ids: [10, 11], identity: "https://github.com/dup/repo" },
  { ids: [12, 13], identity: "https://reddit.com/r/all/comments/abc999/" },
] as const;

export const ALICE_POSTED = `https://twitter.com/alice/status/${xId(1)}`;

export const CAROL_POSTED = `https://x.com/Carol/status/${xId(3)}`;

function row([id, source, kind, url]: (typeof ITEMS)[number]): string {
  return `(${id}, '${source}', '${kind}', '${url}', '${url}', ${1000 + id})`;
}

export const BEFORE_IDENTITY: Seed = {
  files: BEFORE_IDENTITY_STEP,
  sql: `
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at) VALUES ${ITEMS.map((item) => row(item)).join(", ")};
UPDATE items SET title = 'KyaniteHQ/threadsift', post_text = 'A README.', read_state = 'read', generation = 2, fetch_result = 'ok', fetched_at = 1500 WHERE id = 3;
INSERT INTO ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, result) VALUES ('digest', '{}', 0, 'seed', 1, 0, 'done', '{}');
INSERT INTO topics (key, name) VALUES ('tools', 'Tools');
INSERT INTO tags (key, name) VALUES ('notes', 'Notes');
INSERT INTO digests (item_id, digest, title, topic, task_id, provider, model, generation, created_at) VALUES (3, '{"title":"A digest","topic":"Tools","tags":["Notes"],"summary":"Kept.","keyPoints":["Kept."]}', 'A digest', 'Tools', 1, 'seed', 'seed', 2, 1);
INSERT INTO item_tags (item_id, tag_id) VALUES (3, 1);
INSERT INTO github_repos (item_id, description, stars, language, license, topics, pushed_at) VALUES (3, 'A repository.', 12, 'TypeScript', 'MIT', '["reading"]', 1400);
INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('fetch', 1, 'https://x.com/Alice/status/${xId(1)}', 'done', 1, 1000);
`,
};

export const MANY_RENAMES = 1200;

export const INTERRUPTED_AT = 1130;

export const MANY_BEFORE: Seed = {
  files: BEFORE_IDENTITY_STEP,
  sql: `
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${MANY_RENAMES})
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at)
SELECT i, 'github', 'github-repo', 'https://github.com/Org/Repo-' || i, 'https://github.com/Org/Repo-' || i, 5000 + i FROM n;
CREATE TRIGGER stop_batch BEFORE UPDATE OF normalized_url ON items WHEN OLD.id = ${INTERRUPTED_AT} BEGIN SELECT RAISE(ABORT, 'stopped for the test'); END;
`,
};

export const LONG_RENAMES = 100;

export const LONG_QUERY_CHARS = 12_000;

export const REPEATED_SUFFIXES = 12_000;

export const REPEATED_SUFFIX_ITEM = LONG_RENAMES + 1;

export const LONG_BEFORE: Seed = {
  files: BEFORE_IDENTITY_STEP,
  sql: `
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${LONG_RENAMES})
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at)
SELECT i, 'github', 'github-repo',
  'https://github.com/Org/Repo-' || i || '?q=' || substr(hex(zeroblob(${LONG_QUERY_CHARS / 2})), 1, ${LONG_QUERY_CHARS}),
  'https://github.com/Org/Repo-' || i, 5000 + i FROM n;
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at)
VALUES (${LONG_RENAMES + 1}, 'github', 'github-repo', 'https://github.com/o/r' || replace(hex(zeroblob(${REPEATED_SUFFIXES})), '00', '.git'), 'https://github.com/o/r', 6000);
`,
};

export const FAILING_BEFORE: Seed = {
  files: BEFORE_IDENTITY_STEP,
  sql: `${BEFORE_IDENTITY.sql}
CREATE TRIGGER stop_batch BEFORE UPDATE OF normalized_url ON items WHEN OLD.id = 1 BEGIN SELECT RAISE(ABORT, 'stopped for the test'); END;
`,
};

export const APPLIED_BEFORE_STOP = 1000;

export const RIVAL = {
  id: 18,
  of: 2,
  taken: `https://x.com/i/status/${xId(2)}`,
  stays: `https://twitter.com/bob/status/${xId(2)}/photo/1`,
} as const;

export const NEWER_RELEASE_VERSION = 3;

export const SEEDED_COLUMNS = ITEMS.map(([id, , kind, url]) => ({
  id,
  original_url: url,
  kind,
  saved_at: 1000 + id,
  read_state: id === 3 ? "read" : "unread",
  generation: id === 3 ? 2 : 0,
  title: id === 3 ? "KyaniteHQ/threadsift" : null,
}));
