import assert from "node:assert/strict";

import { z } from "zod";

import { LogPageSchema } from "../src/core/log-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { seedTopicItems } from "./pin-fixtures.ts";
import { exec, paste, rows } from "./related-fixtures.ts";

const IdSchema = z.object({ id: z.number() });

export function topicId(instance: Instance, name: string): number {
  const [row] = rows(instance, IdSchema, "select id from topics where name = ?", name);

  if (row === undefined) throw new Error(`no Topic named ${name}`);

  return row.id;
}

export function proposeTopics(
  instance: Instance,
  [from, into]: readonly [string, string],
  state = "open",
): number {
  exec(
    instance,
    "insert into proposals (kind, from_topic_id, into_topic_id, reason, state, created_at) values ('topic-merge', ?, ?, 'Same subject.', ?, 1)",
    topicId(instance, from),
    topicId(instance, into),
    state,
  );

  const [row] = rows(instance, IdSchema, "select max(id) as id from proposals");

  if (row === undefined) throw new Error("no Proposal was stored");

  return row.id;
}

export const heldLeases = (instance: Instance): number =>
  count(instance, "select count(*) as n from topic_leases where expires_at > ?", Date.now());

export const holdLease = (instance: Instance, topic: number, holder: string): void => {
  exec(
    instance,
    "insert or replace into topic_leases (topic_id, holder, expires_at, generation) values (?, ?, ?, 1)",
    topic,
    holder,
    Date.now() + 600_000,
  );
};

export const leaseGeneration = (instance: Instance, topic: number): number =>
  count(instance, "select generation as n from topic_leases where topic_id = ?", topic);

export const topicMergeLines = async (instance: Instance): Promise<readonly string[]> =>
  (await instance.read("GET", "/api/log", LogPageSchema)).entries.flatMap((entry) =>
    entry.action === "merge-topic"
      ? [`${entry.from} into ${entry.into} | ${String(entry.items)} Items`]
      : [],
  );

export const itemsOf = (instance: Instance, topic: number): number =>
  count(instance, "select count(*) as n from items where topic_id = ?", topic);

const AnswerSchema = z.object({ state: z.string().optional(), error: z.string().optional() });

export const answerOf = async (instance: Instance, id: number) => {
  const { status, body } = await accept(instance, id);

  return [status, AnswerSchema.parse(JSON.parse(body))];
};

export interface Library {
  readonly instance: Instance;
  readonly loser: number;
  readonly survivor: number;
  readonly third: number;
  readonly proposal: number;
}

export const withLibrary = async (
  run: (library: Library) => Promise<void>,
  { loserFirst = true }: Readonly<{ loserFirst?: boolean }> = {},
): Promise<void> => {
  const instance = await Instance.start();

  try {
    await instance.setUp();

    const topics = loserFirst ? ["Loser", "Survivor"] : ["Survivor", "Loser"];

    await topics.reduce(async (earlier, topic) => {
      await earlier;
      await paste(instance, topic.toLowerCase(), { title: topic, topic });
    }, Promise.resolve());
    await paste(instance, "third", { title: "Third", topic: "Third" });

    const loser = topicId(instance, "Loser");

    seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: 2 });
    await run({
      instance,
      loser,
      survivor: topicId(instance, "Survivor"),
      third: topicId(instance, "Third"),
      proposal: proposeTopics(instance, ["Loser", "Survivor"]),
    });
  } finally {
    await instance.close();
  }
};

export const unchanged = ({ instance, loser }: Library): void => {
  assert.equal(itemsOf(instance, loser), 3);
  assert.equal(count(instance, "select count(*) as n from pins"), 0);
};

export const acceptsAtOnce = async ({ instance, survivor, proposal }: Library): Promise<void> => {
  assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
  assert.equal(itemsOf(instance, survivor), 4);
  assert.equal(heldLeases(instance), 0);
};
