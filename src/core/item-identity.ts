import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Advance } from "./data-step-contract.ts";
import { dataStepRenames } from "./data-step-tables.ts";
import { finish, reportCollisions } from "./item-identity-collisions.ts";
import { STEP, dropResolved, renameStaged } from "./item-identity-staging.ts";
import { parseLink } from "./links.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";

export const ITEM_IDENTITY_VERSION = 1;

const STAGE_ROWS = 500;
const STAGE_BYTES = 4_000_000;
const INSERT_ROWS = 24;
const APPLY_ROWS = 500;

const CLEAR_CURSOR = "stage:0";

interface StoredIdentity {
  readonly id: number;
  readonly kind: string;
  readonly normalizedUrl: string;
}

function after(cursor: string): number {
  return Number(cursor.split(":")[1]);
}

function proposedIdentity({ kind, normalizedUrl }: Readonly<StoredIdentity>): string {
  if (!URL.canParse(normalizedUrl)) {
    return normalizedUrl;
  }

  const link = parseLink(normalizedUrl);

  return link.kind === kind ? link.normalizedUrl : normalizedUrl;
}

function lastIdWithinBudget(heads: readonly { readonly id: number; readonly bytes: number }[]) {
  let total = 0;

  for (const { id, bytes } of heads) {
    total += bytes;

    if (total >= STAGE_BYTES) {
      return id;
    }
  }

  return heads.at(-1)?.id;
}

async function nextItems(db: Database, from: number): Promise<readonly StoredIdentity[]> {
  const heads = await db
    .select({ id: items.id, bytes: sql<number>`length(cast(${items.normalizedUrl} as blob))` })
    .from(items)
    .where(gt(items.id, from))
    .orderBy(asc(items.id))
    .limit(STAGE_ROWS);

  const last = lastIdWithinBudget(heads);

  if (last === undefined) {
    return [];
  }

  return db
    .select({ id: items.id, kind: items.kind, normalizedUrl: items.normalizedUrl })
    .from(items)
    .where(and(gt(items.id, from), lte(items.id, last)))
    .orderBy(asc(items.id));
}

function clearStaged(db: Database): Advance {
  return {
    writes: [db.delete(dataStepRenames).where(eq(dataStepRenames.step, STEP))],
    cursor: CLEAR_CURSOR,
  };
}

function insertRenames(db: Database, rows: readonly (typeof dataStepRenames.$inferInsert)[]) {
  return db
    .insert(dataStepRenames)
    .values([...rows])
    .onConflictDoUpdate({
      target: [dataStepRenames.step, dataStepRenames.subject],
      set: { oldKey: sql`excluded.old_key`, newKey: sql`excluded.new_key` },
    });
}

async function stage(db: Database, from: number): Promise<Advance> {
  const stored = await nextItems(db, from);
  const last = stored.at(-1);

  if (last === undefined) {
    return { writes: [], cursor: "apply:0" };
  }

  const renames = stored.flatMap((item) => {
    const newKey = proposedIdentity(item);

    return newKey === item.normalizedUrl
      ? []
      : [{ step: STEP, subject: item.id, oldKey: item.normalizedUrl, newKey }];
  });

  const writes: BatchItem<"sqlite">[] = [];

  for (let start = 0; start < renames.length; start += INSERT_ROWS) {
    writes.push(insertRenames(db, renames.slice(start, start + INSERT_ROWS)));
  }

  return { writes, cursor: `stage:${last.id}` };
}

async function apply(db: Database, from: number): Promise<Advance> {
  const subjects = await db
    .select({ subject: dataStepRenames.subject })
    .from(dataStepRenames)
    .where(and(eq(dataStepRenames.step, STEP), gt(dataStepRenames.subject, from)))
    .orderBy(asc(dataStepRenames.subject))
    .limit(APPLY_ROWS);

  const last = subjects.at(-1);

  return last === undefined
    ? { writes: [], cursor: "report:0" }
    : {
        writes: [renameStaged(db, from, last.subject), dropResolved(db, from, last.subject)],
        cursor: `apply:${last.subject}`,
      };
}

export function advanceItemIdentity(db: Database, cursor: string | null): Promise<Advance> {
  if (cursor === null) {
    return Promise.resolve(clearStaged(db));
  }

  switch (cursor.split(":")[0] ?? "") {
    case "stage": {
      return stage(db, after(cursor));
    }

    case "apply": {
      return apply(db, after(cursor));
    }

    case "report": {
      return reportCollisions(db, after(cursor));
    }

    default: {
      return finish(db);
    }
  }
}
