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
