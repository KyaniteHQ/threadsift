import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

const AnyRowSchema = z.record(z.string(), z.unknown());

export const script = (instance: Instance, statements: string): void => {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    database.exec(statements);
  } finally {
    database.close();
  }
};

export const dump = (instance: Instance, query: string): string =>
  JSON.stringify(rows(instance, AnyRowSchema, query));

export const item = (
  id: number,
  tags: readonly number[],
  digestTags: readonly string[],
  { topic = "Reading", topicId = null }: Readonly<{ topic?: string; topicId?: number | null }> = {},
): string => `
  insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id)
    values (${String(id)}, 'other', 'link', 'https://example.com/${String(id)}', 'https://example.com/${String(id)}', ${String(id)}, ${topicId === null ? "null" : String(topicId)});
  insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
    values (${String(id)}, 'digest', '{}', 0, 'caller', 1, 0, 'done', ${String(id)});
  insert into digests (item_id, digest, title, topic, task_id, generation, created_at)
    values (${String(id)}, '${JSON.stringify({ title: "T", topic, tags: digestTags, summary: "S", keyPoints: ["K"] })}', 'T', '${topic}', ${String(id)}, 0, 1);
  ${tags.map((tag) => `insert into item_tags (item_id, tag_id) values (${String(id)}, ${String(tag)});`).join("\n")}`;

export const holdSweep = (instance: Instance): void => {
  exec(
    instance,
    "insert or replace into scheduled_runs (task, last_run_at) values ('sweep', ?)",
    Date.now(),
  );
};

export const rerunSteps = async (
  instance: Instance,
  ...steps: readonly string[]
): Promise<void> => {
  for (const name of steps) exec(instance, "delete from data_steps where name = ?", name);

  holdSweep(instance);
  await instance.tick();
};

export const seedTopicItems = (
  instance: Instance,
  {
    topicId,
    name,
    from,
    items,
  }: Readonly<{ topicId: number; name: string; from: number; items: number }>,
): void => {
  const range = `with recursive n(i) as (select ${String(from)} union all select i + 1 from n where i < ${String(from + items - 1)})`;

  const json = JSON.stringify({
    title: "T",
    topic: name,
    tags: [],
    summary: "S",
    keyPoints: ["K"],
  });

  script(
    instance,
    `
    ${range}
    insert into items (id, source, kind, normalized_url, original_url, saved_at, status, topic_id)
    select i, 'other', 'link', 'https://example.com/' || i, 'https://example.com/' || i, i, 'ready', ${String(topicId)} from n;
    ${range}
    insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
    select i, 'digest', '{}', 0, 'caller', 1, 0, 'done', i from n;
    ${range}
    insert into digests (item_id, digest, title, topic, task_id, generation, created_at)
    select i, '${json}', 'T', '${name}', i, 0, 1 from n;`,
  );
};

export const seedLogEntries = (
  instance: Instance,
  { topicId, name, entries }: Readonly<{ topicId: number; name: string; entries: number }>,
): void => {
  script(
    instance,
    `with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(entries)})
     insert into log_entries (at, action, topic, topic_id)
     select i, 'topic', '${name}', ${String(topicId)} from n;`,
  );
};

export const LOSER_ITEMS = 1100;

export const LOSER_FIRST_ITEM = 1000;

export const seedLibrary = (instance: Instance): void => {
  script(
    instance,
    `
    insert into catalog_version (id, version) values (1, 5);
    insert into topics (id, key, name) values
      (1, 'machine learning', 'Machine Learning'), (2, 'ml', 'ML'), (3, 'ai', 'AI'),
      (4, 'other', 'Other'), (5, 'fifth', 'Fifth');
    ${item(1, [], [], { topic: "Machine Learning", topicId: 1 })}
    ${item(2, [], [], { topic: "Machine Learning", topicId: 1 })}
    insert into topic_pages (topic_id, overview, revision, built_from, updated_at) values
      (1, 'About ML.', 1, '[{"item":1,"digest":1},{"item":2,"digest":2}]', 1),
      (2, 'About the loser.', 1, '[]', 1);
    insert into topic_leases (topic_id, holder, expires_at, generation) values (2, 'holder', 1, 1);
    insert into pins (id, kind, from_key, from_name, into_topic_id, created_at) values
      (1, 'topic-merge', 'ml', 'ML', 1, 1),
      (2, 'topic-merge', 'old', 'Old', 2, 2);
    insert into proposals (id, kind, from_topic_id, into_topic_id, reason, state, created_at) values
      (1, 'topic-merge', 1, 3, 'Same.', 'open', 1),
      (2, 'topic-merge', 2, 3, 'Same.', 'open', 1),
      (3, 'topic-merge', 2, 1, 'Same.', 'open', 1),
      (4, 'topic-merge', 2, 4, 'Same.', 'open', 1),
      (5, 'topic-merge', 2, 5, 'Same.', 'rejected', 1),
      (6, 'topic-merge', 1, 5, 'Same.', 'open', 1);
    insert into data_step_renames (step, subject, old_key, new_key) values
      ('topic-keys', 2, 'ml', 'ml'), ('topic-keys', 1, 'machine learning', 'machine learning');`,
  );
  seedTopicItems(instance, {
    topicId: 2,
    name: "ML",
    from: LOSER_FIRST_ITEM,
    items: LOSER_ITEMS,
  });
  script(
    instance,
    `
    insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id)
      values (9000, 'other', 'link', 'https://example.com/9000', 'https://example.com/9000', 9000, 2);
    insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
      values (9000, 'digest', '{}', 0, 'caller', 1, 0, 'done', 9000);
    insert into digests (item_id, digest, title, topic, task_id, generation, created_at)
      values (9000, 'not json', 'T', 'ML', 9000, 0, 1);`,
  );
  seedLogEntries(instance, { topicId: 2, name: "ML", entries: 3 });
};

export const jobsOf = (instance: Instance): string =>
  dump(
    instance,
    "select item_id, kind, state from jobs where kind = 'topic_overview' order by item_id",
  );

export const FILLER_FIRST_ID = 10;

const FILLER_DIGEST = JSON.stringify({
  title: "T",
  topic: "Filler",
  tags: [],
  summary: "S",
  keyPoints: ["K"],
});

export const seedFillerMerges = (
  instance: Instance,
  { count, target }: Readonly<{ count: number; target: number }>,
): void => {
  const last = FILLER_FIRST_ID + count - 1;
  const range = `with recursive n(i) as (select ${String(FILLER_FIRST_ID)} union all select i + 1 from n where i < ${String(last)})`;

  script(
    instance,
    `
    ${range}
    insert into topics (id, key, name) select i, 'filler ' || i, 'Filler ' || i from n;
    ${range}
    insert into pins (kind, from_key, from_name, into_topic_id, created_at)
    select 'topic-merge', 'filler ' || i, 'Filler ' || i, ${String(target)}, i from n;
    ${range}
    insert into items (id, source, kind, normalized_url, original_url, saved_at, status, topic_id)
    select 100000 + i, 'other', 'link', 'https://example.com/filler/' || i, 'https://example.com/filler/' || i, i, 'ready', i from n;
    ${range}
    insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
    select 100000 + i, 'digest', '{}', 0, 'caller', 1, 0, 'done', 100000 + i from n;
    ${range}
    insert into digests (item_id, digest, title, topic, task_id, generation, created_at)
    select 100000 + i, '${FILLER_DIGEST}', 'T', 'Filler ' || i, 100000 + i, 0, 1 from n;`,
  );
};

export const topicNameOf = (instance: Instance, itemId: number): string | null =>
  rows(
    instance,
    z.object({ name: z.string().nullable() }),
    "select topics.name as name from items left join topics on topics.id = items.topic_id where items.id = ?",
    itemId,
  )[0]?.name ?? null;

export const storedDigestOf = (instance: Instance, itemId: number): string =>
  rows(
    instance,
    z.object({ digest: z.string() }),
    "select digest from digests where item_id = ?",
    itemId,
  )[0]?.digest ?? "";
