import { z } from "zod";

import type { Instance } from "./instance.ts";

export const pinRows = (instance: Instance) =>
  instance.database.rows(
    z.object({
      id: z.number(),
      from_key: z.string(),
      from_name: z.string(),
      from_item_id: z.number(),
      into_item_id: z.number(),
      from_digest: z.number(),
      into_digest: z.number(),
    }),
    "select id, from_key, from_name, from_item_id, into_item_id, from_digest, into_digest from pins where kind = 'items-disagree' order by id",
  );

const TopicDisagreementsSchema = z.object({
  disagreements: z.array(
    z.object({
      id: z.number(),
      reason: z.string(),
      items: z.array(z.object({ id: z.number(), title: z.string() })),
    }),
  ),
});

export async function topicDisagreements(instance: Instance, key: string) {
  const answer = await instance.send("GET", `/api/topics/${key}`);

  return TopicDisagreementsSchema.parse(JSON.parse(answer.body)).disagreements;
}

export const acceptStatus = async (instance: Instance, id: number) => {
  const answer = await instance.send("POST", `/api/proposals/${String(id)}/accept`);

  return [answer.status, JSON.parse(answer.body)] as const;
};

export const digestTokenStatements = (itemId: number, token: number): readonly string[] => [
  `insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state) values (${String(token)}, 'digest', '{}', 0, 'caller', 1, 0, 'done')`,
  `update digests set task_id = ${String(token)} where item_id = ${String(itemId)}`,
];

export function replaceDigestToken(instance: Instance, itemId: number, token: number): void {
  for (const statement of digestTokenStatements(itemId, token)) instance.database.exec(statement);
}
