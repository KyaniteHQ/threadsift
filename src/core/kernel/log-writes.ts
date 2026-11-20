import { type SQL, type SQLWrapper, eq, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { z } from "zod";

import type { LogAction, FieldOf, LOG } from "../contract/log-actions.ts";
import type { LogEntry } from "../contract/log-contract.ts";
import type { Database } from "./database.ts";
import { hasDigest } from "./digest-stored.ts";
import { digests, logEntries, proposals, topics } from "./schema.ts";
import { STALE } from "./vault-stale.ts";

interface Leaves {
  readonly item: Readonly<{ id: number; title: SQLWrapper | string }>;
  readonly topic: Readonly<{ id: SQLWrapper; name: SQLWrapper }>;
  readonly tags: SQL;
  readonly added: number;
  readonly removed: number;
  readonly picks: number;
  readonly from: string;
  readonly into: string;
  readonly items: SQLWrapper | number;
  readonly path: string;
}

type Written<Action extends LogAction> = {
  readonly [
    Field in Exclude<FieldOf<z.infer<(typeof LOG)[Action]["schema"]>>, "id" | "at" | "action">
  ]: Field extends keyof Leaves ? Leaves[Field] : never;
};

function appended<Action extends LogAction>(
  db: Database,
  action: Action | SQL<Action>,
  source: Readonly<{ from: SQLiteTable | SQL; where: SQL | undefined }>,
  written: Written<Action>,
) {
  const values: Readonly<Partial<Leaves>> = written;
  const at = Date.now();
  const write = db.insert(logEntries).select(
    db
      .select({
        id: sql<null>`null`.as("id"),
        at: sql<number>`${at}`.as("at"),
        action: sql`${action}`.as("action"),
        title: sql`${values.item?.title ?? null}`.as("title"),
        path: sql`${values.path ?? null}`.as("path"),
        topic: sql`${values.topic?.name ?? null}`.as("topic"),
        tags: sql`${values.tags ?? null}`.as("tags"),
        added: sql`${values.added ?? null}`.as("added"),
        removed: sql`${values.removed ?? null}`.as("removed"),
        picks: sql`${values.picks ?? null}`.as("picks"),
        mergedFrom: sql`${values.from ?? null}`.as("merged_from"),
        mergedInto: sql`${values.into ?? null}`.as("merged_into"),
        moved: sql`${values.items ?? null}`.as("moved"),
        itemId: sql`${values.item?.id ?? null}`.as("item_id"),
        topicId: sql`${values.topic?.id ?? null}`.as("topic_id"),
      })
      .from(source.from)
      .where(source.where),
  );

  return [write, ...STALE.logAppended(db, at)] as const;
}

const TOPIC_ROW = { id: topics.id, name: topics.name };

export function loggedDigest(
  db: Database,
  {
    itemId,
    title,
    topicKey,
    tagKeys,
  }: Readonly<{ itemId: number; title: string; topicKey: string; tagKeys: string }>,
) {
  return appended(
    db,
    sql<"ingest" | "digest">`case when ${hasDigest(itemId)} then 'digest' else 'ingest' end`,
    { from: topics, where: eq(topics.key, topicKey) },
    {
      item: { id: itemId, title },
      topic: TOPIC_ROW,
      tags: sql`(select json_group_array(tags.name order by wanted.key) from json_each(${tagKeys}) as wanted join tags on tags.key = wanted.value)`,
    },
  );
}

export function loggedTopic(db: Database, topicKey: string) {
  return appended(
    db,
    "topic",
    { from: topics, where: sql`${topics.key} = ${topicKey} and changes() > 0` },
    { topic: TOPIC_ROW },
  );
}

export function loggedOverview(
  db: Database,
  topicId: number,
  { added, removed }: Readonly<{ added: number; removed: number }>,
) {
  return appended(
    db,
    "overview",
    { from: topics, where: eq(topics.id, topicId) },
    { topic: TOPIC_ROW, added, removed },
  );
}

export function loggedRelated(db: Database, itemId: number, picks: number) {
  return appended(
    db,
    "related",
    { from: digests, where: eq(digests.itemId, itemId) },
    { item: { id: itemId, title: digests.title }, picks },
  );
}

export function loggedMerge(
  db: Database,
  {
    action,
    proposalId,
    mergedFrom,
    mergedInto,
    when,
  }: Readonly<{
    action: Extract<LogEntry, { from: unknown }>["action"];
    proposalId: number;
    mergedFrom: string;
    mergedInto: string;
    when: Readonly<SQLWrapper>;
  }>,
) {
  return appended(
    db,
    action,
    { from: proposals, where: sql`${proposals.id} = ${proposalId} and ${when}` },
    { from: mergedFrom, into: mergedInto, items: sql`coalesce(${proposals.moved}, 0)` },
  );
}

export function loggedVaultFile(
  db: Database,
  action: Extract<LogEntry, { path: unknown }>["action"],
  path: string,
  held: Readonly<SQLWrapper>,
) {
  return appended(
    db,
    action,
    {
      from: sql`(select 1)`,
      where: sql`${held} and not exists (select 1 from ${logEntries} where ${logEntries.action} = ${action} and ${logEntries.path} = ${path})`,
    },
    { path },
  );
}
