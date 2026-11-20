import { eq } from "drizzle-orm";

import { logFailure } from "./failure-log.ts";
import { itemFilesPrefix } from "./file-keys.ts";
import { listedKeys } from "./file-pages.ts";
import type { FileStore } from "./file-store.ts";
import type { Ports } from "./ports.ts";
import { goneWithItem } from "./proposal-lifecycle.ts";
import { items } from "./schema.ts";
import { STALE } from "./vault-stale.ts";

async function deleteFilesQuietly(files: FileStore, itemId: number): Promise<void> {
  try {
    const keys = await listedKeys(files, itemFilesPrefix(itemId));

    if (keys.length > 0) await files.delete(keys);
  } catch (error) {
    logFailure("item-files-not-deleted", { itemId }, error);
  }
}

function rowsOfLast(results: readonly unknown[]): number {
  const last = results.at(-1);

  return Array.isArray(last) ? last.length : 0;
}

export async function deleteItem(
  { db, files }: Readonly<Pick<Ports, "db" | "files">>,
  id: number,
): Promise<boolean> {
  const results = await db.batch([
    ...STALE.itemDeleted(db, id),
    ...goneWithItem(db, id),
    db.delete(items).where(eq(items.id, id)).returning({ id: items.id }),
  ]);

  if (rowsOfLast(results) === 0) return false;

  await deleteFilesQuietly(files, id);

  return true;
}
