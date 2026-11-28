import { and, eq, not, notExists, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { Database } from "../../../core/kernel/database.ts";
import type { JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import {
  NEW_DATABASE_IDENTITY,
  type RestoreRow,
  databaseIdentity,
  hasSubject,
  proposals,
  restoreRuns,
} from "../../../core/kernel/schema.ts";
import type { Manifest } from "../../export/core/export-format.ts";
import { EMBEDDED_JOB_ID } from "./named-files.ts";
import { RESTORE_TABLES, tableSpec } from "./restore-registry.ts";
import type { Release } from "./restore-source.ts";
import { endedUnit, tallied } from "./restore-unit.ts";

const sqliteSequence = sqliteTable("sqlite_sequence", {
  name: text("name"),
  seq: integer("seq"),
});

function sequenceWrites(db: Database, manifest: Readonly<Manifest>) {
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

function jobKeyWrites(db: Database) {
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

function proposalsWithoutSubject(db: Database, run: Readonly<RestoreRow>) {
  return [
    db.delete(proposals).where(not(hasSubject())),
    db
      .update(restoreRuns)
      .set({
        restored: tallied("restored", "proposals", sql`-changes()`),
        dropped: tallied("dropped", "proposals", sql`changes()`),
      })
      .where(and(eq(restoreRuns.id, run.id), sql`changes() > 0`)),
  ];
}

function singletonResets(db: Database, manifest: Readonly<Manifest>) {
  return RESTORE_TABLES.flatMap((name) => {
    const spec = tableSpec(name);

    return spec?.singleton === "reset" && (manifest.tables[name]?.rows ?? 0) === 0
      ? [db.delete(spec.table)]
      : [];
  });
}

export function finishUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  { manifest }: Readonly<Release>,
): JobOutcome {
  const { db } = ports;

  const before = [
    ...sequenceWrites(db, manifest),
    ...jobKeyWrites(db),
    ...singletonResets(db, manifest),
    ...proposalsWithoutSubject(db, run),
    db.update(databaseIdentity).set({ value: NEW_DATABASE_IDENTITY }),
  ];

  return endedUnit(
    db,
    run,
    { state: "done", finishedAt: Date.now(), updatedAt: Date.now() },
    before,
  );
}
