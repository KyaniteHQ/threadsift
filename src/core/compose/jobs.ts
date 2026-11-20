import type { Database } from "../kernel/database.ts";
import type { JobPorts } from "../kernel/job-outcome.ts";
import { enqueueRows } from "../kernel/job-rows.ts";
import { jobIs } from "../kernel/job-tables.ts";
import { jobs } from "../kernel/schema.ts";
import { jobEngine } from "./job-engine.ts";
import { HANDLERS } from "./job-handlers.ts";

const queue = jobEngine(HANDLERS);

export const { dueIds, executeClaimed } = queue;

export function claimNextDue(db: Database) {
  return queue.claimDue(db);
}

export async function enqueueDue(ports: JobPorts, now: number, limit: number): Promise<void> {
  await enqueueRows(ports, await dueIds(ports.db, now, limit));
}

export async function runJob(ports: JobPorts, id: number): Promise<void> {
  const job = await queue.claimDue(ports.db, id);

  if (job !== null) {
    await executeClaimed(ports, job);
  }
}

export async function abandonRunning(db: Database): Promise<void> {
  await db.update(jobs).set({ claimExpires: 0 }).where(jobIs("running"));
}
