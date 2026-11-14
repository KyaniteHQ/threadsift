import { databaseCodeOf, logFailure } from "./failure-log.ts";
import type { Database } from "./ports.ts";
import { unitFailed } from "./proposal-lifecycle.ts";
import { type TopicLease, releaseTopicLeases } from "./topic-lease.ts";

export async function releasedAfterFailure(
  db: Database,
  id: number,
  leases: readonly Readonly<TopicLease>[],
): Promise<void> {
  try {
    await releaseTopicLeases(db, leases);
  } catch (cause) {
    logFailure(
      "merge-unit-leases-not-released",
      { proposal: id, databaseCode: databaseCodeOf(cause) },
      cause,
    );
  }
}

export async function recordedFailure(
  db: Database,
  id: number,
  revision: number,
  cause: unknown,
): Promise<void> {
  logFailure("merge-unit-failed", { proposal: id, databaseCode: databaseCodeOf(cause) }, cause);

  try {
    await unitFailed(db, id, revision);
  } catch (countCause) {
    logFailure(
      "merge-unit-failure-not-counted",
      { proposal: id, databaseCode: databaseCodeOf(countCause) },
      countCause,
    );
  }
}
