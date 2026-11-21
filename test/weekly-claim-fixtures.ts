import { z } from "zod";

import type { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function nextTick(instance: Instance): Promise<void> {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
}

const RunSchema = z.object({ last_run_at: z.number() });

export const claims = (instance: Instance, task: string) =>
  rows(instance, RunSchema, "select last_run_at from scheduled_runs where task = ?", task);

export function moveClaimBack(instance: Instance, task: string): void {
  exec(
    instance,
    "update scheduled_runs set last_run_at = last_run_at - ? where task = ?",
    WEEK_MS,
    task,
  );
}

export const jobsOf = (instance: Instance, kind: string) =>
  rows(
    instance,
    z.object({ id: z.number(), item_id: z.number(), state: z.string() }),
    "select id, item_id, state from jobs where kind = ? order by id",
    kind,
  );
