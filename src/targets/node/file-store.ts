import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { type FileHandle, lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { join, sep } from "node:path";

import {
  FileRefused,
  type StoreKey,
  type StoreRoot,
  TEMPORARY_BYTES,
  isOwnerId,
  parseStoredKey,
  storePrefixText,
  temporaryPrefix,
} from "../../core/contract/file-keys.ts";
import { bestEffort, errnoCodeOf } from "../../core/kernel/failure-log.ts";
import { type FilePage, type FileStore, checkedFileStore } from "../../core/kernel/file-store.ts";

const CHUNK_BYTES = 65_536;

const HANDLE_NOT_CLOSED = { event: "file-handle-not-closed", fields: {} } as const;

type Kind = "directory" | "file";

const MISSING_CODES = new Set(["ENOENT", "ENOTDIR", "ENAMETOOLONG"]);

function isMissing(cause: unknown): boolean {
  return MISSING_CODES.has(errnoCodeOf(cause));
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

  folders(root: StoreRoot, ownerId: string | null): string[] {
    const kind = this.path(root);

    return ownerId === null ? [this.root, kind] : [this.root, kind, this.path(root, ownerId)];
  }

  hasFolders(root: StoreRoot, ownerId: string | null): Promise<boolean> {
    return allPresent(this.folders(root, ownerId));
  }

  ensureFolders(root: StoreRoot, ownerId: string): Promise<void> {
    return ensureAll(this.folders(root, ownerId));
  }

  async locate({ root, ownerId, name }: Readonly<StoreKey>): Promise<Located> {
    const leaf = this.path(root, ownerId, name);
    const present = (await this.hasFolders(root, ownerId)) && (await exists(leaf, "file"));

    return { leaf, present };
  }

  private async keysIn(root: StoreRoot, ownerId: string): Promise<string[]> {
    try {
      return (await readdir(this.path(root, ownerId), { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => `${storePrefixText({ root, ownerId })}${entry.name}`)
        .filter((key) => parseStoredKey(key) !== null)
        .toSorted();
    } catch (error) {
      if (errnoCodeOf(error) === "ENOENT") return [];

      throw error;
    }
  }

  private async ownerIds(root: StoreRoot, ownerId: string | null): Promise<string[]> {
    if (ownerId !== null) return [ownerId];

    return (await readdir(this.path(root), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && isOwnerId(entry.name))
      .map((entry) => entry.name)
      .toSorted();
  }

  private async keysFrom(
    root: StoreRoot,
    [first, ...rest]: readonly string[],
    cursor: string | null,
    limit: number,
  ): Promise<string[]> {
    if (first === undefined || limit < 1) return [];

    const found = (await this.keysIn(root, first)).filter((key) => cursor === null || key > cursor);
    const later = await this.keysFrom(root, rest, cursor, limit - found.length);

    return [...found, ...later].slice(0, limit);
  }

  async keysAfter(
    { root, ownerId }: Readonly<{ root: StoreRoot; ownerId: string | null }>,
    cursor: string | null,
    limit: number,
  ): Promise<string[]> {
    if (!(await this.hasFolders(root, ownerId))) return [];

    const ownerIds = (await this.ownerIds(root, ownerId)).filter(
      (id) => cursor === null || !endsBefore(storePrefixText({ root, ownerId: id }), cursor),
    );

    return this.keysFrom(root, ownerIds, cursor, limit);
  }
}

async function openLeaf(path: string): Promise<FileHandle | null> {
  try {
    return await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isMissing(error)) return null;

    if (errnoCodeOf(error) === "ELOOP") {
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
    await bestEffort(HANDLE_NOT_CLOSED, () => handle.close());
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
        await bestEffort(HANDLE_NOT_CLOSED, () => handle.close());
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
    await bestEffort(HANDLE_NOT_CLOSED, () => handle.close());
    await bestEffort({ event: "temporary-file-not-removed", fields: {} }, () =>
      rm(temporary, { force: true }),
    );
    throw error;
  }
}

export function dataFileStore(dataDir: string): FileStore {
  const folder = new FileFolder(join(dataDir, "files"));

  return checkedFileStore({
    put: async (parsed, bytes) => {
      await folder.ensureFolders(parsed.root, parsed.ownerId);

      const leaf = folder.path(parsed.root, parsed.ownerId, parsed.name);

      await exists(leaf, "file");

      const temporary = folder.path(parsed.root, parsed.ownerId, temporaryName(parsed.name));

      await writeAtomically(temporary, leaf, bytes);
    },
    get: async (key) => {
      const { leaf, present } = await folder.locate(key);

      return present ? readable(leaf) : null;
    },
    delete: async (parsed) => {
      const located = await Promise.all(parsed.map((one) => folder.locate(one)));

      await Promise.all(
        located.filter(({ present }) => present).map(({ leaf }) => rm(leaf, { force: true })),
      );
    },
    list: async (prefix, cursor, limit): Promise<FilePage> => {
      const after = await folder.keysAfter(prefix, cursor, limit + 1);
      const page = after.slice(0, limit);

      return { keys: page, cursor: after.length > limit ? (page.at(-1) ?? null) : null };
    },
  });
}
