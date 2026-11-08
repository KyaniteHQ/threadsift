import { sweepDigests } from "./digest-job.ts";
import { logFailure } from "./failure-log.ts";
import { cleanFiles } from "./file-cleanup.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows } from "./job-rows.ts";
import { dueIds } from "./jobs.ts";
import { sweepConnectTransactions } from "./openrouter-connect.ts";
import { reconcileSearchParts } from "./search-reconciler.ts";

const SWEEP_LIMIT = 100;

type Stage = readonly [name: string, run: () => Promise<void>];

function stagesOf(ports: JobPorts, now: number): readonly Stage[] {
  return [
    [
      "enqueue",
      async () => {
        await enqueueRows(ports, await dueIds(ports.db, now, SWEEP_LIMIT));
      },
    ],
    [
      "connect",
      async () => {
        await sweepConnectTransactions(ports.db);
      },
    ],
    [
      "digests",
      async () => {
        await sweepDigests(ports.db, now);
      },
    ],
    ["search", () => reconcileSearchParts(ports)],
    ["files", () => cleanFiles(ports)],
  ];
}

export async function sweep(ports: JobPorts): Promise<void> {
  const failures: unknown[] = [];

  for (const [stage, run] of stagesOf(ports, Date.now())) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the stages run in order, and a failed stage must not skip the next.
      await run();
    } catch (error) {
      logFailure("sweep-stage-failed", { stage }, error);
      failures.push(error);
    }
  }

  const [first] = failures;

  if (failures.length > 0) throw first;
}
