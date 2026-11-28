import { and, eq, sql } from "drizzle-orm";

import type {
  ImportCursor,
  ImportState,
  ImportWrite,
} from "../../../core/contract/import-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { guardedWrite } from "../../../core/kernel/guards.ts";
import { type Closed, holdsNoRestore } from "../../../core/kernel/restore-hold.ts";
import { imports } from "../../../core/kernel/schema.ts";

export async function readImport(db: Database, name: string): Promise<ImportState | undefined> {
  const [found] = await db
    .select({ name: imports.name, cursor: imports.cursor, updatedAt: imports.updatedAt })
    .from(imports)
    .where(eq(imports.name, name));

  return found;
}

function cursorWrite(
  db: Database,
  { name, cursor, previous, previousUpdatedAt }: Readonly<ImportWrite>,
) {
  const now = Date.now();
  const row = { name, cursor, createdAt: now, updatedAt: now };
  const moved = { cursor, updatedAt: sql`max(${now}, ${imports.updatedAt} + 1)` };

  if (previous === undefined) {
    return db.insert(imports).values(row).onConflictDoUpdate({ target: imports.name, set: moved });
  }

  return previous === null
    ? db.insert(imports).values(row).onConflictDoNothing()
    : db
        .update(imports)
        .set(moved)
        .where(
          and(
            eq(imports.name, name),
            eq(imports.cursor, previous),
            previousUpdatedAt === undefined ? undefined : eq(imports.updatedAt, previousUpdatedAt),
          ),
        );
}

async function writtenWhileOpen(db: Database, write: Readonly<ImportWrite>): Promise<boolean> {
  const written = await guardedWrite(db, holdsNoRestore(db), cursorWrite(db, write), []);

  return written !== null;
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
