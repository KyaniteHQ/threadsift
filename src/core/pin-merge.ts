import { type SQL, type SQLWrapper, and, asc, eq, gte, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import {
  type CatalogKind,
  TAG_KIND,
  TOPIC_KIND,
  closingWrites,
  topicClosingWrites,
} from "./catalog-key-links.ts";
import type { Advance } from "./data-step-contract.ts";
import { repointedPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { proposalRelinks } from "./proposal-lifecycle.ts";
import { pins, proposals, tags } from "./schema.ts";
import { REWRITE_UNIT_ITEMS, readRewrite } from "./tag-rewrite.ts";

const into = alias(tags, "into_tag");

function numbers(cursor: string): readonly number[] {
  return cursor.split(":").slice(1).map(Number);
}

function noAcceptingProposal(
  db: Database,
  kind: CatalogKind,
  fromId: Readonly<SQLWrapper> | number,
) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(proposals)
      .where(and(eq(kind.proposalFrom, fromId), eq(proposals.state, "accepting"))),
  );
}

function misfiled(db: Database, kind: CatalogKind) {
  const { table } = kind;

  return db
    .select({ id: table.id })
    .from(table)
    .innerJoin(pins, and(eq(pins.kind, kind.pinKind), eq(pins.fromKey, table.key)))
    .where(and(ne(kind.pinTarget, table.id), noAcceptingProposal(db, kind, table.id)));
}

export function noneMisfiled(db: Database): SQL {
  return sql`not exists ${misfiled(db, TAG_KIND)} and not exists ${misfiled(db, TOPIC_KIND)}`;
}

export async function firstMisfiled(db: Database): Promise<"tags" | "topics" | null> {
  if ((await misfiled(db, TAG_KIND).limit(1)).length > 0) return "tags";

  return (await misfiled(db, TOPIC_KIND).limit(1)).length > 0 ? "topics" : null;
}

export async function mergedTag(db: Database, cursor: string): Promise<Advance> {
  const [fromId = 0, after = 0] = numbers(cursor);

  const [next] = await db
    .select({
      id: tags.id,
      key: tags.key,
      name: tags.name,
      intoId: into.id,
      intoKey: into.key,
      intoName: into.name,
    })
    .from(tags)
    .innerJoin(pins, and(eq(pins.kind, TAG_KIND.pinKind), eq(pins.fromKey, tags.key)))
    .innerJoin(into, eq(into.id, pins.intoTagId))
    .where(
      and(
        gte(tags.id, fromId),
        ne(pins.intoTagId, tags.id),
        noAcceptingProposal(db, TAG_KIND, tags.id),
      ),
    )
    .orderBy(asc(tags.id))
    .limit(1);

  if (next === undefined) return { writes: [], cursor: "topics" };

  const from = { id: next.id, key: next.key, name: next.name };
  const target = { id: next.intoId, key: next.intoKey, name: next.intoName };
  const unit = await readRewrite(db, { from, into: target, after: next.id === fromId ? after : 0 });

  return {
    writes: [
      ...proposalRelinks(db, "tag-merge", from.id, target.id),
      repointedPins(db, from.id, target.id),
      ...unit.writes,
      ...closingWrites(db, TAG_KIND, from.id),
    ],
    guard: noAcceptingProposal(db, TAG_KIND, from.id),
    cursor: `merge:${String(from.id)}:${String(unit.itemIds.length < REWRITE_UNIT_ITEMS ? 0 : unit.last)}`,
  };
}

export async function mergedTopic(db: Database): Promise<Advance> {
  const [next] = await db
    .select({ id: TOPIC_KIND.table.id, intoId: sql<number>`${pins.intoTopicId}` })
    .from(TOPIC_KIND.table)
    .innerJoin(pins, and(eq(pins.kind, TOPIC_KIND.pinKind), eq(pins.fromKey, TOPIC_KIND.table.key)))
    .where(
      and(
        ne(pins.intoTopicId, TOPIC_KIND.table.id),
        noAcceptingProposal(db, TOPIC_KIND, TOPIC_KIND.table.id),
      ),
    )
    .orderBy(asc(TOPIC_KIND.table.id))
    .limit(1);

  if (next === undefined) return { writes: [], cursor: "finish" };

  const moves = await TOPIC_KIND.linked(db, next.id);

  return {
    writes: [
      ...TOPIC_KIND.relink(db, next.id, next.intoId, moves),
      ...topicClosingWrites(db, next.id, next.intoId, []).writes,
    ],
    guard: noAcceptingProposal(db, TOPIC_KIND, next.id),
    cursor: "topics",
  };
}
