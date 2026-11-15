import { sweepDigests } from "./digest-job.ts";
import { cleanExports } from "./export-cleanup.ts";
import { cleanFiles } from "./file-cleanup.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueDue } from "./jobs.ts";
import { continueMerges } from "./merge-accept.ts";
import { sweepConnectTransactions } from "./openrouter-connect.ts";
import { weeklyStages } from "./proposal-week.ts";
import { reconcileSearchParts } from "./search-reconciler.ts";

const SWEEP_LIMIT = 100;

export type Stage = readonly [name: string, run: () => Promise<void>];

export function stagesOf(ports: JobPorts, now: number): readonly Stage[] {
  return [
    [
      "enqueue",
      async () => {
        await enqueueDue(ports, now, SWEEP_LIMIT);
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
    ...weeklyStages(ports, now),
    ["merges", () => continueMerges(ports)],
    ["search", () => reconcileSearchParts(ports)],
    ["exports", () => cleanExports(ports)],
    ["files", () => cleanFiles(ports)],
  ];
}
