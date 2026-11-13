import { type SQL, asc, inArray, sql } from "drizzle-orm";

import { batchesOf } from "./batches.ts";
import { CATALOG_KEY_MAX } from "./catalog-key-limit.ts";
import { CATALOG_KEY_VERSION, catalogKey } from "./catalog-key.ts";
import type { Advance, DataStep } from "./data-step-contract.ts";
import { among, guards, insertGuard } from "./guards.ts";
import { MERGE_KINDS } from "./kinds.ts";
import { mergedTag, mergedTopic, firstMisfiled, noneMisfiled } from "./pin-merge.ts";
import type { Database } from "./ports.ts";
import { pins } from "./schema.ts";

const TAGS_CURSOR = "merge:0:0";

const TOPICS_CURSOR = "topics";

const MISFILED_CURSORS = { tags: TAGS_CURSOR, topics: TOPICS_CURSOR } as const;

const PINS_PER_STATEMENT = 100;

const mergePin = inArray(pins.kind, [...MERGE_KINDS]);

const TEMPORARY_KEY = "~".repeat(CATALOG_KEY_MAX + 1);

function idsOf(rows: readonly Readonly<{ id: number }>[]): readonly number[] {
  return rows.map(({ id }) => id);
}

async function recomputedKeys(db: Database): Promise<Advance> {
  const rows = await db
    .select({ id: pins.id, kind: pins.kind, key: pins.fromKey, name: pins.fromName })
    .from(pins)
    .where(mergePin)
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

  const pieces = batchesOf(changed, PINS_PER_STATEMENT);

  return {
    writes: [
      ...batchesOf(losers, PINS_PER_STATEMENT).map((ids) =>
        db.delete(pins).where(among(pins.id, ids)),
      ),
      ...pieces.map((piece) =>
        db
          .update(pins)
          .set({ fromKey: sql`${TEMPORARY_KEY} || ${pins.id}` })
          .where(among(pins.id, idsOf(piece))),
      ),
      ...pieces.map((piece) =>
        db
          .update(pins)
          .set({
            fromKey: sql`(select json_extract(next.value, '$.key') from json_each(${JSON.stringify(piece)}) as next where json_extract(next.value, '$.id') = ${pins.id})`,
          })
          .where(among(pins.id, idsOf(piece))),
      ),
    ],
    cursor: TAGS_CURSOR,
  };
}

function holds(stored: readonly Readonly<{ id: number; key: string }>[]): SQL {
  const wanted = JSON.stringify(stored);

  return sql`not exists (select 1 from json_each(${wanted}) as wanted where not exists (select 1 from ${pins} where ${pins.id} = json_extract(wanted.value, '$.id') and ${pins.fromKey} = json_extract(wanted.value, '$.key')))`;
}

function settled(db: Database, total: number): SQL {
  return sql`(select count(*) from ${pins} where ${mergePin}) = ${total} and ${noneMisfiled(db)}`;
}

async function finished(db: Database): Promise<Advance> {
  const rows = await db
    .select({ id: pins.id, key: pins.fromKey, name: pins.fromName })
    .from(pins)
    .where(mergePin)
    .orderBy(asc(pins.id));

  if (rows.some(({ name, key }) => catalogKey(name) !== key)) return { writes: [], cursor: "keys" };

  const misfiledKind = await firstMisfiled(db);

  if (misfiledKind !== null) return { writes: [], cursor: MISFILED_CURSORS[misfiledKind] };

  return {
    writes: [
      insertGuard(db, settled(db, rows.length)),
      ...batchesOf(
        rows.map(({ id, key }) => ({ id, key })),
        PINS_PER_STATEMENT,
      ).map((piece) => insertGuard(db, holds(piece))),
      db.delete(guards),
    ],
    cursor: null,
  };
}

function advance(db: Database, cursor: string | null): Promise<Advance> {
  if (cursor === null || cursor === "keys") return recomputedKeys(db);

  if (cursor.startsWith("merge:")) return mergedTag(db, cursor);

  return cursor === TOPICS_CURSOR ? mergedTopic(db) : finished(db);
}

export const pinKeyStep: DataStep = {
  name: "pin-keys",
  version: CATALOG_KEY_VERSION,
  advance,
};
