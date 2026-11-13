import { type SQLWrapper, and, asc, eq, gt, lte, min, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { type CatalogKind, TAG_KIND, TOPIC_KIND, isLastUnit } from "./catalog-key-links.ts";
import { CATALOG_KEY_VERSION, catalogKey } from "./catalog-key.ts";
import type { Advance, DataStep } from "./data-step-contract.ts";
import { dataStepRenames, dropStaged, stageRenames } from "./data-step-tables.ts";
import { report } from "./failure-log.ts";
import { guards, insertGuard } from "./guards.ts";
import { pinKeyStep } from "./pin-key-step.ts";
import type { Database } from "./ports.ts";

const STAGE_ROWS = 100;
const RENAME_ROWS = 500;
const UNFINISHED_IDS = 20;

const staged = alias(dataStepRenames, "staged");
const rival = alias(dataStepRenames, "rival");

function after(cursor: string): number {
  return Number(cursor.split(":")[1]);
}

function leaderOf(db: Database, step: string, newKey: Readonly<SQLWrapper>) {
  return db
    .select({ first: min(rival.subject) })
    .from(rival)
    .where(and(eq(rival.step, step), eq(rival.newKey, newKey)));
}

async function stage(db: Database, kind: CatalogKind, from: number): Promise<Advance> {
  const { table } = kind;

  const rows = await db
    .select({ id: table.id, key: table.key, name: table.name })
    .from(table)
    .where(gt(table.id, from))
    .orderBy(asc(table.id))
    .limit(STAGE_ROWS);

  const last = rows.at(-1);

  if (last === undefined) {
    return { writes: [], cursor: "merge:0" };
  }

  return {
    writes: stageRenames(
      db,
      rows.map(({ id, key, name }) => ({
        step: kind.step,
        subject: id,
        oldKey: key,
        newKey: catalogKey(name),
      })),
    ),
    cursor: `stage:${last.id}`,
  };
}

async function merge(db: Database, kind: CatalogKind, from: number): Promise<Advance> {
  const [next] = await db
    .select({
      loser: staged.subject,
      survivor: sql<number>`(${leaderOf(db, kind.step, staged.newKey)})`,
    })
    .from(staged)
    .where(
      and(
        eq(staged.step, kind.step),
        gt(staged.subject, from),
        gt(staged.subject, leaderOf(db, kind.step, staged.newKey)),
      ),
    )
    .orderBy(asc(staged.subject))
    .limit(1);

  if (next === undefined) {
    return { writes: [], cursor: "rename:0" };
  }

  const moves = await kind.linked(db, next.loser);
  const emptied = isLastUnit(moves);

  return {
    writes: [
      ...kind.relink(db, next.loser, next.survivor, moves),
      ...(emptied
        ? [
            db
              .delete(kind.table)
              .where(and(eq(kind.table.id, next.loser), kind.unlinked(db, next.loser))),
          ]
        : []),
    ],
    cursor: `merge:${emptied ? next.loser : from}`,
  };
}

function renameStaged(db: Database, kind: CatalogKind, from: number, last: number) {
  const { table } = kind;
  const holder = alias(table, "holder");

  const stagedKey = (which: "oldKey" | "newKey") =>
    db
      .select({ key: staged[which] })
      .from(staged)
      .where(and(eq(staged.step, kind.step), eq(staged.subject, table.id)));

  const newKey = stagedKey("newKey");

  return db
    .update(table)
    .set({ key: sql`(${newKey})` })
    .where(
      and(
        gt(table.id, from),
        lte(table.id, last),
        eq(table.key, stagedKey("oldKey")),
        ne(table.key, newKey),
        eq(table.id, leaderOf(db, kind.step, newKey)),
        notExists(
          db
            .select({ one: sql`1` })
            .from(holder)
            .where(and(eq(holder.key, newKey), ne(holder.id, table.id))),
        ),
      ),
    );
}

async function rename(db: Database, kind: CatalogKind, from: number): Promise<Advance> {
  const subjects = await db
    .select({ subject: staged.subject })
    .from(staged)
    .where(and(eq(staged.step, kind.step), gt(staged.subject, from)))
    .orderBy(asc(staged.subject))
    .limit(RENAME_ROWS);

  const last = subjects.at(-1);

  return last === undefined
    ? { writes: [], cursor: "finish:0" }
    : { writes: [renameStaged(db, kind, from, last.subject)], cursor: `rename:${last.subject}` };
}

function unfinished(db: Database, kind: CatalogKind) {
  const { table } = kind;

  return db
    .select({ id: table.id })
    .from(table)
    .innerJoin(staged, and(eq(staged.step, kind.step), eq(staged.subject, table.id)))
    .where(or(ne(table.key, staged.newKey), gt(table.id, leaderOf(db, kind.step, staged.newKey))));
}

async function finish(db: Database, kind: CatalogKind): Promise<Advance> {
  const open = await unfinished(db, kind).orderBy(asc(kind.table.id)).limit(UNFINISHED_IDS);

  if (open.length > 0) {
    report("catalog-keys-restaged", { step: kind.step, ids: open.map(({ id }) => id) });

    return { writes: [dropStaged(db, kind.step)], cursor: "stage:0" };
  }

  return {
    writes: [
      insertGuard(db, notExists(unfinished(db, kind))),
      dropStaged(db, kind.step),
      db.delete(guards),
    ],
    cursor: null,
  };
}

function advance(db: Database, kind: CatalogKind, cursor: string | null) {
  if (cursor === null) {
    return Promise.resolve({ writes: [dropStaged(db, kind.step)], cursor: "stage:0" });
  }

  switch (cursor.split(":")[0] ?? "") {
    case "stage": {
      return stage(db, kind, after(cursor));
    }

    case "merge": {
      return merge(db, kind, after(cursor));
    }

    case "rename": {
      return rename(db, kind, after(cursor));
    }

    default: {
      return finish(db, kind);
    }
  }
}

function catalogKeyStep(kind: CatalogKind): DataStep {
  return {
    name: kind.step,
    version: CATALOG_KEY_VERSION,
    advance: (db, cursor) => advance(db, kind, cursor),
  };
}

export const catalogKeySteps: readonly DataStep[] = [
  catalogKeyStep(TOPIC_KIND),
  catalogKeyStep(TAG_KIND),
  pinKeyStep,
];
