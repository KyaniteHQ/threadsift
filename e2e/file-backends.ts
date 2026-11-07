import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { getPlatformProxy } from "wrangler";

import type { FileStore, StoredFile } from "../src/core/ports.ts";
import { dataFileStore } from "../src/targets/node/file-store.ts";
import { type FilesBucket, r2FileStore } from "../src/targets/worker/file-store.ts";

export const PAGE_SIZE = 2;

export interface Backend {
  readonly store: FileStore;
  readonly plant: (key: string, text: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface FolderBackend extends Backend {
  readonly dir: string;
}

export async function folderBackend(): Promise<FolderBackend> {
  const dir = await mkdtemp(join(tmpdir(), "threadsift-files-"));

  return {
    dir,
    store: dataFileStore(dir),
    plant: async (key, text) => {
      const path = join(dir, "files", key);

      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    },
    close: () => rm(dir, { recursive: true, force: true }),
  };
}

export async function bucketBackend(): Promise<Backend> {
  const dir = await mkdtemp(join(tmpdir(), "threadsift-files-"));

  const proxy = await getPlatformProxy<{ FILES: FilesBucket }>({
    configPath: join(import.meta.dirname, "..", "wrangler.jsonc"),
    persist: { path: join(dir, "v3") },
    remoteBindings: false,
  });

  return {
    store: r2FileStore(proxy.env.FILES),
    plant: async (key, text) => {
      await proxy.env.FILES.put(key, Buffer.from(text));
    },
    close: async () => {
      await proxy.dispose();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function textOf(store: FileStore, key: string): Promise<string | null> {
  const stream = await store.get(key);

  return stream === null ? null : new Response(stream).text();
}

async function pagesFrom(
  store: FileStore,
  prefix: string,
  cursor: string | null,
): Promise<(readonly StoredFile[])[]> {
  const page = await store.list(prefix, cursor, PAGE_SIZE);

  return page.cursor === null
    ? [page.files]
    : [page.files, ...(await pagesFrom(store, prefix, page.cursor))];
}

export function pagesOf(store: FileStore, prefix: string): Promise<(readonly StoredFile[])[]> {
  return pagesFrom(store, prefix, null);
}

export async function keysOf(store: FileStore, prefix: string): Promise<string[]> {
  return (await pagesOf(store, prefix)).flat().map(({ key }) => key);
}
