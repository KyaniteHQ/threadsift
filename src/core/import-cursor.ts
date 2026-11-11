import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "./ports.ts";
import { imports } from "./schema.ts";

export const ImportSchema = z.object({
  name: z.string().regex(/^[\w.-]{1,64}$/u, "1 to 64 letters, digits, `.`, `_` and `-`"),
  cursor: z.string().min(1).max(256),
});

export const ImportStateSchema = ImportSchema.extend({ updatedAt: z.number().int() });

export type ImportCursor = z.infer<typeof ImportSchema>;

export type ImportState = z.infer<typeof ImportStateSchema>;

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
