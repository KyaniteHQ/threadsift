import { z } from "zod";

import { WEEK_MS } from "../src/core/contract/time-units.ts";
import { atClock } from "./clock-fixtures.ts";
import type { Instance } from "./instance.ts";

export function releaseClaim(instance: Instance, task: string): void {
  instance.database.exec("delete from scheduled_runs where task = ?", task);
}

export function holdClaim(instance: Instance, task: string, at = Date.now()): void {
  instance.database.exec(
    "insert or replace into scheduled_runs (task, last_run_at) values (?, ?)",
    task,
    at,
  );
}

export async function nextSweep(instance: Instance): Promise<void> {
  releaseClaim(instance, "sweep");
  await instance.tick();
}

export const nextSweepAt = (instance: Instance, now: number): Promise<void> =>
  atClock(
    () => now,
    () => nextSweep(instance),
  );

export async function sweptWith(instance: Instance, write: (now: number) => void): Promise<void> {
  const now = Date.now();

  write(now);
  await nextSweepAt(instance, now);
}

const RunSchema = z.object({ last_run_at: z.number() });

export const claims = (instance: Instance, task: string) =>
  instance.database.rows(RunSchema, "select last_run_at from scheduled_runs where task = ?", task);

export function moveClaimBack(instance: Instance, task: string): void {
  instance.database.exec(
    "update scheduled_runs set last_run_at = last_run_at - ? where task = ?",
    WEEK_MS,
    task,
  );
}

export const jobsOf = (instance: Instance, kind: string) =>
  instance.database.rows(
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
    instance.database.exec(
      "update scheduled_runs set last_run_at = ? where task = ?",
      now + claimOffsetMs,
      task,
    );
  });

  return jobsOf(instance, task).length;
}
