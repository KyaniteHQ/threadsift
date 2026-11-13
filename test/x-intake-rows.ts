import { z } from "zod";

import type { Instance } from "./instance.ts";
import { rows } from "./related-fixtures.ts";

const ALL_TABLES = ["items", "jobs", "ai_tasks", "reddit_comments", "digests"] as const;

export const PUBLISHED_TABLES = ["items", "reddit_comments", "digests"] as const;

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
