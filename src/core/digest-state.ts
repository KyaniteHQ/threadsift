import { type SQL, sql } from "drizzle-orm";

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
