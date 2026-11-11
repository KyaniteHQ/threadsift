import { z } from "zod";

import { LogPageSchema } from "../src/core/log-contract.ts";
import type { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

const IdSchema = z.object({ id: z.number() });

const NameSchema = z.object({ name: z.string() });

const CountSchema = z.object({ n: z.number() });

export function count(instance: Instance, query: string, ...params: readonly (string | number)[]) {
  return rows(instance, CountSchema, query, ...params)[0]?.n ?? 0;
}

export function tagId(instance: Instance, name: string): number {
  const [row] = rows(instance, IdSchema, "select id from tags where name = ?", name);

  if (row === undefined) throw new Error(`no Tag named ${name}`);

  return row.id;
}

export function tagNames(instance: Instance): readonly string[] {
  return rows(instance, NameSchema, "select name from tags order by id").map(({ name }) => name);
}

export function propose(
  instance: Instance,
  [from, into]: readonly [string, string],
  state = "open",
): number {
  exec(
    instance,
    "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', ?, ?, 'Same thing.', ?, 1)",
    tagId(instance, from),
    tagId(instance, into),
    state,
  );

  const [row] = rows(instance, IdSchema, "select max(id) as id from proposals");

  if (row === undefined) throw new Error("no Proposal was stored");

  return row.id;
}

export function seedVolume(
  instance: Instance,
  { tags, items, from }: Readonly<{ tags: readonly string[]; items: number; from: number }>,
): void {
  const names = JSON.stringify(tags);

  exec(
    instance,
    `with recursive n(i) as (select ${String(from)} union all select i + 1 from n where i < ${String(from + items - 1)})
     insert into items (id, source, kind, normalized_url, original_url, saved_at, status)
     select 100000 + i, 'other', 'link', 'https://example.com/volume/' || i, 'https://example.com/volume/' || i, i, 'ready' from n`,
  );
  exec(
    instance,
    `with recursive n(i) as (select ${String(from)} union all select i + 1 from n where i < ${String(from + items - 1)})
     insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
     select 100000 + i, 'digest', '{}', 0, 'caller', 1, 0, 'done', 100000 + i from n`,
  );
  exec(
    instance,
    `with recursive n(i) as (select ${String(from)} union all select i + 1 from n where i < ${String(from + items - 1)})
     insert into digests (item_id, digest, title, topic, task_id, generation, created_at)
     select 100000 + i, json_object('title', 'Volume ' || i, 'topic', 'Volume', 'tags', json(?), 'summary', 'Short.', 'keyPoints', json_array('One point')), 'Volume ' || i, 'Volume', 100000 + i, 0, 1 from n`,
    names,
  );
}

export function linkVolume(
  instance: Instance,
  { tag, items, from }: Readonly<{ tag: string; items: number; from: number }>,
): void {
  exec(
    instance,
    `with recursive n(i) as (select ${String(from)} union all select i + 1 from n where i < ${String(from + items - 1)})
     insert into item_tags (item_id, tag_id) select 100000 + i, ? from n`,
    tagId(instance, tag),
  );
}

const DigestTagsSchema = z.object({ tags: z.string() });

export const accept = (instance: Instance, id: number) =>
  instance.send("POST", `/api/proposals/${String(id)}/accept`);

export const tagsOfDigest = (instance: Instance, itemId: number): string =>
  rows(
    instance,
    DigestTagsSchema,
    "select json_extract(digest, '$.tags') as tags from digests where item_id = ?",
    itemId,
  )[0]?.tags ?? "";

export const mergeLines = async (instance: Instance): Promise<readonly string[]> =>
  (await instance.read("GET", "/api/log", LogPageSchema)).entries.flatMap((entry) =>
    entry.action === "merge"
      ? [`${entry.from} into ${entry.into} | ${String(entry.items)} Items`]
      : [],
  );
