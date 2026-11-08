import { eq } from "drizzle-orm";

import { logFailure } from "./failure-log.ts";
import { FILE_LIST_LIMIT } from "./file-keys.ts";
import type { FileStore, Ports } from "./ports.ts";
import {
  aiTasks,
  digests,
  githubRepos,
  itemTags,
  items,
  jobs,
  redditComments,
  redditThreads,
  searchFingerprints,
  searchParts,
} from "./schema.ts";

async function storedKeys(files: FileStore, itemId: number): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | null = null;

  do {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each page starts at the cursor the previous page returned.
    const page = await files.list(`items/${itemId}/`, cursor, FILE_LIST_LIMIT);
    keys.push(...page.files.map(({ key }) => key));
    cursor = page.cursor;
  } while (cursor !== null);

  return keys;
}

async function deleteFilesQuietly(files: FileStore, itemId: number): Promise<void> {
  try {
    const keys = await storedKeys(files, itemId);

    if (keys.length > 0) await files.delete(keys);
  } catch (error) {
    logFailure("item-files-not-deleted", { itemId }, error);
  }
}

export async function deleteItem(
  { db, files }: Readonly<Pick<Ports, "db" | "files">>,
  id: number,
): Promise<boolean> {
  const [, , , , , , , , , removed] = await db.batch([
    db.delete(redditComments).where(eq(redditComments.itemId, id)),
    db.delete(redditThreads).where(eq(redditThreads.itemId, id)),
    db.delete(githubRepos).where(eq(githubRepos.itemId, id)),
    db.delete(searchParts).where(eq(searchParts.itemId, id)),
    db.delete(searchFingerprints).where(eq(searchFingerprints.itemId, id)),
    db.delete(itemTags).where(eq(itemTags.itemId, id)),
    db.delete(digests).where(eq(digests.itemId, id)),
    db.delete(aiTasks).where(eq(aiTasks.itemId, id)),
    db.delete(jobs).where(eq(jobs.itemId, id)),
    db.delete(items).where(eq(items.id, id)).returning({ id: items.id }),
  ]);

  if (removed.length === 0) return false;

  await deleteFilesQuietly(files, id);

  return true;
}
