import { eq } from "drizzle-orm";

import { NO_TALLY } from "../../../core/contract/export-contract.ts";
import { refusedBy } from "../../../core/kernel/guards.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueRows } from "../../../core/kernel/job-rows.ts";
import { type Closed, heldBatch, isClosed, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { exportRuns } from "../../../core/kernel/schema.ts";
import { removeQuietly } from "./export-cleanup.ts";
import { openingExportJob } from "./export-job.ts";

const ONE_LIVE_EXPORT = /UNIQUE constraint failed: (?:index 'exports_one_live'|exports\.)/u;

type StartedExport =
  | { readonly kind: "started"; readonly id: number }
  | { readonly kind: "running" }
  | Closed;

type Started =
  | Exclude<StartedExport, { readonly kind: "started" }>
  | {
      readonly kind: "started";
      readonly id: number;
      readonly replaced: readonly number[];
    };

async function started(ports: JobPorts, now: number): Promise<Started> {
  const { db } = ports;

  try {
    const written = await heldBatch(db, [
      db
        .update(exportRuns)
        .set({ state: "failed", failure: "replaced", updatedAt: now })
        .where(eq(exportRuns.state, "ready"))
        .returning({ id: exportRuns.id }),
      db
        .insert(exportRuns)
        .values({
          state: "running",
          createdAt: now,
          updatedAt: now,
          tally: JSON.stringify(NO_TALLY),
        })
        .returning({ id: exportRuns.id }),
      openingExportJob(db, eq(exportRuns.state, "running")),
    ] as const);
    const [replaced, [run], [opened]] = written ?? [[], [], []];

    if (run === undefined || opened === undefined) {
      throw new Error("The export batch returned no row");
    }

    await enqueueRows(ports, [opened]);

    return { kind: "started", id: run.id, replaced: replaced.map(({ id }) => id) };
  } catch (error) {
    if (refusedBy(error, ONE_LIVE_EXPORT)) return { kind: "running" };

    throw error;
  }
}

export async function startExport(ports: JobPorts): Promise<StartedExport> {
  const outcome = await whileOpen(() => started(ports, Date.now()));

  if (isClosed(outcome) || outcome.kind !== "started") return outcome;

  await Promise.all(outcome.replaced.map((id) => removeQuietly(ports, id)));

  return { kind: "started", id: outcome.id };
}
