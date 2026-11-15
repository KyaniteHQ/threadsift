import { logFailure } from "./failure-log.ts";
import type { JobPorts } from "./job-outcome.ts";
import { restoreRunning } from "./restore-state.ts";
import { stagesOf } from "./sweep-stages.ts";

const WHILE_RESTORING = "enqueue";

export async function sweep(ports: JobPorts): Promise<void> {
  let first: { readonly error: unknown } | undefined;

  const stages = stagesOf(ports, Date.now());

  const owed = (await restoreRunning(ports.db))
    ? stages.filter(([name]) => name === WHILE_RESTORING)
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
