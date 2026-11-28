import { and, eq, sql } from "drizzle-orm";

import type {
  ImportCursor,
  ImportState,
  ImportWrite,
} from "../../../core/contract/import-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { type Closed, heldBatch, isClosed, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { imports } from "../../../core/kernel/schema.ts";

export async function readImport(db: Database, name: string): Promise<ImportState | undefined> {
  const [found] = await db
    .select({ name: imports.name, cursor: imports.cursor, updatedAt: imports.updatedAt })
    .from(imports)
    .where(eq(imports.name, name));

  return found;
}

function cursorWrite(db: Database, write: Readonly<ImportWrite>) {
  const { name, cursor } = write;
  const now = Date.now();
  const row = { name, cursor, createdAt: now, updatedAt: now };
  const moved = { cursor, updatedAt: sql`max(${now}, ${imports.updatedAt} + 1)` };

  if (!("previousUpdatedAt" in write)) {
    return write.previous === null
      ? db.insert(imports).values(row).onConflictDoNothing()
      : db.insert(imports).values(row).onConflictDoUpdate({ target: imports.name, set: moved });
  }

  return db
    .update(imports)
    .set(moved)
    .where(
      and(
        eq(imports.name, name),
        eq(imports.cursor, write.previous),
        eq(imports.updatedAt, write.previousUpdatedAt),
      ),
    );
}

async function writtenWhileOpen(db: Database, write: Readonly<ImportWrite>): Promise<boolean> {
  return !isClosed(await whileOpen(() => heldBatch(db, [cursorWrite(db, write)] as const)));
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
