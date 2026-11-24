import { z } from "zod";

import { LogPageSchema } from "../src/core/contract/log-contract.ts";
import { accept } from "./accept-fixtures.ts";
import type { Instance } from "./instance.ts";
import { seedProposal } from "./proposal-seed.ts";
import { count, rows } from "./sqlite-fixtures.ts";

export { removeProposals } from "./proposal-seed.ts";

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
  reason = "Same subject.",
): number {
  return seedProposal(
    instance,
    "topic-merge",
    { from_topic_id: topicId(instance, from), into_topic_id: topicId(instance, into) },
    { reason, state },
  );
}

export const topicMergeLines = async (instance: Instance): Promise<readonly string[]> =>
  (await instance.read("GET", "/api/log", LogPageSchema)).entries.flatMap((entry) =>
    entry.action === "merge-topic"
      ? [`${entry.from} into ${entry.into} | ${String(entry.items)} Items`]
      : [],
  );

export const itemsOf = (instance: Instance, topic: number): number =>
  count(instance, "select count(*) as n from items where topic_id = ?", topic);

export const answerOf = async (
  instance: Instance,
  id: number,
): Promise<readonly [number, unknown]> => {
  const { status, body } = await accept(instance, id);

  return [status, JSON.parse(body)];
};
