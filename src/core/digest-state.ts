import { type SQL, sql } from "drizzle-orm";

import { among } from "./guards.ts";
import type { Database } from "./ports.ts";
import { digests } from "./schema.ts";

export interface DigestRead {
  readonly id: number;
  readonly task: number | null;
  readonly tags: string | null;
}

export const storedTags = sql<
  string | null
>`case when json_valid(${digests.digest}) then json_extract(${digests.digest}, '$.tags') end`;

export function unchangedDigests(reads: readonly DigestRead[]): SQL {
  return sql`select json_extract(seen.value, '$.id') from json_each(${JSON.stringify(reads)}) as seen where (select ${digests.taskId} from ${digests} where ${digests.itemId} = json_extract(seen.value, '$.id')) is json_extract(seen.value, '$.task') and (select ${storedTags} from ${digests} where ${digests.itemId} = json_extract(seen.value, '$.id')) is json_extract(seen.value, '$.tags')`;
}

export function storedDigests(db: Database, itemIds: readonly number[]) {
  return db
    .select({
      itemId: digests.itemId,
      digest: digests.digest,
      taskId: digests.taskId,
      tags: storedTags,
    })
    .from(digests)
    .where(among(digests.itemId, itemIds));
}

export type StoredDigest = Awaited<ReturnType<typeof storedDigests>>[number];
