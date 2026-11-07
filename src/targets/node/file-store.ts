import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { join, sep } from "node:path";

import {
  FileRefused,
  type FileKey,
  parseFileKey,
  requireFileKey,
  requireFilePrefix,
  requireListLimit,
} from "../../core/file-keys.ts";
import type { FilePage, FileStore, StoredFile } from "../../core/ports.ts";

const MISSING = new Set(["ENOENT", "ENOTDIR", "ENAMETOOLONG"]);

const TEMPORARY_BYTES = 12;

const CHUNK_BYTES = 65_536;

type Kind = "directory" | "file";

function isMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && MISSING.has(String(error.code));
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

  async locate({ itemId, name }: Readonly<FileKey>): Promise<Located> {
    const leaf = this.path("items", itemId, name);

    const found = await Promise.all([
      exists(this.path("items"), "directory"),
      exists(this.path("items", itemId), "directory"),
      exists(leaf, "file"),
    ]);

    return { leaf, present: found.every(Boolean) };
  }

  async keysIn(itemId: string): Promise<string[]> {
    const folder = this.path("items", itemId);

    if (!(await exists(folder, "directory"))) return [];

    return (await readdir(folder, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => `items/${itemId}/${entry.name}`)
      .filter((key) => parseFileKey(key) !== null);
  }

  async keysUnder(itemId: string | null): Promise<string[]> {
    if (itemId !== null) return (await this.keysIn(itemId)).toSorted();

    const items = this.path("items");

    if (!(await exists(items, "directory"))) return [];

    const folders = (await readdir(items, { withFileTypes: true })).filter((entry) =>
      entry.isDirectory(),
    );

    return (await Promise.all(folders.map((entry) => this.keysIn(entry.name)))).flat().toSorted();
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

async function readable(path: string): Promise<ReadableStream<Uint8Array>> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);

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

      await mkdir(folder.path("items", parsed.itemId), { recursive: true });

      const temporary = folder.path(
        "items",
        parsed.itemId,
        `.tmp-${randomBytes(TEMPORARY_BYTES).toString("hex")}-${parsed.name}`,
      );

      await writeAtomically(temporary, (await folder.locate(parsed)).leaf, bytes);
    },
    get: async (key) => {
      const { leaf, present } = await folder.locate(requireFileKey(key));

      return present ? readable(leaf) : null;
    },
    delete: async (keys) => {
      const parsed = keys.map((key) => requireFileKey(key));
      const located = await Promise.all(parsed.map((one) => folder.locate(one)));

      await Promise.all(
        located.filter(({ present }) => present).map(({ leaf }) => rm(leaf, { force: true })),
      );
    },
    list: async (prefix, cursor, limit): Promise<FilePage> => {
      const size = requireListLimit(limit);
      const keys = await folder.keysUnder(requireFilePrefix(prefix).itemId);
      const after = cursor === null ? keys : keys.filter((key) => key > cursor);
      const page = after.slice(0, size);

      const files = (await Promise.all(page.map((key) => folder.uploaded(key)))).filter(
        (file) => file !== null,
      );

      return { files, cursor: after.length > size ? (page.at(-1) ?? null) : null };
    },
  };
}
