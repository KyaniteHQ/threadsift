import { eq, notExists, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { STEPS } from "./data-step-list.ts";
import { dataSteps } from "./data-step-tables.ts";
import type { Database } from "./ports.ts";
import type { Manifest } from "./restore-check.ts";
import { RESTORE_TABLES, tableSpec } from "./restore-registry.ts";

const sqliteSequence = sqliteTable("sqlite_sequence", {
  name: text("name"),
  seq: integer("seq"),
});

export function sequenceWrites(db: Database, manifest: Readonly<Manifest>) {
  return Object.entries(manifest.sequences).flatMap(([name, seq]) => {
    if (tableSpec(name)?.autoIncrement !== true) return [];

    return [
      db
        .update(sqliteSequence)
        .set({ seq: sql`max(${sqliteSequence.seq}, ${seq})` })
        .where(eq(sqliteSequence.name, name)),
      db.insert(sqliteSequence).select(
        db
          .select({ name: sql<string>`${name}`.as("name"), seq: sql<number>`${seq}`.as("seq") })
          .from(sql`(select 1)`)
          .where(
            notExists(
              sql`(select 1 from ${sqliteSequence} where ${sqliteSequence.name} = ${name})`,
            ),
          ),
      ),
    ];
  });
}

export function stepWrites(db: Database, manifest: Readonly<Manifest>) {
  return STEPS.map(({ name }) => {
    const version = manifest.dataSteps[name] ?? 0;

    return db
      .insert(dataSteps)
      .values({ name, version, cursor: null })
      .onConflictDoUpdate({ target: dataSteps.name, set: { version, cursor: null } });
  });
}

export function singletonResets(db: Database, manifest: Readonly<Manifest>) {
  return RESTORE_TABLES.flatMap((name) => {
    const spec = tableSpec(name);

    return spec?.singleton === "reset" && (manifest.tables[name]?.rows ?? 0) === 0
      ? [db.delete(spec.table)]
      : [];
  });
}
