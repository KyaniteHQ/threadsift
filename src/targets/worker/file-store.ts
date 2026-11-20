import { batchesOf } from "../../core/batches.ts";
import { parseStoredKey, storeKeyText, storePrefixText } from "../../core/file-keys.ts";
import { type FilePage, type FileStore, checkedFileStore } from "../../core/file-store.ts";

interface BucketObject {
  readonly key: string;
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

const R2_DELETE_BATCH_KEYS = 1000;

export function r2FileStore(bucket: FilesBucket): FileStore {
  return checkedFileStore({
    checksLimitFirst: false,
    put: async (key, bytes) => {
      await bucket.put(storeKeyText(key), bytes);
    },
    get: async (key) => (await bucket.get(storeKeyText(key)))?.body ?? null,
    delete: async (keys) => {
      await Promise.all(
        batchesOf(
          keys.map((key) => storeKeyText(key)),
          R2_DELETE_BATCH_KEYS,
        ).map((batch) => bucket.delete(batch)),
      );
    },
    list: async (prefix, cursor, limit): Promise<FilePage> => {
      const options: ListOptions = { prefix: storePrefixText(prefix), limit };

      if (cursor !== null) options.cursor = cursor;

      const listing = await bucket.list(options);

      return {
        keys: listing.objects.flatMap(({ key }) => (parseStoredKey(key) === null ? [] : [key])),
        cursor: listing.truncated ? (listing.cursor ?? null) : null,
      };
    },
  });
}
