import { and, eq, gte, inArray, lt, or } from "drizzle-orm";

import {
  RESTORE_FILES_ROOT,
  ownerIdOf,
  restoreFilesPrefix,
} from "../../../core/contract/file-keys.ts";
import { RESTORE_PARTS_KEEP_MS } from "../../../core/contract/restore-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { report } from "../../../core/kernel/failure-log.ts";
import { deleteMatching, removeUnder } from "../../../core/kernel/file-pages.ts";
import type { FileStore } from "../../../core/kernel/file-store.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { NEWEST_RESTORE, RESUMABLE_RESTORE } from "../../../core/kernel/restore-hold.ts";
import { restoreRuns } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";

export function removeParts(files: FileStore, id: number) {
  return removeUnder(files, restoreFilesPrefix(id));
}

type PartPorts = Pick<JobPorts, "db" | "files">;

async function endAbandonedUploads({ db }: Pick<PartPorts, "db">): Promise<void> {
  const now = Date.now();

  await db
    .update(restoreRuns)
    .set({ state: "cancelled", finishedAt: now, updatedAt: now })
    .where(
      and(
        eq(restoreRuns.state, "uploading"),
        lt(restoreRuns.updatedAt, now - RESTORE_PARTS_KEEP_MS),
      ),
    );
}

async function holdingParts(db: Database, keys: readonly string[]): Promise<ReadonlySet<number>> {
  const owners = [
    ...new Set(
      keys.flatMap((key) => {
        const id = ownerIdOf(key, "restores");

        return id === null ? [] : [id];
      }),
    ),
  ];

  const holding = await db
    .select({ id: restoreRuns.id })
    .from(restoreRuns)
    .where(
      and(
        among(restoreRuns.id, owners),
        or(
          inArray(restoreRuns.state, ["uploading", "running"]),
          and(
            RESUMABLE_RESTORE,
            NEWEST_RESTORE,
            gte(restoreRuns.updatedAt, Date.now() - RESTORE_PARTS_KEEP_MS),
          ),
        ),
      ),
    );

  return new Set(holding.map(({ id }) => id));
}

async function strayParts(db: Database, keys: readonly string[]): Promise<readonly string[]> {
  const holding = await holdingParts(db, keys);

  return keys.filter((key) => {
    const id = ownerIdOf(key, "restores");

    return id === null || !holding.has(id);
  });
}

export async function cleanRestoreParts(ports: Readonly<PartPorts>): Promise<void> {
  await endAbandonedUploads(ports);

  const removed = await deleteMatching(ports.files, RESTORE_FILES_ROOT, (keys) =>
    strayParts(ports.db, keys),
  );

  if (removed > 0) report("restore-stray-parts-removed", { keys: removed });
}
