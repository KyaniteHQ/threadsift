import { z } from "zod";

import type { Instance } from "./instance.ts";
import { script } from "./pin-fixtures.ts";
import { exec, rows, until } from "./related-fixtures.ts";

export interface Seeded {
  readonly id: number;
  readonly topic: number | null;
  readonly token?: number;
  readonly savedAt?: number;
  readonly title?: string;
  readonly summary?: string;
  readonly digest?: string;
}

const quoted = (text: string): string => text.replaceAll("'", "''");

export function seedTopics(instance: Instance, names: Readonly<Record<number, string>>): void {
  script(
    instance,
    Object.entries(names)
      .map(
        ([id, name]) =>
          `insert into topics (id, key, name) values (${id}, '${name.toLowerCase()}', '${name}');`,
      )
      .join("\n"),
  );
}

export function seedDigested(instance: Instance, seeds: readonly Readonly<Seeded>[]): void {
  script(
    instance,
    seeds
      .map(({ id, topic, token = id, savedAt = id, title = `Title ${String(id)}`, summary }) => {
        const stored = JSON.stringify({
          title,
          topic: "T",
          tags: [],
          summary: summary ?? `Summary ${String(id)}.`,
          keyPoints: ["K"],
          keptComments: [],
        });

        return `
          insert into items (id, source, kind, normalized_url, original_url, saved_at, topic_id)
            values (${String(id)}, 'other', 'link', 'https://example.com/${String(id)}', 'https://example.com/${String(id)}', ${String(savedAt)}, ${topic === null ? "null" : String(topic)});
          insert or ignore into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id)
            values (${String(token)}, 'digest', '{}', 0, 'caller', 1, 0, 'done', ${String(id)});
          insert into digests (item_id, digest, title, topic, task_id, generation, created_at)
            values (${String(id)}, '${quoted(stored)}', '${quoted(title)}', 'T', ${String(token)}, 0, ${String(savedAt)});`;
      })
      .join("\n"),
  );
}

export const tokenOf = (instance: Instance, itemId: number): number => {
  const [row] = rows(
    instance,
    z.object({ task_id: z.number() }),
    "select task_id from digests where item_id = ?",
    itemId,
  );

  if (row === undefined) throw new Error(`Item ${String(itemId)} has no Digest`);

  return row.task_id;
};

export function proposeDisagreement(
  instance: Instance,
  [first, second]: readonly [number, number],
  state = "open",
): number {
  exec(
    instance,
    "insert into proposals (kind, from_item_id, into_item_id, from_digest, into_digest, reason, state, created_at) values ('items-disagree', ?, ?, ?, ?, 'They give opposite advice.', ?, 1)",
    first,
    second,
    tokenOf(instance, first),
    tokenOf(instance, second),
    state,
  );

  const [row] = rows(instance, z.object({ id: z.number() }), "select max(id) as id from proposals");

  if (row === undefined) throw new Error("no Proposal was stored");

  return row.id;
}

export const disagreementRows = (instance: Instance) =>
  rows(
    instance,
    z.object({
      id: z.number(),
      from_item_id: z.number(),
      into_item_id: z.number(),
      from_digest: z.number(),
      into_digest: z.number(),
      state: z.string(),
      reason: z.string().nullable(),
    }),
    "select id, from_item_id, into_item_id, from_digest, into_digest, state, reason from proposals where kind = 'items-disagree' order by id",
  );

export const checksOf = (instance: Instance) =>
  rows(
    instance,
    z.object({ topic_id: z.number(), members: z.string() }),
    "select topic_id, members from topic_checks order by topic_id",
  );

const InputSchema = z.object({
  topics: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      items: z.array(z.object({ id: z.number(), title: z.string(), summary: z.string() })),
    }),
  ),
  decided: z.array(z.tuple([z.number(), z.number()])),
});

export const tasksOf = (instance: Instance) =>
  rows(
    instance,
    z.object({ id: z.number(), inputs: z.string(), item_id: z.number() }),
    "select id, inputs, item_id from ai_tasks where kind = 'disagreement_proposals' order by id",
  );

export const sentOf = (instance: Instance) =>
  tasksOf(instance).map(({ inputs }) => InputSchema.parse(JSON.parse(inputs)));

export const jobsOf = (instance: Instance, kind = "disagreement_proposals") =>
  rows(
    instance,
    z.object({ id: z.number(), item_id: z.number(), state: z.string() }),
    "select id, item_id, state from jobs where kind = ? order by id",
    kind,
  );

export async function runWeek(instance: Instance): Promise<void> {
  const before = tasksOf(instance).length;

  exec(
    instance,
    "update jobs set state = 'done', claim_expires = null where kind = 'disagreement_proposals'",
  );
  exec(instance, "delete from scheduled_runs where task in ('sweep', 'disagreement_proposals')");
  await instance.tick();
  await until(
    () => ({
      tasks: tasksOf(instance).length,
      open: jobsOf(instance).filter(({ state }) => state !== "done").length,
    }),
    ({ tasks, open }) => tasks > before || open === 0,
  );
}

export const replaceDigest = (instance: Instance, itemId: number, token: number): void => {
  exec(
    instance,
    "insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state) values (?, 'digest', '{}', 0, 'caller', 1, 0, 'done')",
    token,
  );
  exec(instance, "update digests set task_id = ? where item_id = ?", token, itemId);
};
