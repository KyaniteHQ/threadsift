import type { Database } from "./database.ts";
import { bestEffort, reportFailure } from "./failure-log.ts";
import { handedBack, unitFailed } from "./proposal-lifecycle.ts";

export async function recordingFailure<Outcome>(
  db: Database,
  unit: Readonly<{ id: number; revision: number }>,
  run: () => Promise<Outcome>,
): Promise<Outcome> {
  try {
    return await run();
  } catch (error) {
    reportFailure({ event: "merge-unit-failed", fields: { proposal: unit.id } }, error);

    await bestEffort(
      { event: "merge-unit-failure-not-counted", fields: { proposal: unit.id } },
      () => unitFailed(db, unit.id, unit.revision),
    );

    await bestEffort({ event: "merge-claim-not-handed-back", fields: { proposal: unit.id } }, () =>
      handedBack(db, unit.id),
    );

    throw error;
  }
}
