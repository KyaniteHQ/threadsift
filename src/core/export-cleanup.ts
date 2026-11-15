import { and, eq, inArray, lt, or } from "drizzle-orm";

import {
  EXPORT_CLEANUP_BATCH,
  EXPORT_KEEP_MS,
  EXPORT_SLICE_DEADLINE_MS,
} from "./export-contract.ts";
import { logFailure } from "./failure-log.ts";
import { FILE_LIST_LIMIT, exportFilesPrefix } from "./file-keys.ts";
import { CLAIM_MARGIN_MS, type JobPorts } from "./job-outcome.ts";
import type { FileStore } from "./ports.ts";
import { exportRuns } from "./schema.ts";

const SETTLE_MS = EXPORT_SLICE_DEADLINE_MS + CLAIM_MARGIN_MS;

type CleanupPorts = Pick<JobPorts, "db" | "files">;

async function removeObjects(files: FileStore, exportId: number): Promise<void> {
  const page = await files.list(exportFilesPrefix(exportId), null, FILE_LIST_LIMIT);

  if (page.files.length === 0) return;

  await files.delete(page.files.map(({ key }) => key));
  await removeObjects(files, exportId);
}

export async function removeExport({ db, files }: Readonly<CleanupPorts>, id: number) {
  await db
    .update(exportRuns)
    .set({ state: "removing", updatedAt: Date.now() })
    .where(and(eq(exportRuns.id, id), inArray(exportRuns.state, ["ready", "failed"])));

  await removeObjects(files, id);

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
}
