import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

import { report } from "./failure-log.ts";
import {
  FILE_LIST_LIMIT,
  RESTORE_FILES_ROOT,
  parseStoredKey,
  restoreFilesPrefix,
} from "./file-keys.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { FileStore } from "./ports.ts";
import { RESTORE_PARTS_KEEP_MS } from "./restore-contract.ts";
import { NEWEST_RESTORE, RESUMABLE_RESTORE } from "./restore-state.ts";
import { restoreRuns } from "./schema.ts";

type PartPorts = Pick<JobPorts, "db" | "files">;

export async function removeParts(files: FileStore, id: number): Promise<void> {
  const page = await files.list(restoreFilesPrefix(id), null, FILE_LIST_LIMIT);

  if (page.keys.length === 0) return;

  await files.delete(page.keys);
  await removeParts(files, id);
}

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

async function holdingParts(
  db: PartPorts["db"],
  keys: readonly string[],
): Promise<ReadonlySet<number>> {
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
        inArray(restoreRuns.id, sql`(select value from json_each(${JSON.stringify(owners)}))`),
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

async function removeStrayParts(
  ports: Readonly<PartPorts>,
  cursor: string | null,
): Promise<number> {
  const page = await ports.files.list(RESTORE_FILES_ROOT, cursor, FILE_LIST_LIMIT);
  const keys = page.keys;
  const holding = await holdingParts(ports.db, keys);
  const stray = keys.filter((key) => !holding.has(Number(parseStoredKey(key)?.ownerId)));

  if (stray.length > 0) await ports.files.delete(stray);

  return stray.length + (page.cursor === null ? 0 : await removeStrayParts(ports, page.cursor));
}

export async function cleanRestoreParts(ports: Readonly<PartPorts>): Promise<void> {
  await endAbandonedUploads(ports);

  const removed = await removeStrayParts(ports, null);

  if (removed > 0) report("restore-stray-parts-removed", { keys: removed });
}
