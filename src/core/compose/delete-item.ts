import { eq } from "drizzle-orm";

import { goneWithItem } from "../../features/wiki/core/proposal-lifecycle.ts";
import { itemFilesPrefix } from "../contract/file-keys.ts";
import { logFailure } from "../kernel/failure-log.ts";
import { listedKeys } from "../kernel/file-pages.ts";
import type { FileStore } from "../kernel/file-store.ts";
import type { Ports } from "../kernel/ports.ts";
import { items } from "../kernel/schema.ts";
import { STALE } from "../kernel/vault-stale.ts";

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
