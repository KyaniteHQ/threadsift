import { FILE_LIST_LIMIT } from "../contract/file-keys.ts";
import type { FileStore } from "./file-store.ts";

type Listing = Pick<FileStore, "list">;

type Removal = Pick<FileStore, "list" | "delete">;

async function* pagesOf(
  files: Listing,
  prefix: string,
  cursor: string | null = null,
): AsyncGenerator<readonly string[]> {
  const page = await files.list(prefix, cursor, FILE_LIST_LIMIT);

  yield page.keys;

  if (page.cursor !== null) yield* pagesOf(files, prefix, page.cursor);
}

export async function listedKeys(files: Listing, prefix: string): Promise<readonly string[]> {
  const pages: (readonly string[])[] = [];

  for await (const keys of pagesOf(files, prefix)) pages.push(keys);

  return pages.flat();
}

export async function deleteMatching(
  files: Removal,
  prefix: string,
  matching: (keys: readonly string[]) => Promise<readonly string[]>,
  cursor: string | null = null,
): Promise<number> {
  const page = await files.list(prefix, cursor, FILE_LIST_LIMIT);
  const doomed = await matching(page.keys);

  if (doomed.length > 0) await files.delete(doomed);

  return (
    doomed.length +
    (page.cursor === null ? 0 : await deleteMatching(files, prefix, matching, page.cursor))
  );
}

export async function removeUnder(files: Removal, prefix: string): Promise<void> {
  const page = await files.list(prefix, null, FILE_LIST_LIMIT);

  if (page.keys.length === 0) return;

  await files.delete(page.keys);
  await removeUnder(files, prefix);
}
