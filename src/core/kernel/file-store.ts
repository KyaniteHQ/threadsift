import {
  type StoreKey,
  type StorePrefix,
  requireFileKey,
  requireFilePrefix,
  requireListLimit,
  requireStoredKey,
} from "../contract/file-keys.ts";

export interface FilePage {
  readonly keys: readonly string[];
  readonly cursor: string | null;
}

export interface FileStore {
  readonly put: (key: string, bytes: Uint8Array) => Promise<void>;
  readonly get: (key: string) => Promise<ReadableStream<Uint8Array> | null>;
  readonly delete: (keys: readonly string[]) => Promise<void>;
  readonly list: (prefix: string, cursor: string | null, limit: number) => Promise<FilePage>;
}

interface FileBackend {
  readonly put: (key: Readonly<StoreKey>, bytes: Uint8Array) => Promise<void>;
  readonly get: (key: Readonly<StoreKey>) => Promise<ReadableStream<Uint8Array> | null>;
  readonly delete: (keys: readonly Readonly<StoreKey>[]) => Promise<void>;
  readonly list: (
    prefix: Readonly<StorePrefix>,
    cursor: string | null,
    limit: number,
  ) => Promise<FilePage>;
}

export function checkedFileStore(backend: Readonly<FileBackend>): FileStore {
  return {
    put: async (key, bytes) => {
      await backend.put(requireFileKey(key), bytes);
    },
    get: async (key) => {
      const stored = requireStoredKey(key);
      const body = await backend.get(stored);

      return body;
    },
    delete: async (keys) => {
      await backend.delete(Array.from(keys, (key) => requireStoredKey(key)));
    },
    list: async (prefix, cursor, limit) => {
      const checkedLimit = requireListLimit(limit);
      const page = await backend.list(requireFilePrefix(prefix), cursor, checkedLimit);

      return page;
    },
  };
}
