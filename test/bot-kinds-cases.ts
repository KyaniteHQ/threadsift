import { z } from "zod";

import { BOT_TASK_KINDS } from "../src/core/bot-task-kinds.ts";
import { SentTopicsSchema } from "../src/core/disagreement-task.ts";
import { SentPairsSchema } from "../src/core/proposal-task.ts";
import { seedDigested, seedTopics } from "./disagreement-fixtures.ts";
import type { Instance, Json } from "./instance.ts";
import { REDDIT_THREAD, exec, paste, rows } from "./related-fixtures.ts";

export type BotKindName = Exclude<keyof typeof BOT_TASK_KINDS, "related_pick">;

const Count = z.object({ n: z.number() });

function count(instance: Instance, query: string, ...params: readonly number[]): number {
  return rows(instance, Count, query, ...params)[0]?.n ?? 0;
}

export interface KindCase {
  readonly kind: BotKindName;
  readonly library: (instance: Instance) => Promise<number>;
  readonly fits: (context: string) => Json;
  readonly breaks: { readonly result: (context: string) => Json; readonly reason: RegExp };
  readonly empty: ((context: string) => Json) | null;
  readonly wrote: (instance: Instance, owner: number) => boolean;
  readonly moves: readonly {
    readonly name: string;
    readonly needsAnswer?: true;
    readonly move: (instance: Instance, context: string) => void;
  }[];
}

const DigestContext = z.object({ itemId: z.number() });

export const DIGEST_ANSWER = {
  title: "Quasar lattice",
  topic: "Quasars",
  tags: ["quasar"],
  summary: "A short summary.",
  keyPoints: ["One point"],
};

const PROPOSAL_REASON = "Both names are one concept.";

function firstPair(context: string) {
  const [pair] = SentPairsSchema.parse(JSON.parse(context));

  if (pair === undefined) throw new Error("no pair was sent");

  return { from: pair.low.id, into: pair.high.id, reason: PROPOSAL_REASON };
}

function mergesBreakingRules(context: string): Json {
  const { from, into } = firstPair(context);

  return {
    merges: [
      { from, into, reason: PROPOSAL_REASON },
      { from: into, into: 987_654, reason: PROPOSAL_REASON },
    ],
  };
}

function oneTopic(instance: Instance, items: readonly number[]): number {
  seedTopics(instance, { 1: "Alpha" });
  seedDigested(
    instance,
    items.map((id) => ({ id, topic: 1 })),
  );

  return items[0] ?? 0;
}

async function tagLibrary(instance: Instance): Promise<number> {
  await paste(instance, "a", { title: "A", tags: ["machine learning", "ml"] });
  await paste(instance, "b", { title: "B", tags: ["machine-learning"] });

  return paste(instance, "c", { title: "C", tags: ["llm", "llms"] });
}

async function topicLibrary(instance: Instance): Promise<number> {
  await paste(instance, "a", { title: "A", topic: "Machine learning" });
  await paste(instance, "b", { title: "B", topic: "machine-learning" });
  await paste(instance, "c", { title: "C", topic: "ML" });

  return paste(instance, "d", { title: "D", topic: "Games" });
}

export const KIND_CASES: readonly KindCase[] = [
  {
    kind: "digest",
    library: (instance) =>
      paste(instance, "thread", {
        title: "A thread",
        url: "https://www.reddit.com/r/science/comments/q1/a_thread/",
        content: JSON.stringify(REDDIT_THREAD),
        noDigest: true,
      }),
    fits: () => ({ ...DIGEST_ANSWER, keptComments: ["t1_c1"] }),
    breaks: {
      result: () => ({ ...DIGEST_ANSWER, tags: ["a", "b", "c", "d"] }),
      reason: /tags/u,
    },
    empty: null,
    wrote: (instance, owner) =>
      count(instance, "select count(*) as n from digests where item_id = ?", owner) === 1,
    moves: [
      {
        name: "a new content generation",
        move: (instance, context) => {
          exec(
            instance,
            "update items set generation = generation + 1 where id = ?",
            DigestContext.parse(JSON.parse(context)).itemId,
          );
        },
      },
      {
        name: "a changed catalog version with a Topic the catalog does not hold",
        needsAnswer: true,
        move: (instance) => {
          exec(
            instance,
            "insert into catalog_version (id, version) values (1, 5) on conflict (id) do update set version = version + 5",
          );
        },
      },
    ],
  },
  {
    kind: "topic_overview",
    library: (instance) => Promise.resolve(oneTopic(instance, [101, 102])),
    fits: () => ({
      lines: [{ text: "Alpha covers two lattices.", items: [101, 102] }],
      unchanged: false,
    }),
    breaks: {
      result: () => ({
        lines: [{ text: "Alpha covers a lattice.", items: [999] }],
        unchanged: false,
      }),
      reason: /lines/u,
    },
    empty: null,
    wrote: (instance) =>
      count(
        instance,
        "select count(*) as n from topic_pages where topic_id = 1 and revision = 1",
      ) === 1,
    moves: [
      {
        name: "a new Digest of a sent Item",
        move: (instance) => {
          exec(
            instance,
            "insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state, item_id) values (7000, 'digest', '{}', 0, 'caller', 1, 0, 'done', 102)",
          );
          exec(instance, "update digests set task_id = 7000 where item_id = 102");
        },
      },
      {
        name: "a deleted sent Item",
        move: (instance) => {
          exec(instance, "delete from items where id = 102");
        },
      },
    ],
  },
  {
    kind: "proposals",
    library: tagLibrary,
    fits: (context) => ({ merges: [firstPair(context)] }),
    breaks: { result: mergesBreakingRules, reason: /merges/u },
    empty: () => ({ merges: [] }),
    wrote: (instance) =>
      count(instance, "select count(*) as n from proposals where kind = 'tag-merge'") > 0,
    moves: [
      {
        name: "a deleted sent Tag",
        move: (instance, context) => {
          const { from } = firstPair(context);

          exec(instance, "delete from item_tags where tag_id = ?", from);
          exec(instance, "delete from tags where id = ?", from);
        },
      },
    ],
  },
  {
    kind: "topic_proposals",
    library: topicLibrary,
    fits: (context) => ({ merges: [firstPair(context)] }),
    breaks: { result: mergesBreakingRules, reason: /merges/u },
    empty: () => ({ merges: [] }),
    wrote: (instance) =>
      count(instance, "select count(*) as n from proposals where kind = 'topic-merge'") > 0,
    moves: [
      {
        name: "a deleted sent Topic",
        move: (instance, context) => {
          const { from } = firstPair(context);

          exec(instance, "update items set topic_id = null where topic_id = ?", from);
          exec(instance, "delete from log_entries where topic_id = ?", from);
          exec(instance, "delete from topic_pages where topic_id = ?", from);
          exec(instance, "delete from topics where id = ?", from);
        },
      },
    ],
  },
  {
    kind: "disagreement_proposals",
    library: (instance) => Promise.resolve(oneTopic(instance, [201, 202])),
    fits: () => ({
      disagreements: [{ a: 201, b: 202, reason: "They recommend opposite things." }],
    }),
    breaks: {
      result: () => ({
        disagreements: [{ a: 201, b: 999, reason: "They recommend opposite things." }],
      }),
      reason: /disagreements/u,
    },
    empty: () => ({ disagreements: [] }),
    wrote: (instance) =>
      count(instance, "select count(*) as n from proposals where kind = 'items-disagree'") === 1,
    moves: [
      {
        name: "a changed membership text",
        move: (instance, context) => {
          const [topic] = SentTopicsSchema.parse(JSON.parse(context));

          exec(instance, "update items set topic_id = null where id = ?", topic?.items[1]?.id ?? 0);
        },
      },
    ],
  },
];

export function caseOf(kind: BotKindName): KindCase {
  const found = KIND_CASES.find((one) => one.kind === kind);

  if (found === undefined) throw new Error(`no case for ${kind}`);

  return found;
}
