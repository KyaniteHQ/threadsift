import { and, eq } from "drizzle-orm";

import type { ImportCursor, ImportState, ImportWrite } from "../contract/import-contract.ts";
import type { Database } from "../kernel/database.ts";
import { guardedWrite, holdsNoRow, refusedByGuard } from "../kernel/guards.ts";
import { type Closed, HOLDS_LIBRARY } from "../kernel/restore-hold.ts";
import { imports, restoreRuns } from "../kernel/schema.ts";

export async function readImport(db: Database, name: string): Promise<ImportState | undefined> {
  const [found] = await db
    .select({ name: imports.name, cursor: imports.cursor, updatedAt: imports.updatedAt })
    .from(imports)
    .where(eq(imports.name, name));

  return found;
}

function cursorWrite(db: Database, { name, cursor, previous }: Readonly<ImportWrite>) {
  const now = Date.now();
  const row = { name, cursor, createdAt: now, updatedAt: now };

  if (previous === undefined) {
    return db
      .insert(imports)
      .values(row)
      .onConflictDoUpdate({ target: imports.name, set: { cursor, updatedAt: now } });
  }

  return previous === null
    ? db.insert(imports).values(row).onConflictDoNothing()
    : db
        .update(imports)
        .set({ cursor, updatedAt: now })
        .where(and(eq(imports.name, name), eq(imports.cursor, previous)));
}

async function writtenWhileOpen(db: Database, write: Readonly<ImportWrite>): Promise<boolean> {
  try {
    const written = await guardedWrite(
      db,
      holdsNoRow(db, restoreRuns, HOLDS_LIBRARY),
      cursorWrite(db, write),
      [],
    );

    return written !== null;
  } catch (error) {
    if (refusedByGuard(error)) return false;

    throw error;
  }
}

export async function saveImport(
  db: Database,
  write: Readonly<ImportWrite>,
): Promise<ImportCursor | null | Closed> {
  if (!(await writtenWhileOpen(db, write))) return { kind: "restoring" };

  const { name, cursor, previous } = write;

  if (previous === undefined) return { name, cursor };

  const stored = await readImport(db, name);

  return stored === undefined ? null : { name, cursor: stored.cursor };
}
