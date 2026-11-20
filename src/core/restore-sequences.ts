import { eq, notExists, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { Database } from "./database.ts";
import type { Manifest } from "./export-format.ts";
import { NAMED_FILES } from "./named-files.ts";
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

const EMBEDDED_JOB_ID = sql`(select coalesce(max(cast(substr(n, instr(n, '-') + 1) as integer)), 0) from (select substr(named.key, length('items/' || named.owner || '/') + 1) as n from ${NAMED_FILES} as named where named.key like 'items/%'))`;

export function jobKeyWrites(db: Database) {
  return [
    db
      .update(sqliteSequence)
      .set({ seq: sql`max(${sqliteSequence.seq}, ${EMBEDDED_JOB_ID})` })
      .where(eq(sqliteSequence.name, "jobs")),
    db.insert(sqliteSequence).select(
      db
        .select({
          name: sql<string>`'jobs'`.as("name"),
          seq: sql<number>`${EMBEDDED_JOB_ID}`.as("seq"),
        })
        .from(sql`(select 1)`)
        .where(
          sql`${EMBEDDED_JOB_ID} > 0 and not exists (select 1 from ${sqliteSequence} where ${sqliteSequence.name} = 'jobs')`,
        ),
    ),
  ];
}

export function singletonResets(db: Database, manifest: Readonly<Manifest>) {
  return RESTORE_TABLES.flatMap((name) => {
    const spec = tableSpec(name);

    return spec?.singleton === "reset" && (manifest.tables[name]?.rows ?? 0) === 0
      ? [db.delete(spec.table)]
      : [];
  });
}
