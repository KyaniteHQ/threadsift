import { z } from "zod";

import { WEEK_MS } from "../src/core/contract/time-units.ts";
import type { Instance } from "./instance.ts";
import { exec, rows, sweptWith } from "./related-fixtures.ts";

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

export async function sweptWithClaim(
  instance: Instance,
  task: string,
  claimOffsetMs: number,
): Promise<number> {
  await sweptWith(instance, (now) => {
    exec(
      instance,
      "update scheduled_runs set last_run_at = ? where task = ?",
      now + claimOffsetMs,
      task,
    );
  });

  return jobsOf(instance, task).length;
}
