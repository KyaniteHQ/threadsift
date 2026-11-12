import { and, asc, eq, gte, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Advance } from "./data-step-contract.ts";
import { repointedPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { proposalRelinks } from "./proposal-relink.ts";
import { pins, proposals, tags } from "./schema.ts";
import { REWRITE_UNIT_ITEMS, closingWrites, readRewrite } from "./tag-rewrite.ts";

const into = alias(tags, "into_tag");

function numbers(cursor: string): readonly number[] {
  return cursor.split(":").slice(1).map(Number);
}

function acceptingFrom(db: Database) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(proposals)
      .where(and(eq(proposals.fromTagId, tags.id), eq(proposals.state, "accepting"))),
  );
}

export function misfiledTags(db: Database) {
  return db
    .select({ id: tags.id })
    .from(tags)
    .innerJoin(pins, and(eq(pins.kind, "tag-merge"), eq(pins.fromKey, tags.key)))
    .where(and(ne(pins.intoTagId, tags.id), acceptingFrom(db)));
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
    .innerJoin(pins, and(eq(pins.kind, "tag-merge"), eq(pins.fromKey, tags.key)))
    .innerJoin(into, eq(into.id, pins.intoTagId))
    .where(and(gte(tags.id, fromId), ne(pins.intoTagId, tags.id), acceptingFrom(db)))
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
      ...closingWrites(db, from.id, []),
    ],
    cursor: `merge:${String(from.id)}:${String(unit.itemIds.length < REWRITE_UNIT_ITEMS ? 0 : unit.last)}`,
  };
}
