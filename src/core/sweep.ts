import { logFailure } from "./failure-log.ts";
import type { JobPorts } from "./job-outcome.ts";
import { restoreHoldsLibrary } from "./restore-state.ts";
import { stagesOf } from "./sweep-stages.ts";

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
