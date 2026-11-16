import { and, eq, sql } from "drizzle-orm";

import type { ClaimedRestore, JobHandler } from "./job-outcome.ts";
import { enqueueRows, unownedOwnerId } from "./job-rows.ts";
import { jobs, restoreRuns } from "./schema.ts";

export const restoreClosing: Pick<JobHandler<ClaimedRestore>, "exhausted" | "afterClosed"> = {
  exhausted: (db, job) => {
    const restoreId = unownedOwnerId("restore", job.address);

    return restoreId === null
      ? []
      : [
          db
            .update(restoreRuns)
            .set({ state: "failed", failure: "gave-up", updatedAt: Date.now() })
            .where(and(eq(restoreRuns.id, restoreId), eq(restoreRuns.state, "running"))),
        ];
  },
  afterClosed: async (ports, job, closed) => {
    if (!closed) return;

    await enqueueRows(
      ports,
      await ports.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.kind, "restore"),
            eq(jobs.address, job.address),
            sql`${jobs.state} <> 'done'`,
          ),
        ),
    );
  },
};
