import { z } from "zod";

import { parsedJson } from "../src/core/kernel/parsed-json.ts";
import { MICROS_PER_USD, type RequestKind, type Resources } from "./x-api-probe-plan.ts";

const IdSchema = z.object({ id: z.string() });
const ProblemSchema = z.object({
  type: z.string().optional(),
  resource_id: z.string().optional(),
});

const AnswerSchema = z.object({
  data: z.union([z.array(IdSchema), IdSchema]).optional(),
  includes: z
    .object({
      tweets: z.array(z.unknown()).optional(),
      users: z.array(z.unknown()).optional(),
      media: z.array(z.unknown()).optional(),
      polls: z.array(z.unknown()).optional(),
      places: z.array(z.unknown()).optional(),
    })
    .optional(),
  errors: z.array(ProblemSchema).optional(),
});

export type Counts = {
  readonly posts: number;
  readonly includedPosts: number;
  readonly users: number;
  readonly media: number;
  readonly polls: number;
  readonly places: number;
  readonly errors: number;
  readonly usageReads: number;
};

export type Counted = {
  readonly counts: Counts;
  readonly postIds: readonly string[];
  readonly problems: readonly string[];
};

const NO_COUNTS: Counts = {
  posts: 0,
  includedPosts: 0,
  users: 0,
  media: 0,
  polls: 0,
  places: 0,
  errors: 0,
  usageReads: 0,
};

export function countedOf(kind: RequestKind, text: string): Counted | null {
  if (kind !== "lookup")
    return { counts: { ...NO_COUNTS, usageReads: 1 }, postIds: [], problems: [] };
  const answer = parsedJson(AnswerSchema, text);

  if (answer === null) return null;
  const { data, includes, errors } = answer;
  const posts = data === undefined ? [] : Array.isArray(data) ? data : [data];

  return {
    counts: {
      posts: posts.length,
      includedPosts: includes?.tweets?.length ?? 0,
      users: includes?.users?.length ?? 0,
      media: includes?.media?.length ?? 0,
      polls: includes?.polls?.length ?? 0,
      places: includes?.places?.length ?? 0,
      errors: errors?.length ?? 0,
      usageReads: 0,
    },
    postIds: posts.map((post) => post.id),
    problems: (errors ?? []).map(
      (problem) =>
        `${problem.type?.split("/").at(-1) ?? "unknown"}:${problem.resource_id ?? "none"}`,
    ),
  };
}

const BalanceSchema = z.object({ data: z.object({ total_balance: z.number() }) });

export function balanceOf(text: string): number | null {
  const balance = parsedJson(BalanceSchema, text);

  return balance === null ? null : Math.round(balance.data.total_balance * MICROS_PER_USD);
}

export function totalOf(all: readonly Counts[]): Counts {
  return all.reduce(
    (sum, next) => ({
      posts: sum.posts + next.posts,
      includedPosts: sum.includedPosts + next.includedPosts,
      users: sum.users + next.users,
      media: sum.media + next.media,
      polls: sum.polls + next.polls,
      places: sum.places + next.places,
      errors: sum.errors + next.errors,
      usageReads: sum.usageReads + next.usageReads,
    }),
    NO_COUNTS,
  );
}

export function billedOf(counts: Counts): Resources {
  return {
    posts: counts.posts + counts.includedPosts,
    users: counts.users,
    usageReads: counts.usageReads,
  };
}
