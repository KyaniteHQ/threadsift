import { z } from "zod";

import { parsedJson } from "../src/core/kernel/parsed-json.ts";
import { type Counts, MICROS_PER_USD, NO_COUNTS } from "./x-api-probe-cost.ts";
import type { RequestRole } from "./x-api-probe-plan.ts";

const PostIdSchema = z.string().regex(/^\d{1,19}$/u);
const IdSchema = z.object({ id: PostIdSchema });
const Collection = z.array(z.unknown()).optional();
const ProblemSchema = z.object({
  type: z.string().optional(),
  resource_id: z.string().optional(),
});

const AnswerSchema = z.object({
  data: z.union([z.array(IdSchema), IdSchema]).optional(),
  includes: z
    .strictObject({
      tweets: z.array(IdSchema).optional(),
      posts: z.array(IdSchema).optional(),
      users: Collection,
      media: Collection,
      polls: Collection,
      places: Collection,
      topics: Collection,
      calls: Collection,
    })
    .optional(),
  errors: z.array(ProblemSchema).optional(),
});

export type Counted = {
  readonly counts: Counts;
  readonly postIds: readonly string[];
  readonly problems: readonly string[];
};

export type Reading = ({ readonly kind: "counted" } & Counted) | { readonly kind: "uncountable" };

function problemOf(problem: z.infer<typeof ProblemSchema>): string {
  const type = problem.type?.split("/").at(-1) ?? "";
  const resource = problem.resource_id ?? "";

  return `${/^[a-z-]{1,64}$/u.test(type) ? type : "unrecognized"}:${PostIdSchema.safeParse(resource).success ? resource : "none"}`;
}

export function readingOf(role: RequestRole, text: string): Reading {
  if (role !== "lookup")
    return { kind: "counted", counts: { ...NO_COUNTS, usageReads: 1 }, postIds: [], problems: [] };
  const answer = parsedJson(AnswerSchema, text);

  if (answer === null) return { kind: "uncountable" };
  const { data, includes, errors } = answer;
  const posts = data === undefined ? [] : Array.isArray(data) ? data : [data];
  const included = new Set(
    [...(includes?.tweets ?? []), ...(includes?.posts ?? [])].map((post) => post.id),
  );

  return {
    kind: "counted",
    counts: {
      posts: posts.length,
      includedPosts: included.size,
      users: includes?.users?.length ?? 0,
      media: includes?.media?.length ?? 0,
      polls: includes?.polls?.length ?? 0,
      places: includes?.places?.length ?? 0,
      topics: includes?.topics?.length ?? 0,
      calls: includes?.calls?.length ?? 0,
      errors: errors?.length ?? 0,
      usageReads: 0,
    },
    postIds: posts.map((post) => post.id),
    problems: (errors ?? []).map((problem) => problemOf(problem)),
  };
}

const BalanceSchema = z.object({ data: z.object({ total_balance: z.number() }) });

export function balanceOf(status: number, text: string): number | null {
  const balance = status === 200 ? parsedJson(BalanceSchema, text) : null;

  return balance === null ? null : Math.round(balance.data.total_balance * MICROS_PER_USD);
}
