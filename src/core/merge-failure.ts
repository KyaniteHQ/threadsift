import { bestEffort, reportFailure } from "./failure-log.ts";
import type { Database } from "./ports.ts";
import { unitFailed } from "./proposal-lifecycle.ts";
import { type TopicLease, releaseTopicLeases } from "./topic-lease.ts";

export async function releasedAfterFailure(
  db: Database,
  id: number,
  leases: readonly Readonly<TopicLease>[],
): Promise<void> {
  await bestEffort({ event: "merge-unit-leases-not-released", fields: { proposal: id } }, () =>
    releaseTopicLeases(db, leases),
  );
}

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

    throw error;
  }
}
