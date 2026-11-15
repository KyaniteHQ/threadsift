import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { BACKUP_TABLES, EXCLUDED_TABLES, type BackupTable } from "../src/core/backup-tables.ts";
import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const NamesSchema = z.array(z.object({ name: z.string() }));

const twice = (names: readonly string[]): string[] =>
  names.filter((name, index) => names.indexOf(name) !== index);

const absentFrom = (
  names: readonly string[],
  others: readonly string[],
  say: (name: string) => string,
): string[] => names.flatMap((name) => (others.includes(name) ? [] : [say(name)]));

function columnProblems(
  table: string,
  held: readonly string[],
  { columns, leftOut }: BackupTable,
): string[] {
  const listed = columns.concat(leftOut);

  return [
    ...absentFrom(
      held,
      listed,
      (name) => `${table}.${name} is in neither the exported nor the left-out set`,
    ),
    ...twice(listed).map((name) => `${table}.${name} is in both sets or twice in one`),
    ...absentFrom(
      listed,
      held,
      (name) => `${table}.${name} is listed but the table has no such column`,
    ),
  ];
}

describe("a database migrated from scratch has no table and no column of an included table that the backup lists leave unplaced", () => {
  let folder = "";
  let database: DatabaseSync;

  const namesOf = (sql: string): string[] =>
    NamesSchema.parse(database.prepare(sql).all()).map((row) => row.name);

  before(async () => {
    folder = await mkdtemp(join(tmpdir(), "threadsift-backup-tables-"));

    const file = join(folder, "threadsift.db");

    openDatabase(file, MIGRATIONS).close();
    database = new DatabaseSync(file, { readOnly: true });
  });

  after(async () => {
    database.close();
    await rm(folder, { recursive: true, force: true });
  });

  it("places every table in exactly one list", () => {
    const held = namesOf("select name from sqlite_master where type = 'table'");
    const listed = [...Object.keys(BACKUP_TABLES), ...Object.keys(EXCLUDED_TABLES)];

    assert.deepEqual(
      [
        ...absentFrom(held, listed, (name) => `${name} is in neither list`),
        ...twice(listed).map((name) => `${name} is in both lists`),
        ...absentFrom(listed, held, (name) => `${name} is listed but no migration creates it`),
      ],
      [],
    );
  });

  it("exports or leaves out every column of an included table", () => {
    assert.deepEqual(
      Object.entries(BACKUP_TABLES).flatMap(([table, listing]) =>
        columnProblems(table, namesOf(`select name from pragma_table_xinfo('${table}')`), listing),
      ),
      [],
    );
  });
});
