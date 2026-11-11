import { eq } from "drizzle-orm";

import type { ImportCursor, ImportState } from "./import-contract.ts";
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
  { name, cursor }: Readonly<ImportCursor>,
): Promise<ImportCursor> {
  const now = Date.now();

  await db
    .insert(imports)
    .values({ name, cursor, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: imports.name, set: { cursor, updatedAt: now } });

  return { name, cursor };
}
