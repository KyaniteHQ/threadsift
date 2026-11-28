import { sweepConnectTransactions } from "../../features/ai/core/openrouter-connect.ts";
import { cleanExports } from "../../features/export/core/export-cleanup.ts";
import { cleanRestoreParts } from "../../features/restore/core/restore-parts.ts";
import { continueMerges } from "../../features/wiki/core/merge-accept.ts";
import { weeklyStages } from "../../features/wiki/core/proposal-kinds.ts";
import { sweepDigests } from "../kernel/digest-sweep.ts";
import { logFailure } from "../kernel/failure-log.ts";
import { restoreHoldsLibrary } from "../kernel/restore-hold.ts";
import { cleanFiles } from "./file-cleanup.ts";
import { enqueueDue } from "./jobs.ts";

type JobPorts = import("../kernel/job-outcome.ts").JobPorts;

const SWEEP_LIMIT = 100;

type Stage = readonly [name: string, run: () => Promise<void>];

function stagesOf(ports: JobPorts, now: number): readonly Stage[] {
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
    ["exports", () => cleanExports(ports)],
    ["restores", () => cleanRestoreParts(ports)],
    ["files", () => cleanFiles(ports)],
  ];
}

const WHILE_RESTORING: ReadonlySet<string> = new Set(["enqueue", "restores"]);

export async function sweep(ports: JobPorts): Promise<void> {
  let first: { readonly error: unknown } | undefined;

  const stages = stagesOf(ports, Date.now());

  const owed = (await restoreHoldsLibrary(ports.db))
    ? stages.filter(([name]) => WHILE_RESTORING.has(name))
    : stages;

  for (const [stage, run] of owed) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the stages run in order, and a failed stage must not skip the next.
      await run();
    } catch (error) {
      logFailure("sweep-stage-failed", { stage }, error);

      first ??= { error };
    }
  }

  if (first !== undefined) throw first.error;
}
