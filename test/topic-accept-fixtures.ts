import { z } from "zod";

import { LogPageSchema } from "../src/core/contract/log-contract.ts";
import { continueMerges } from "../src/features/wiki/core/merge-accept.ts";
import { accept } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { pasteTopics } from "./overview-gap-fixtures.ts";
import { seedTopicItems } from "./pin-fixtures.ts";
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

export const pinsFrom = (instance: Instance, key: string): number =>
  instance.database.count("select count(*) as n from pins where from_key = ?", key);

export const answerOf = async (
  instance: Instance,
  id: number,
): Promise<readonly [number, unknown]> => {
  const { status, body } = await accept(instance, id);

  return [status, JSON.parse(body)];
};

export const runMergesStage = (instance: Instance): Promise<void> => continueMerges(instance.core);

export function beforeFirstBatch(instance: Instance, staged: () => Promise<void>): () => boolean {
  const { db } = instance.core;
  const real = db.batch.bind(db);
  let ran = false;

  Object.defineProperty(db, "batch", {
    configurable: true,
    value: async (queries: Parameters<typeof real>[0]) => {
      if (!ran) {
        ran = true;
        Reflect.deleteProperty(db, "batch");
        await staged();
      }

      return real(queries);
    },
  });

  return () => ran;
}

export interface Library {
  readonly instance: Instance;
  readonly loser: number;
  readonly survivor: number;
  readonly proposal: number;
}

export const withInstance = async (run: (instance: Instance) => Promise<void>): Promise<void> => {
  const instance = await Instance.start();

  try {
    await instance.setUp();
    await run(instance);
  } finally {
    await instance.close();
  }
};

export const withLibrary = (run: (library: Library) => Promise<void>): Promise<void> =>
  withInstance(async (instance) => {
    await pasteTopics(instance, { Loser: ["loser"], Survivor: ["survivor"] });

    const loser = topicId(instance, "Loser");

    seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: 2 });
    await run({
      instance,
      loser,
      survivor: topicId(instance, "Survivor"),
      proposal: proposeTopics(instance, ["Loser", "Survivor"]),
    });
  });
