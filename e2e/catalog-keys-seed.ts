import { type Seed, migrationsBefore } from "./seeded.ts";

const EVERY_MIGRATION = migrationsBefore("9");

function previousReleaseKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().trim().replaceAll(/\s+/gu, " ");
}

function text(value: string): string {
  return `'${value.replaceAll("\n", "' || char(10) || '")}'`;
}

function names(table: "topics" | "tags", list: readonly string[]): string {
  const rows = list.map((name) => `(${text(previousReleaseKey(name))}, ${text(name)})`);

  return `INSERT INTO ${table} (key, name) VALUES ${rows.join(", ")};`;
}

export const TOPICS = [
  "Straße",
  "STRASSE",
  "İstanbul",
  "Istanbul",
  "café",
  "cafe",
  "ΟΔΟΣ",
  "οδοσ",
  "İzmir",
] as const;

export const TAGS = [
  "Straße",
  "STRASSE",
  "İstanbul",
  "Istanbul",
  "ΟΔΟΣ",
  "οδοσ",
  "café",
  "cafe",
  "İzmir",
  "Notes",
] as const;

export const ITEM_TOPICS = [1, 2, 3, 4, 7, 8, 5, 9, 6] as const;

export const ITEM_TAGS: readonly (readonly number[])[] = [
  [1, 3],
  [2, 4, 10],
  [3, 4],
  [5],
  [6],
  [7],
  [8],
  [9],
  [],
];

const STOP_RECONCILER =
  "CREATE TRIGGER stop_reconciler BEFORE INSERT ON search_fingerprints BEGIN SELECT RAISE(ABORT, 'held back for the test'); END;";

const MARK_IDENTITY_DONE =
  "INSERT INTO data_steps (name, version, cursor) VALUES ('item-identity', 1, NULL);";

function itemRow(index: number): string {
  const id = index + 1;
  const url = `https://example.com/catalog-${id}`;

  return `(${id}, 'article', 'article', '${url}', '${url}', ${1000 + id}, ${ITEM_TOPICS[index] ?? 0})`;
}

function linkRows(): string {
  return ITEM_TAGS.flatMap((tagIds, index) =>
    tagIds.map((tagId) => `(${index + 1}, ${tagId})`),
  ).join(", ");
}

function partRows(): string {
  return ITEM_TAGS.flatMap((tagIds, index) =>
    tagIds.length === 0
      ? []
      : [
          `(${index + 1}, 'tags', ${text(tagIds.map((tagId) => TAGS[tagId - 1] ?? "").join("\n"))})`,
        ],
  ).join(", ");
}

export const PREVIOUS_RELEASE: Seed = {
  files: EVERY_MIGRATION,
  sql: `
${MARK_IDENTITY_DONE}
${STOP_RECONCILER}
${names("topics", TOPICS)}
${names("tags", TAGS)}
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at, topic_id) VALUES ${ITEM_TOPICS.map((_, index) => itemRow(index)).join(", ")};
INSERT INTO item_tags (item_id, tag_id) VALUES ${linkRows()};
INSERT INTO search_parts (item_id, kind, body) VALUES ${partRows()};
INSERT INTO ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, result) VALUES ('digest', '{}', 0, 'seed', 1, 0, 'done', '{}');
INSERT INTO digests (item_id, digest, title, topic, task_id, provider, model, generation, created_at) VALUES (1, '{"title":"One","topic":"Straße","tags":["Straße","İstanbul"],"summary":"Kept.","keyPoints":["Kept."]}', 'One', 'Straße', 1, 'seed', 'seed', 0, 1), (2, '{"title":"Two","topic":"STRASSE","tags":["STRASSE","Istanbul","Notes"],"summary":"Kept.","keyPoints":["Kept."]}', 'Two', 'STRASSE', 1, 'seed', 'seed', 0, 1);
`,
};

const OLDER_DIGEST = {
  topics: { topic: "Istanbul", tags: [] },
  tags: { topic: "Reading", tags: ["Istanbul"] },
} as const;

export function heldBeforeRename(table: "topics" | "tags"): Seed {
  return {
    files: PREVIOUS_RELEASE.files,
    sql: `${PREVIOUS_RELEASE.sql}
CREATE TRIGGER hold_rename BEFORE UPDATE OF key ON ${table} BEGIN SELECT RAISE(ABORT, 'stopped for the test'); END;
`,
  };
}

export function olderDigestRows(table: "topics" | "tags"): string {
  const digest = JSON.stringify({
    title: "Ten",
    ...OLDER_DIGEST[table],
    summary: "Kept.",
    keyPoints: ["Kept."],
  });

  return `INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at) VALUES (10, 'article', 'article', 'https://example.com/older-digest', 'https://example.com/older-digest', 1010);
INSERT INTO digests (item_id, digest, title, topic, task_id, provider, model, generation, created_at) VALUES (10, '${digest}', 'Ten', '${OLDER_DIGEST[table].topic}', 1, 'seed', 'seed', 0, 1);`;
}

export const PAGED_ITEMS = 1200;

export const PAGED_PAIRS = 60;

export const STOPPED_AT_TAG = 2;

export const PAGED_PREVIOUS_RELEASE: Seed = {
  files: EVERY_MIGRATION,
  sql: `
${MARK_IDENTITY_DONE}
${STOP_RECONCILER}
INSERT INTO topics (key, name) VALUES (${text(previousReleaseKey("Straße"))}, 'Straße'), (${text(previousReleaseKey("STRASSE"))}, 'STRASSE');
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${PAGED_PAIRS})
INSERT INTO tags (id, key, name)
SELECT 2 * i - 1, ${text(previousReleaseKey("Straße"))} || ' ' || i, 'Straße ' || i FROM n
UNION ALL SELECT 2 * i, ${text(previousReleaseKey("STRASSE"))} || ' ' || i, 'STRASSE ' || i FROM n;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${PAGED_ITEMS})
INSERT INTO items (id, source, kind, normalized_url, original_url, saved_at, topic_id)
SELECT i, 'article', 'article', 'https://example.com/paged-' || i, 'https://example.com/paged-' || i, 5000 + i, 2 FROM n;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${PAGED_ITEMS})
INSERT INTO item_tags (item_id, tag_id) SELECT i, ${STOPPED_AT_TAG} FROM n UNION ALL SELECT i, 2 * (2 + i % (${PAGED_PAIRS} - 1)) FROM n;
CREATE TRIGGER stop_batch BEFORE DELETE ON tags WHEN OLD.id = ${STOPPED_AT_TAG} BEGIN SELECT RAISE(ABORT, 'stopped for the test'); END;
`,
};
