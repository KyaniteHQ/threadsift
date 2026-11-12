import { z } from "zod";

import { LogPageSchema } from "../src/core/log-contract.ts";
import { count } from "./accept-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

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

export const exists = (instance: Instance, table: string, column: string, id: number): boolean =>
  count(instance, `select count(*) as n from ${table} where ${column} = ?`, id) > 0;
