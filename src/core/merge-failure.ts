import { bestEffort, databaseCodeOf, logFailure } from "./failure-log.ts";
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

export async function recordedFailure(
  db: Database,
  id: number,
  revision: number,
  cause: unknown,
): Promise<void> {
  logFailure("merge-unit-failed", { proposal: id, databaseCode: databaseCodeOf(cause) }, cause);

  await bestEffort({ event: "merge-unit-failure-not-counted", fields: { proposal: id } }, () =>
    unitFailed(db, id, revision),
  );
}
