import assert from "node:assert/strict";

import { z } from "zod";

import { readDisagreementInput } from "../src/core/disagreement-input.ts";
import { disagreementRun } from "../src/core/disagreement-job.ts";
import { storedOutcome } from "../src/core/weekly-model-run.ts";
import type { Instance } from "./instance.ts";
import type { interrupted } from "./interrupted-database.ts";
import { script } from "./pin-fixtures.ts";
import { exec, paste, rows, until } from "./related-fixtures.ts";

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

export interface Pasted {
  readonly topic: string;
  readonly title?: string;
  readonly summary?: string;
  readonly noDigest?: boolean;
}

export function pasteItems(
  instance: Instance,
  specs: readonly Readonly<Pasted>[],
): Promise<readonly number[]> {
  return specs.reduce<Promise<readonly number[]>>(async (pending, spec, at) => {
    const ids = await pending;

    const id = await paste(instance, `disagree/${String(at)}`, {
      title: spec.title ?? `Title ${String(at + 1)}`,
      topic: spec.topic,
      summary: spec.summary ?? `Summary ${String(at + 1)}.`,
      noDigest: spec.noDigest === true,
      url: `https://example.com/disagree/${String(at)}`,
    });

    return [...ids, id];
  }, Promise.resolve([]));
}

export async function replaceDigest(
  instance: Instance,
  itemId: number,
  fixture: Readonly<Pick<Pasted, "topic" | "title" | "summary">>,
): Promise<void> {
  const before = tokenOf(instance, itemId);

  const [stored] = rows(
    instance,
    z.object({ original_url: z.string() }),
    "select original_url from items where id = ?",
    itemId,
  );

  if (stored === undefined) throw new Error(`Item ${String(itemId)} is not saved`);

  await paste(instance, "replaced", {
    title: fixture.title ?? `Title ${String(itemId)}`,
    topic: fixture.topic,
    summary: fixture.summary ?? "A replaced summary.",
    url: stored.original_url,
  });
  await until(
    () => tokenOf(instance, itemId),
    (token) => token !== before,
  );
}

export function runningTask(instance: Instance, state = "running"): number {
  exec(
    instance,
    "insert into ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state) values ('disagreement_proposals', '{}', 0, 'cli', 1, 4102444800000, ?)",
    state,
  );

  const [row] = rows(instance, z.object({ id: z.number() }), "select max(id) as id from ai_tasks");

  if (row === undefined) throw new Error("no AI task was stored");

  return row.id;
}

export const taskState = (instance: Instance, id: number): string | undefined =>
  rows(instance, z.object({ state: z.string() }), "select state from ai_tasks where id = ?", id)[0]
    ?.state;

export const membersText = (instance: Instance, itemIds: readonly number[]): string =>
  itemIds.map((id) => `${String(id)}:${String(tokenOf(instance, id))}`).join(",");

export const topicIdOf = (instance: Instance, name: string): number => {
  const [row] = rows(
    instance,
    z.object({ id: z.number() }),
    "select id from topics where name = ?",
    name,
  );

  if (row === undefined) throw new Error(`Topic ${name} does not exist`);

  return row.id;
};

export type ReadingDatabase = ReturnType<typeof interrupted>;

export async function sentTopics(db: ReadingDatabase) {
  const read = await readDisagreementInput(db);

  assert.ok(read !== null);

  return read.sent;
}

export async function applyAnswer(
  { db, sent }: Readonly<{ db: ReadingDatabase; sent: Awaited<ReturnType<typeof sentTopics>> }>,
  taskId: number,
  disagreements: readonly Readonly<{ a: number; b: number; reason: string }>[],
): Promise<void> {
  const { writes } = storedOutcome(db, disagreementRun, {
    sent,
    taskId,
    result: { disagreements },
  });

  const [head, ...rest] = writes;

  assert.ok(head !== undefined);
  await db.batch([head, ...rest]);
}
