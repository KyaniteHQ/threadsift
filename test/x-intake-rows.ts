import { z } from "zod";

import type { Instance } from "./instance.ts";

const ALL_TABLES = [
  "items",
  "jobs",
  "ai_tasks",
  "reddit_comments",
  "digests",
  "x_verifications",
] as const;

export const PUBLISHED_TABLES = ["items", "reddit_comments", "digests", "x_verifications"] as const;

export function stored(instance: Instance, tables: readonly string[] = ALL_TABLES): string {
  return JSON.stringify(
    tables.map((table) =>
      instance.database.rows(z.looseObject({}), `select * from ${table} order by 1`),
    ),
  );
}

const ItemRowSchema = z.object({
  reason: z.string().nullable(),
  fetch_result: z.string().nullable(),
  pending_digest: z.string().nullable(),
  generation: z.number(),
});

export function itemRow(instance: Instance, id: number) {
  const [row] = instance.database.rows(
    ItemRowSchema,
    "select reason, fetch_result, pending_digest, generation from items where id = ?",
    id,
  );

  if (row === undefined) throw new Error(`no Item ${String(id)}`);

  return row;
}

const ThreadRepliesSchema = z.object({
  post: z.object({ replies: z.number().nullable() }),
  replies: z.array(z.object({ id: z.string() })),
});

const VerificationRowSchema = z.object({
  revision: z.number(),
  thread: z.string().transform((text) => ThreadRepliesSchema.parse(JSON.parse(text))),
  digest: z.string().nullable(),
  judged: z.string(),
});

export function verificationRow(instance: Instance, itemId: number) {
  const [row] = instance.database.rows(
    VerificationRowSchema,
    "select revision, thread, digest, judged from x_verifications where item_id = ?",
    itemId,
  );

  return row;
}

export function verifyJobStates(instance: Instance, itemId: number) {
  return instance.database.rows(
    z.object({ id: z.number(), state: z.string() }),
    "select id, state from jobs where item_id = ? and kind = 'x_verify'",
    itemId,
  );
}

export function commentCount(instance: Instance, itemId: number): number {
  return instance.database.count(
    "select count(*) as n from reddit_comments where item_id = ?",
    itemId,
  );
}

const LoggedSchema = z.looseObject({
  event: z.string(),
  taskId: z.number(),
  itemId: z.number(),
  refusals: z.number(),
  issues: z.string(),
});

export function refusalsIn(lines: readonly string[]) {
  return lines.flatMap((line) =>
    line.includes("grok-bot-answer-refused") ? [LoggedSchema.parse(JSON.parse(line))] : [],
  );
}
