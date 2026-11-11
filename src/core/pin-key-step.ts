import { type SQL, and, asc, eq, gte, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { CATALOG_KEY_MAX } from "./catalog-key-limit.ts";
import { CATALOG_KEY_VERSION, catalogKey } from "./catalog-key.ts";
import type { Advance, DataStep } from "./data-step-contract.ts";
import { repointedPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { proposalRelinks } from "./proposal-relink.ts";
import { guards, insertGuard, pins, proposals, tags } from "./schema.ts";
import { REWRITE_UNIT_ITEMS, closingWrites, readRewrite } from "./tag-rewrite.ts";

const into = alias(tags, "into_tag");

const PINS_PER_STATEMENT = 100;

const TEMPORARY_KEY = "~".repeat(CATALOG_KEY_MAX + 1);

function chunked<Row>(rows: readonly Row[]): readonly (readonly Row[])[] {
  return Array.from({ length: Math.ceil(rows.length / PINS_PER_STATEMENT) }, (_, at) =>
    rows.slice(at * PINS_PER_STATEMENT, (at + 1) * PINS_PER_STATEMENT),
  );
}

function idsAmong(ids: readonly number[]) {
  return sql`${pins.id} in (select value from json_each(${JSON.stringify(ids)}))`;
}

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

function misfiledTags(db: Database) {
  return db
    .select({ id: tags.id })
    .from(tags)
    .innerJoin(pins, and(eq(pins.kind, "tag-merge"), eq(pins.fromKey, tags.key)))
    .where(and(ne(pins.intoTagId, tags.id), acceptingFrom(db)));
}

async function recomputedKeys(db: Database): Promise<Advance> {
  const rows = await db
    .select({ id: pins.id, kind: pins.kind, key: pins.fromKey, name: pins.fromName })
    .from(pins)
    .orderBy(asc(pins.id));

  const owners = new Map<string, number>();
  const losers: number[] = [];
  const changed: { id: number; key: string }[] = [];

  for (const { id, kind, key, name } of rows) {
    const next = catalogKey(name);
    const slot = `${kind}|${next}`;

    if (owners.has(slot)) {
      losers.push(id);
    } else {
      owners.set(slot, id);

      if (next !== key) changed.push({ id, key: next });
    }
  }

  const pieces = chunked(changed);

  return {
    writes: [
      ...chunked(losers).map((ids) => db.delete(pins).where(idsAmong(ids))),
      ...pieces.map((piece) =>
        db
          .update(pins)
          .set({ fromKey: sql`${TEMPORARY_KEY} || ${pins.id}` })
          .where(idsAmong(piece.map(({ id }) => id))),
      ),
      ...pieces.map((piece) =>
        db
          .update(pins)
          .set({
            fromKey: sql`(select json_extract(next.value, '$.key') from json_each(${JSON.stringify(piece)}) as next where json_extract(next.value, '$.id') = ${pins.id})`,
          })
          .where(idsAmong(piece.map(({ id }) => id))),
      ),
    ],
    cursor: "merge:0:0",
  };
}

async function mergedTag(db: Database, cursor: string): Promise<Advance> {
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

  if (next === undefined) return { writes: [], cursor: "finish" };

  const from = { id: next.id, key: next.key, name: next.name };
  const target = { id: next.intoId, key: next.intoKey, name: next.intoName };
  const unit = await readRewrite(db, { from, into: target, after: next.id === fromId ? after : 0 });

  return {
    writes: [
      ...proposalRelinks(db, from.id, target.id),
      repointedPins(db, from.id, target.id),
      ...unit.writes,
      ...closingWrites(db, from.id, []),
    ],
    cursor: `merge:${String(from.id)}:${String(unit.itemIds.length < REWRITE_UNIT_ITEMS ? 0 : unit.last)}`,
  };
}

function holds(db: Database, stored: readonly Readonly<{ id: number; key: string }>[]): SQL {
  const wanted = JSON.stringify(stored);

  return sql`not exists (select 1 from json_each(${wanted}) as wanted where not exists (select 1 from ${pins} where ${pins.id} = json_extract(wanted.value, '$.id') and ${pins.fromKey} = json_extract(wanted.value, '$.key')))`;
}

function settled(db: Database, total: number): SQL {
  return sql`(select count(*) from ${pins}) = ${total} and not exists ${misfiledTags(db)}`;
}

async function finished(db: Database): Promise<Advance> {
  const rows = await db
    .select({ id: pins.id, key: pins.fromKey, name: pins.fromName })
    .from(pins)
    .orderBy(asc(pins.id));

  if (rows.some(({ name, key }) => catalogKey(name) !== key)) return { writes: [], cursor: "keys" };

  if ((await misfiledTags(db).limit(1)).length > 0) return { writes: [], cursor: "merge:0:0" };

  return {
    writes: [
      insertGuard(db, settled(db, rows.length)),
      ...chunked(rows.map(({ id, key }) => ({ id, key }))).map((piece) =>
        insertGuard(db, holds(db, piece)),
      ),
      db.delete(guards),
    ],
    cursor: null,
  };
}

function advance(db: Database, cursor: string | null): Promise<Advance> {
  if (cursor === null || cursor === "keys") return recomputedKeys(db);

  return cursor.startsWith("merge:") ? mergedTag(db, cursor) : finished(db);
}

export const pinKeyStep: DataStep = {
  name: "pin-keys",
  version: CATALOG_KEY_VERSION,
  advance,
};
