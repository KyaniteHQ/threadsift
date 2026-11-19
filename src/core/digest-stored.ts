import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { type Digest, parseStoredDigest } from "./digest-schema.ts";
import { among } from "./guards.ts";
import { digests } from "./schema.ts";

export interface DigestRead {
  readonly id: number;
  readonly task: number | null;
  readonly tags: string | null;
}

type StoredDigestRead =
  | { readonly kind: "readable"; readonly digest: Digest }
  | { readonly kind: "unreadable"; readonly cause: unknown };

export function readStoredDigest(stored: string): StoredDigestRead {
  try {
    return { kind: "readable", digest: parseStoredDigest(stored) };
  } catch (cause) {
    return { kind: "unreadable", cause };
  }
}

const STORED_IS_JSON = sql`json_valid(${digests.digest})`;

export function digestField(field: "title" | "summary" | "tags"): SQL<string | null> {
  return sql<
    string | null
  >`case when ${STORED_IS_JSON} then json_extract(${digests.digest}, ${sql.raw(`'$.${field}'`)}) end`;
}

export function storedWithTopic(name: Readonly<SQLWrapper>): SQL {
  return sql`case when ${STORED_IS_JSON} then json_set(${digests.digest}, '$.topic', ${name}) else ${digests.digest} end`;
}

export function holdsTitleAndSummary(): SQL {
  return sql`(case when ${STORED_IS_JSON} then json_type(${digests.digest}, '$.title') = 'text' and json_type(${digests.digest}, '$.summary') = 'text' end) = 1`;
}

export function storedTaskIs(itemId: Readonly<SQLWrapper>, taskId: Readonly<SQLWrapper>): SQL {
  return sql`${taskId} = (select ${digests.taskId} from ${digests} where ${digests.itemId} = ${itemId})`;
}

export const storedTags = digestField("tags");

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
