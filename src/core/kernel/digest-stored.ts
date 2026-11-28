import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { type Digest, parseStoredDigest } from "../contract/digest-schema.ts";
import type { DigestOutcome } from "../contract/item-contract.ts";
import type { Database } from "./database.ts";
import { hasDigestSource } from "./digest-source.ts";
import { hasOpenJob } from "./job-rows.ts";
import { digests, items, topics } from "./schema.ts";
import { among } from "./sql-expressions.ts";

export interface DigestRead {
  readonly id: number;
  readonly task: number | null;
  readonly tags: string | null;
  readonly topic?: string;
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

function isJson(stored: Readonly<SQLWrapper>): SQL {
  return sql`json_valid(${stored})`;
}

const STORED_IS_JSON = isJson(digests.digest);

export function digestField(
  field: "title" | "summary",
  stored: Readonly<SQLWrapper>,
): SQL<string | null> {
  const path = sql.raw(`'$.${field}'`);

  return sql<
    string | null
  >`case when ${isJson(stored)} and json_type(${stored}, ${path}) = 'text' then json_extract(${stored}, ${path}) end`;
}

export function listedSummary(stored: Readonly<SQLWrapper>): SQL<string> {
  return sql<string>`coalesce(${digestField("summary", stored)}, '')`;
}

export function storedWithTopic(name: Readonly<SQLWrapper>): SQL {
  return sql`case when ${STORED_IS_JSON} then json_set(${digests.digest}, '$.topic', ${name}) else ${digests.digest} end`;
}

export function holdsTitleAndSummary(): SQL {
  return sql`(case when ${STORED_IS_JSON} then json_type(${digests.digest}, '$.title') = 'text' and json_type(${digests.digest}, '$.summary') = 'text' end) = 1`;
}

export function hasDigest(itemId: number | SQLWrapper): SQL {
  return sql`exists (select 1 from ${digests} where ${digests.itemId} = ${itemId})`;
}

export function storedTaskIs(itemId: Readonly<SQLWrapper>, taskId: Readonly<SQLWrapper>): SQL {
  return sql`${taskId} = (select ${digests.taskId} from ${digests} where ${digests.itemId} = ${itemId})`;
}

export const storedTags = sql<
  string | null
>`case when ${STORED_IS_JSON} then ${digests.digest} -> '$.tags' end`;

function seenIs(stored: Readonly<SQLWrapper>, field: "task" | "tags" | "topic"): SQL {
  return sql`(select ${stored} from ${digests} where ${digests.itemId} = json_extract(seen.value, '$.id')) is json_extract(seen.value, ${`$.${field}`})`;
}

export function unchangedDigests(reads: readonly DigestRead[]): SQL {
  return sql`select json_extract(seen.value, '$.id') from json_each(${JSON.stringify(reads)}) as seen where ${seenIs(digests.taskId, "task")} and ${seenIs(storedTags, "tags")} and (json_type(seen.value, '$.topic') is null or ${seenIs(digests.topic, "topic")})`;
}

export function storedDigests(db: Database, itemIds: readonly number[]) {
  return db
    .select({
      itemId: digests.itemId,
      digest: digests.digest,
      taskId: digests.taskId,
      tags: storedTags,
      topic: digests.topic,
    })
    .from(digests)
    .where(among(digests.itemId, itemIds));
}

export type StoredDigest = Awaited<ReturnType<typeof storedDigests>>[number];

export const DIGEST_VIEW_COLUMNS = {
  digestTitle: sql<string | null>`${digests.title}`.as("digest_title"),
  digestTopic: sql<
    string | null
  >`coalesce((select ${topics.name} from ${topics} where ${topics.id} = ${items.topicId}), ${digests.topic})`.as(
    "digest_topic",
  ),
  digestOutcome:
    sql<DigestOutcome>`case when exists ${hasOpenJob("digest")} then 'pending' when ${items.digestFailed} then 'failed' else 'none' end`.as(
      "digest_outcome",
    ),
};

export const DIGEST_SOURCE_COLUMNS = {
  digestSource: sql<boolean>`${hasDigestSource()}`.mapWith(Boolean).as("digest_source"),
};
