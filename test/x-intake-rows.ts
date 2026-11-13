import { z } from "zod";

import type { Instance } from "./instance.ts";
import { rows } from "./related-fixtures.ts";

const ALL_TABLES = ["items", "jobs", "ai_tasks", "reddit_comments", "digests"] as const;

export const PUBLISHED_TABLES = ["items", "reddit_comments", "digests", "x_verifications"] as const;

export function stored(instance: Instance, tables: readonly string[] = ALL_TABLES): string {
  return JSON.stringify(
    tables.map((table) => rows(instance, z.looseObject({}), `select * from ${table} order by 1`)),
  );
}

export const ItemRowSchema = z.object({
  status: z.string(),
  fetch_result: z.string().nullable(),
  pending_digest: z.string().nullable(),
  generation: z.number(),
});

export function itemRow(instance: Instance, id: number) {
  const [row] = rows(
    instance,
    ItemRowSchema,
    "select status, fetch_result, pending_digest, generation from items where id = ?",
    id,
  );

  if (row === undefined) throw new Error(`no Item ${String(id)}`);

  return row;
}

const ThreadRepliesSchema = z.object({ replies: z.array(z.unknown()) });

const VerificationRowSchema = z.object({
  revision: z.number(),
  thread: z.string().transform((text) => ThreadRepliesSchema.parse(JSON.parse(text))),
  digest: z.string().nullable(),
  judged: z.string(),
});

export function verificationRow(instance: Instance, itemId: number) {
  const [row] = rows(
    instance,
    VerificationRowSchema,
    "select revision, thread, digest, judged from x_verifications where item_id = ?",
    itemId,
  );

  return row;
}

export function verifyJobStates(instance: Instance, itemId: number) {
  return rows(
    instance,
    z.object({ id: z.number(), state: z.string() }),
    "select id, state from jobs where item_id = ? and kind = 'x_verify'",
    itemId,
  );
}

export function commentCount(instance: Instance, itemId: number): number {
  return (
    rows(
      instance,
      z.object({ n: z.number() }),
      "select count(*) as n from reddit_comments where item_id = ?",
      itemId,
    )[0]?.n ?? -1
  );
}
