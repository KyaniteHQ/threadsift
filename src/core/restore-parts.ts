import { and, eq, gte, inArray, lt, or } from "drizzle-orm";

import type { Database } from "./database.ts";
import { report } from "./failure-log.ts";
import { RESTORE_FILES_ROOT, parseStoredKey, restoreFilesPrefix } from "./file-keys.ts";
import { deleteMatching, removeUnder } from "./file-pages.ts";
import type { FileStore } from "./file-store.ts";
import type { JobPorts } from "./job-outcome.ts";
import { RESTORE_PARTS_KEEP_MS } from "./restore-contract.ts";
import { NEWEST_RESTORE, RESUMABLE_RESTORE } from "./restore-hold.ts";
import { restoreRuns } from "./schema.ts";
import { among } from "./sql-expressions.ts";

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
        const id = Number(parseStoredKey(key)?.ownerId);

        return Number.isSafeInteger(id) ? [id] : [];
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

  return keys.filter((key) => !holding.has(Number(parseStoredKey(key)?.ownerId)));
}

export async function cleanRestoreParts(ports: Readonly<PartPorts>): Promise<void> {
  await endAbandonedUploads(ports);

  const removed = await deleteMatching(ports.files, RESTORE_FILES_ROOT, (keys) =>
    strayParts(ports.db, keys),
  );

  if (removed > 0) report("restore-stray-parts-removed", { keys: removed });
}
