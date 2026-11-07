import {
  FILE_LIST_LIMIT,
  parseFileKey,
  requireFileKey,
  requireFilePrefix,
  requireListLimit,
} from "../../core/file-keys.ts";
import type { FilePage, FileStore } from "../../core/ports.ts";

interface BucketObject {
  readonly key: string;
  readonly uploaded: Date;
}

interface BucketListing {
  readonly objects: readonly BucketObject[];
  readonly truncated: boolean;
  readonly cursor?: string;
}

interface ListOptions {
  readonly prefix: string;
  readonly limit: number;
  cursor?: string;
}

export interface FilesBucket {
  readonly get: (key: string) => Promise<Readonly<{ body: ReadableStream<Uint8Array> }> | null>;
  readonly put: (key: string, value: Uint8Array) => Promise<BucketObject | null>;
  readonly delete: (keys: readonly string[]) => Promise<void>;
  readonly list: (options: Readonly<ListOptions>) => Promise<BucketListing>;
}

function batchesOf(keys: readonly string[]): string[][] {
  return Array.from({ length: Math.ceil(keys.length / FILE_LIST_LIMIT) }, (_, index) =>
    keys.slice(index * FILE_LIST_LIMIT, (index + 1) * FILE_LIST_LIMIT),
  );
}

export function r2FileStore(bucket: FilesBucket): FileStore {
  return {
    put: async (key, bytes) => {
      requireFileKey(key);
      await bucket.put(key, bytes);
    },
    get: async (key) => {
      requireFileKey(key);

      return (await bucket.get(key))?.body ?? null;
    },
    delete: async (keys) => {
      for (const key of keys) requireFileKey(key);

      await Promise.all(batchesOf(keys).map((batch) => bucket.delete(batch)));
    },
    list: async (prefix, cursor, limit): Promise<FilePage> => {
      requireFilePrefix(prefix);

      const options: ListOptions = { prefix, limit: requireListLimit(limit) };

      if (cursor !== null) options.cursor = cursor;

      const listing = await bucket.list(options);

      return {
        files: listing.objects.flatMap(({ key, uploaded }) =>
          parseFileKey(key) === null ? [] : [{ key, uploadedAt: uploaded.getTime() }],
        ),
        cursor: listing.truncated ? (listing.cursor ?? null) : null,
      };
    },
  };
}
