import { and, count, eq, gt, inArray, lte, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { dataStepRenames } from "./data-step-tables.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";

export const STEP = "item-identity";

const rename = alias(dataStepRenames, "rename");
const rival = alias(dataStepRenames, "rival");
const holder = alias(items, "holder");

function stagedKey(db: Database, which: "oldKey" | "newKey") {
  return db
    .select({ key: rename[which] })
    .from(rename)
    .where(and(eq(rename.step, STEP), eq(rename.subject, items.id)));
}

export function renameStaged(db: Database, from: number, last: number) {
  const newKey = stagedKey(db, "newKey");

  const sharesNewKey = db
    .select({ n: count() })
    .from(rival)
    .where(and(eq(rival.step, STEP), eq(rival.newKey, newKey)));

  return db
    .update(items)
    .set({ normalizedUrl: sql`(${newKey})` })
    .where(
      and(
        inArray(
          items.id,
          db
            .select({ id: rename.subject })
            .from(rename)
            .where(and(eq(rename.step, STEP), gt(rename.subject, from), lte(rename.subject, last))),
        ),
        eq(items.normalizedUrl, stagedKey(db, "oldKey")),
        eq(sharesNewKey, 1),
        notExists(
          db
            .select({ one: sql`1` })
            .from(holder)
            .where(eq(holder.normalizedUrl, newKey)),
        ),
      ),
    );
}

export function dropResolved(db: Database, from: number, last: number) {
  return db.delete(dataStepRenames).where(
    and(
      eq(dataStepRenames.step, STEP),
      gt(dataStepRenames.subject, from),
      lte(dataStepRenames.subject, last),
      notExists(
        db
          .select({ one: sql`1` })
          .from(items)
          .where(
            and(
              eq(items.id, dataStepRenames.subject),
              eq(items.normalizedUrl, dataStepRenames.oldKey),
            ),
          ),
      ),
    ),
  );
}
