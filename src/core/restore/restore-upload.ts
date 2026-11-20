import { and, eq } from "drizzle-orm";

import { restorePartKey } from "../contract/file-keys.ts";
import { RESTORE_PART_BYTES } from "../contract/limits.ts";
import { partLength, partsOf } from "../contract/restore-contract.ts";
import type { Database } from "../kernel/database.ts";
import { refusedBy } from "../kernel/guards.ts";
import type { JobPorts } from "../kernel/job-outcome.ts";
import { needsParts } from "../kernel/restore-hold.ts";
import { restoreRuns } from "../kernel/schema.ts";
import { libraryIsEmpty, restoreById } from "./restore-state.ts";

const ONE_OPEN_RESTORE = /UNIQUE constraint failed: (?:index 'restores_one_open'|restores\.)/u;

export type NewRestore =
  | { readonly kind: "created"; readonly id: number; readonly partBytes: number }
  | { readonly kind: "wrong-parts" }
  | { readonly kind: "library-not-empty" }
  | { readonly kind: "restore-open" };

export async function createRestore(
  db: Database,
  { bytes, parts }: Readonly<{ bytes: number; parts: number }>,
): Promise<NewRestore> {
  if (parts !== partsOf(bytes)) return { kind: "wrong-parts" };

  if (!(await libraryIsEmpty(db))) return { kind: "library-not-empty" };

  const now = Date.now();

  try {
    const [created] = await db
      .insert(restoreRuns)
      .values({
        state: "uploading",
        bytes,
        parts,
        partBytes: RESTORE_PART_BYTES,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: restoreRuns.id });

    if (created === undefined) throw new Error("The restore insert returned no row");

    return { kind: "created", id: created.id, partBytes: RESTORE_PART_BYTES };
  } catch (error) {
    if (refusedBy(error, ONE_OPEN_RESTORE)) return { kind: "restore-open" };

    throw error;
  }
}

export type StoredPart =
  | { readonly kind: "stored" }
  | { readonly kind: "missing" }
  | { readonly kind: "not-uploading" }
  | { readonly kind: "wrong-length" };

export async function storePart(
  { db, files }: Pick<JobPorts, "db" | "files">,
  { id, part, bytes }: Readonly<{ id: number; part: number; bytes: Uint8Array }>,
): Promise<StoredPart> {
  const run = await restoreById(db, id);

  if (run === null || part > run.parts) return { kind: "missing" };

  if (run.state !== "uploading") return { kind: "not-uploading" };

  if (bytes.length !== partLength(run, part)) return { kind: "wrong-length" };

  const key = restorePartKey(id, part);

  await files.put(key, bytes);

  const touched = await db
    .update(restoreRuns)
    .set({ updatedAt: Date.now() })
    .where(and(eq(restoreRuns.id, id), eq(restoreRuns.state, "uploading")))
    .returning({ id: restoreRuns.id });

  if (touched.length > 0) return { kind: "stored" };

  const after = await restoreById(db, id);

  if (after !== null && needsParts(after)) return { kind: "stored" };

  await files.delete([key]);

  return { kind: "not-uploading" };
}
