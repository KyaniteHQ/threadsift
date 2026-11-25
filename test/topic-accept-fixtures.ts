import { z } from "zod";

import { LogPageSchema } from "../src/core/contract/log-contract.ts";
import { accept } from "./accept-fixtures.ts";
import type { Instance } from "./instance.ts";
import { seedProposal } from "./proposal-seed.ts";

export { removeProposals } from "./proposal-seed.ts";

const IdSchema = z.object({ id: z.number() });

export function topicId(instance: Instance, name: string): number {
  const [row] = instance.database.rows(IdSchema, "select id from topics where name = ?", name);

  if (row === undefined) throw new Error(`no Topic named ${name}`);

  return row.id;
}

export function proposeTopics(
  instance: Instance,
  [from, into]: readonly [string, string],
  state = "open",
  reason: string | null = "Same subject.",
): number {
  return seedProposal(
    instance,
    "topic-merge",
    { fromTopicId: topicId(instance, from), intoTopicId: topicId(instance, into) },
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
  instance.database.count("select count(*) as n from items where topic_id = ?", topic);

export const answerOf = async (
  instance: Instance,
  id: number,
): Promise<readonly [number, unknown]> => {
  const { status, body } = await accept(instance, id);

  return [status, JSON.parse(body)];
};
