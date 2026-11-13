import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { type CatalogKind, TAG_KIND, TOPIC_KIND } from "./catalog-key-links.ts";
import { MERGE_KINDS } from "./kinds.ts";
import type { MergeRow, PlanUnit } from "./merge-unit.ts";
import type { Database } from "./ports.ts";
import { knownProposal, proposals, tags, topics } from "./schema.ts";
import { planTagUnit } from "./tag-merge-unit.ts";
import { planTopicUnit } from "./topic-merge-unit.ts";

export const MERGES = {
  "tag-merge": { catalog: TAG_KIND, plan: planTagUnit },
  "topic-merge": { catalog: TOPIC_KIND, plan: planTopicUnit },
} as const satisfies Readonly<
  Record<MergeRow["kind"], { readonly catalog: CatalogKind; readonly plan: PlanUnit }>
>;

const fromTag = alias(tags, "from_tag");

const intoTag = alias(tags, "into_tag");

const fromTopic = alias(topics, "from_topic");

const intoTopic = alias(topics, "into_topic");

export async function readRow(db: Database, id: number): Promise<MergeRow | undefined> {
  const [row] = await db
    .select({
      kind: proposals.kind,
      state: proposals.state,
      cursor: proposals.cursor,
      revision: sql<number>`coalesce(${proposals.unitRevision}, 0)`.as("revision"),
      fromId: sql<number>`coalesce(${fromTag.id}, ${fromTopic.id})`.as("from_id"),
      fromKey: sql<string>`coalesce(${fromTag.key}, ${fromTopic.key})`.as("from_key"),
      fromName: sql<string>`coalesce(${fromTag.name}, ${fromTopic.name})`.as("from_name"),
      intoId: sql<number>`coalesce(${intoTag.id}, ${intoTopic.id})`.as("into_id"),
      intoKey: sql<string>`coalesce(${intoTag.key}, ${intoTopic.key})`.as("into_key"),
      intoName: sql<string>`coalesce(${intoTag.name}, ${intoTopic.name})`.as("into_name"),
    })
    .from(proposals)
    .leftJoin(fromTag, eq(fromTag.id, proposals.fromTagId))
    .leftJoin(intoTag, eq(intoTag.id, proposals.intoTagId))
    .leftJoin(fromTopic, eq(fromTopic.id, proposals.fromTopicId))
    .leftJoin(intoTopic, eq(intoTopic.id, proposals.intoTopicId))
    .where(and(eq(proposals.id, id), knownProposal));

  const kind = MERGE_KINDS.find((each) => each === row?.kind);

  return row === undefined || kind === undefined
    ? undefined
    : {
        kind,
        state: row.state,
        cursor: row.cursor,
        revision: row.revision,
        from: { id: row.fromId, key: row.fromKey, name: row.fromName },
        into: { id: row.intoId, key: row.intoKey, name: row.intoName },
      };
}
