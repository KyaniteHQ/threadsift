import { type SQL, asc, sql } from "drizzle-orm";

import { CATALOG_KEY_MAX } from "./catalog-key-limit.ts";
import { TAG_KIND, TOPIC_KIND } from "./catalog-key-links.ts";
import { CATALOG_KEY_VERSION, catalogKey } from "./catalog-key.ts";
import type { Advance, DataStep } from "./data-step-contract.ts";
import { mergedTag, mergedTopic, misfiled } from "./pin-merge.ts";
import type { Database } from "./ports.ts";
import { guards, insertGuard, pins } from "./schema.ts";

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

function holds(db: Database, stored: readonly Readonly<{ id: number; key: string }>[]): SQL {
  const wanted = JSON.stringify(stored);

  return sql`not exists (select 1 from json_each(${wanted}) as wanted where not exists (select 1 from ${pins} where ${pins.id} = json_extract(wanted.value, '$.id') and ${pins.fromKey} = json_extract(wanted.value, '$.key')))`;
}

function settled(db: Database, total: number): SQL {
  return sql`(select count(*) from ${pins}) = ${total} and not exists ${misfiled(db, TAG_KIND)} and not exists ${misfiled(db, TOPIC_KIND)}`;
}

async function finished(db: Database): Promise<Advance> {
  const rows = await db
    .select({ id: pins.id, key: pins.fromKey, name: pins.fromName })
    .from(pins)
    .orderBy(asc(pins.id));

  if (rows.some(({ name, key }) => catalogKey(name) !== key)) return { writes: [], cursor: "keys" };

  if ((await misfiled(db, TAG_KIND).limit(1)).length > 0)
    return { writes: [], cursor: "merge:0:0" };

  if ((await misfiled(db, TOPIC_KIND).limit(1)).length > 0) return { writes: [], cursor: "topics" };

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

  if (cursor.startsWith("merge:")) return mergedTag(db, cursor);

  return cursor === "topics" ? mergedTopic(db) : finished(db);
}

export const pinKeyStep: DataStep = {
  name: "pin-keys",
  version: CATALOG_KEY_VERSION,
  advance,
};
