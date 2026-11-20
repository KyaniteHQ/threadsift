import { and, eq, inArray, lt, or } from "drizzle-orm";

import type { Database } from "./database.ts";
import {
  EXPORT_CLEANUP_BATCH,
  EXPORT_KEEP_MS,
  EXPORT_SLICE_DEADLINE_MS,
} from "./export-contract.ts";
import { logFailure, report } from "./failure-log.ts";
import { EXPORT_FILES_ROOT, exportFilesPrefix, parseStoredKey } from "./file-keys.ts";
import { deleteMatching, removeUnder } from "./file-pages.ts";
import { CLAIM_MARGIN_MS, type JobPorts } from "./job-outcome.ts";
import { exportRuns } from "./schema.ts";
import { among } from "./sql-expressions.ts";

export const SETTLE_MS = EXPORT_SLICE_DEADLINE_MS + CLAIM_MARGIN_MS;

type CleanupPorts = Pick<JobPorts, "db" | "files">;

async function expiredKeys(db: Database, keys: readonly string[]): Promise<readonly string[]> {
  const owned = keys.flatMap((key) => {
    const parsed = parseStoredKey(key);
    const id = Number(parsed?.ownerId);

    return parsed?.root === "exports" && Number.isSafeInteger(id) ? [{ key, id }] : [];
  });

  const owners = [...new Set(owned.map(({ id }) => id))];

  const expired = await db
    .select({ id: exportRuns.id })
    .from(exportRuns)
    .where(and(eq(exportRuns.state, "expired"), among(exportRuns.id, owners)));

  const ids = new Set(expired.map(({ id }) => id));

  return owned.flatMap(({ key, id }) => (ids.has(id) ? [key] : []));
}

export async function removeExport({ db, files }: Readonly<CleanupPorts>, id: number) {
  await db
    .update(exportRuns)
    .set({ state: "removing", updatedAt: Date.now() })
    .where(and(eq(exportRuns.id, id), inArray(exportRuns.state, ["ready", "failed"])));

  await removeUnder(files, exportFilesPrefix(id));

  await db
    .update(exportRuns)
    .set({ state: "expired", updatedAt: Date.now() })
    .where(and(eq(exportRuns.id, id), eq(exportRuns.state, "removing")));
}

export async function removeQuietly(ports: Readonly<CleanupPorts>, id: number): Promise<void> {
  try {
    await removeExport(ports, id);
  } catch (error) {
    logFailure("export-cleanup-failed", { exportId: id }, error);
  }
}

export async function cleanExports(ports: Readonly<CleanupPorts>): Promise<void> {
  const stale = await ports.db
    .select({ id: exportRuns.id })
    .from(exportRuns)
    .where(
      or(
        eq(exportRuns.state, "removing"),
        and(eq(exportRuns.state, "failed"), lt(exportRuns.updatedAt, Date.now() - SETTLE_MS)),
        and(eq(exportRuns.state, "ready"), lt(exportRuns.finishedAt, Date.now() - EXPORT_KEEP_MS)),
      ),
    )
    .orderBy(exportRuns.id)
    .limit(EXPORT_CLEANUP_BATCH);

  await Promise.all(stale.map(({ id }) => removeExport(ports, id)));

  const removed = await deleteMatching(ports.files, EXPORT_FILES_ROOT, (keys) =>
    expiredKeys(ports.db, keys),
  );

  if (removed > 0) report("export-stray-objects-removed", { keys: removed });
}
