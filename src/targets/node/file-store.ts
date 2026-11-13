import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { type FileHandle, lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { join, sep } from "node:path";

import {
  FileRefused,
  TEMPORARY_BYTES,
  type FileKey,
  parseStoredKey,
  requireFileKey,
  requireStoredKey,
  requireFilePrefix,
  requireListLimit,
  temporaryPrefix,
} from "../../core/file-keys.ts";
import type { FilePage, FileStore, StoredFile } from "../../core/ports.ts";

const MISSING = new Set(["ENOENT", "ENOTDIR", "ENAMETOOLONG"]);

const CHUNK_BYTES = 65_536;

type Kind = "directory" | "file";

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return isErrno(error) && MISSING.has(String(error.code));
}

async function exists(path: string, wanted: Kind): Promise<boolean> {
  try {
    const stats = await lstat(path);

    if (wanted === "directory" ? stats.isDirectory() : stats.isFile()) return true;
  } catch (error) {
    if (isMissing(error)) return false;

    throw error;
  }

  throw new FileRefused(`${path} is not a regular ${wanted}`);
}

async function allPresent(folders: readonly string[]): Promise<boolean> {
  const [first, ...rest] = folders;

  if (first === undefined) return true;

  return (await exists(first, "directory")) && allPresent(rest);
}

async function ensureAll(folders: readonly string[]): Promise<void> {
  const [first, ...rest] = folders;

  if (first === undefined) return;

  if (!(await exists(first, "directory"))) {
    await mkdir(first, { recursive: true });
    await exists(first, "directory");
  }

  await ensureAll(rest);
}

function endsBefore(folderPrefix: string, cursor: string): boolean {
  return cursor > folderPrefix && !cursor.startsWith(folderPrefix);
}

interface Located {
  readonly leaf: string;
  readonly present: boolean;
}

class FileFolder {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  path(...parts: readonly string[]): string {
    const path = join(this.root, ...parts);

    if (!path.startsWith(this.root + sep)) {
      throw new FileRefused(`${path} is outside ${this.root}`);
    }

    return path;
  }

  folders(itemId: string | null): string[] {
    const items = this.path("items");

    return itemId === null ? [this.root, items] : [this.root, items, this.path("items", itemId)];
  }

  hasFolders(itemId: string | null): Promise<boolean> {
    return allPresent(this.folders(itemId));
  }

  ensureFolders(itemId: string): Promise<void> {
    return ensureAll(this.folders(itemId));
  }

  async locate({ itemId, name }: Readonly<FileKey>): Promise<Located> {
    const leaf = this.path("items", itemId, name);
    const present = (await this.hasFolders(itemId)) && (await exists(leaf, "file"));

    return { leaf, present };
  }

  private async keysIn(itemId: string): Promise<string[]> {
    return (await readdir(this.path("items", itemId), { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => `items/${itemId}/${entry.name}`)
      .filter((key) => parseStoredKey(key) !== null)
      .toSorted();
  }

  private async itemIds(itemId: string | null): Promise<string[]> {
    if (itemId !== null) return [itemId];

    return (await readdir(this.path("items"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();
  }

  private async keysFrom(
    itemIds: readonly string[],
    at: number,
    cursor: string | null,
    limit: number,
  ): Promise<string[]> {
    const itemId = itemIds[at];

    if (itemId === undefined || limit < 1) return [];

    const found = (await this.keysIn(itemId)).filter((key) => cursor === null || key > cursor);
    const later = await this.keysFrom(itemIds, at + 1, cursor, limit - found.length);

    return [...found, ...later].slice(0, limit);
  }

  async keysAfter(itemId: string | null, cursor: string | null, limit: number): Promise<string[]> {
    if (!(await this.hasFolders(itemId))) return [];

    const itemIds = (await this.itemIds(itemId)).filter(
      (id) => cursor === null || !endsBefore(`items/${id}/`, cursor),
    );

    return this.keysFrom(itemIds, 0, cursor, limit);
  }

  async uploaded(key: string): Promise<StoredFile | null> {
    try {
      const stats = await lstat(this.path(key));

      return stats.isFile() ? { key, uploadedAt: Math.floor(stats.mtimeMs) } : null;
    } catch (error) {
      if (isMissing(error)) return null;

      throw error;
    }
  }
}

async function openLeaf(path: string): Promise<FileHandle | null> {
  try {
    return await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isMissing(error)) return null;

    if (isErrno(error) && error.code === "ELOOP") {
      throw new FileRefused(`${path} is a symlink`);
    }

    throw error;
  }
}

async function readable(path: string): Promise<ReadableStream<Uint8Array> | null> {
  const handle = await openLeaf(path);

  if (handle === null) return null;

  try {
    if (!(await handle.stat()).isFile()) {
      throw new FileRefused(`${path} is not a regular file`);
    }
  } catch (error) {
    await handle.close();
    throw error;
  }

  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      try {
        const { bytesRead, buffer } = await handle.read(
          new Uint8Array(CHUNK_BYTES),
          0,
          CHUNK_BYTES,
          null,
        );

        if (bytesRead === 0) {
          controller.close();
          await handle.close();
        } else {
          controller.enqueue(buffer.subarray(0, bytesRead));
        }
      } catch (error) {
        await handle.close().catch(() => null);
        throw error;
      }
    },
    cancel: () => handle.close(),
  });
}

function temporaryName(name: string): string {
  return temporaryPrefix(randomBytes(TEMPORARY_BYTES).toString("hex")) + name;
}

async function writeAtomically(temporary: string, leaf: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(temporary, "wx");

  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    await rename(temporary, leaf);
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}

export function dataFileStore(dataDir: string): FileStore {
  const folder = new FileFolder(join(dataDir, "files"));

  return {
    put: async (key, bytes) => {
      const parsed = requireFileKey(key);

      await folder.ensureFolders(parsed.itemId);

      const { leaf } = await folder.locate(parsed);
      const temporary = folder.path("items", parsed.itemId, temporaryName(parsed.name));

      await writeAtomically(temporary, leaf, bytes);
    },
    get: async (key) => {
      const { leaf, present } = await folder.locate(requireStoredKey(key));

      return present ? readable(leaf) : null;
    },
    delete: async (keys) => {
      const parsed = keys.map((key) => requireStoredKey(key));
      const located = await Promise.all(parsed.map((one) => folder.locate(one)));

      await Promise.all(
        located.filter(({ present }) => present).map(({ leaf }) => rm(leaf, { force: true })),
      );
    },
    list: async (prefix, cursor, limit): Promise<FilePage> => {
      const size = requireListLimit(limit);
      const after = await folder.keysAfter(requireFilePrefix(prefix).itemId, cursor, size + 1);
      const page = after.slice(0, size);

      const files = (await Promise.all(page.map((key) => folder.uploaded(key)))).filter(
        (file) => file !== null,
      );

      return { files, cursor: after.length > size ? (page.at(-1) ?? null) : null };
    },
  };
}
