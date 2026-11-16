import { and, eq } from "drizzle-orm";

import type { ImportCursor, ImportState, ImportWrite } from "./import-contract.ts";
import type { Database } from "./ports.ts";
import { imports } from "./schema.ts";

export async function readImport(db: Database, name: string): Promise<ImportState | undefined> {
  const [found] = await db
    .select({ name: imports.name, cursor: imports.cursor, updatedAt: imports.updatedAt })
    .from(imports)
    .where(eq(imports.name, name));

  return found;
}

export async function saveImport(
  db: Database,
  { name, cursor, previous }: Readonly<ImportWrite>,
): Promise<ImportCursor | null> {
  const now = Date.now();
  const row = { name, cursor, createdAt: now, updatedAt: now };

  if (previous === undefined) {
    await db
      .insert(imports)
      .values(row)
      .onConflictDoUpdate({ target: imports.name, set: { cursor, updatedAt: now } });

    return { name, cursor };
  }

  await (previous === null
    ? db.insert(imports).values(row).onConflictDoNothing()
    : db
        .update(imports)
        .set({ cursor, updatedAt: now })
        .where(and(eq(imports.name, name), eq(imports.cursor, previous))));

  const stored = await readImport(db, name);

  return stored === undefined ? null : { name, cursor: stored.cursor };
}
