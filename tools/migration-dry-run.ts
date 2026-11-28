import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";

import { z } from "zod";

import { openDatabase } from "../src/targets/node/database.ts";

const USAGE =
  "Usage: node tools/migration-dry-run.ts <database file> [--migrations <dir>] [--rollback <sql file>]";

const ObjectRowSchema = z.object({ kind: z.string(), name: z.string(), sql: z.string() });

const TableRowSchema = z.object({ name: z.string() });

const ColumnRowSchema = z.object({ name: z.string() });

const MigrationRowSchema = z.object({ name: z.string() });

const RowSchema = z.record(
  z.string(),
  z.union([
    z.null(),
    z.number(),
    z.string(),
    z.bigint().transform((value) => `${String(value)}n`),
    z.instanceof(Uint8Array).transform((value) => `blob:${Buffer.from(value).toString("hex")}`),
  ]),
);

type Row = Readonly<z.output<typeof RowSchema>>;

interface Table {
  readonly columns: readonly string[];
  readonly rows: readonly Row[];
}

interface Snapshot {
  readonly objects: Readonly<Record<string, string>>;
  readonly tables: Readonly<Record<string, Table>>;
  readonly migrations: readonly string[];
}

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function tableOf(sqlite: DatabaseSync, name: string): Table {
  const columns = sqlite
    .prepare(`select name from pragma_table_info(?)`)
    .all(name)
    .map((row) => ColumnRowSchema.parse(row).name);

  return {
    columns,
    rows: sqlite
      .prepare(`select * from ${quoted(name)}`)
      .all()
      .map((row) => RowSchema.parse(row)),
  };
}

function snapshotOf(file: string): Snapshot {
  const sqlite = new DatabaseSync(file, { readOnly: true });

  try {
    const objects = sqlite
      .prepare(
        "select type as kind, name, sql from sqlite_master where sql is not null and name not like 'sqlite_%' and name <> 'd1_migrations'",
      )
      .all()
      .map((row) => ObjectRowSchema.parse(row));
    const names = sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> 'd1_migrations'",
      )
      .all()
      .map((row) => TableRowSchema.parse(row).name);
    const applied = sqlite
      .prepare("select name from sqlite_master where type = 'table' and name = 'd1_migrations'")
      .all().length;

    return {
      objects: Object.fromEntries(objects.map(({ kind, name, sql }) => [`${kind} ${name}`, sql])),
      tables: Object.fromEntries(names.map((name) => [name, tableOf(sqlite, name)])),
      migrations:
        applied === 0
          ? []
          : sqlite
              .prepare("select name from d1_migrations")
              .all()
              .map((row) => MigrationRowSchema.parse(row).name),
    };
  } finally {
    sqlite.close();
  }
}

function copyOf(source: string, directory: string, name: string): string {
  const target = join(directory, name);
  const sqlite = new DatabaseSync(source, { readOnly: true });

  try {
    sqlite.prepare("vacuum into ?").run(target);
  } finally {
    sqlite.close();
  }

  return target;
}

function schemaChanges(before: Readonly<Snapshot>, after: Readonly<Snapshot>): readonly string[] {
  const names = [
    ...new Set([...Object.keys(before.objects), ...Object.keys(after.objects)]),
  ].toSorted();

  return names.flatMap((name) => {
    const was = before.objects[name];
    const now = after.objects[name];

    if (was === now) return [];
    if (was === undefined) return [`schema: + ${name}`];
    if (now === undefined) return [`schema: - ${name}`];

    return [`schema: ~ ${name}`];
  });
}

function counted(rows: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) counts.set(row, (counts.get(row) ?? 0) + 1);

  return counts;
}

function onlyIn(
  left: Readonly<ReadonlyMap<string, number>>,
  right: Readonly<ReadonlyMap<string, number>>,
): number {
  let total = 0;

  for (const [row, count] of left) total += Math.max(0, count - (right.get(row) ?? 0));

  return total;
}

function keyed(rows: readonly Row[], columns: readonly string[]): Map<string, number> {
  return counted(rows.map((row) => JSON.stringify(columns.map((column) => row[column]))));
}

function tableChange(name: string, was: Table | undefined, now: Table | undefined): string | null {
  if (was === undefined || now === undefined) {
    return `table ${name}: ${was === undefined ? "added" : "removed"}, ${String((now ?? was)?.rows.length ?? 0)} rows`;
  }

  const kept = was.columns.filter((column) => now.columns.includes(column));
  const added = now.columns.filter((column) => !was.columns.includes(column));
  const dropped = was.columns.filter((column) => !now.columns.includes(column));
  const before = keyed(was.rows, kept);
  const after = keyed(now.rows, kept);
  const removed = onlyIn(before, after);
  const inserted = onlyIn(after, before);
  const filled = added.map(
    (column) =>
      `${column} set on ${String(now.rows.filter((row) => row[column] !== null).length)} rows`,
  );

  if (removed === 0 && inserted === 0 && added.length === 0 && dropped.length === 0) return null;

  return [
    `table ${name}: ${String(was.rows.length)} rows before, ${String(now.rows.length)} after`,
    `${String(removed)} rows changed or removed and ${String(inserted)} changed or added in the kept columns`,
    ...(added.length === 0 ? [] : [`added columns: ${filled.join(", ")}`]),
    ...(dropped.length === 0 ? [] : [`dropped columns: ${dropped.join(", ")}`]),
  ].join("; ");
}

function tableChanges(before: Readonly<Snapshot>, after: Readonly<Snapshot>): readonly string[] {
  const names = [
    ...new Set([...Object.keys(before.tables), ...Object.keys(after.tables)]),
  ].toSorted();
  const changes = names.flatMap((name) => {
    const change = tableChange(name, before.tables[name], after.tables[name]);

    return change === null ? [] : [change];
  });

  return [...changes, `unchanged tables: ${String(names.length - changes.length)}`];
}

function rolledBack(
  migrated: string,
  rollback: string,
  original: Readonly<Snapshot>,
): readonly string[] {
  const sqlite = new DatabaseSync(migrated);

  try {
    sqlite.exec(readFileSync(rollback, "utf8"));
  } finally {
    sqlite.close();
  }

  const restored = snapshotOf(migrated);
  const schema = schemaChanges(original, restored);
  const tables = tableChanges(original, restored).slice(0, -1);

  return [
    `rollback: ${rollback}`,
    `rollback: the schema ${schema.length === 0 ? "equals" : "differs from"} the original`,
    ...schema,
    `rollback: the rows ${tables.length === 0 ? "equal" : "differ from"} the original`,
    ...tables,
  ];
}

function dryRun(source: string, migrations: string, rollback: string | undefined): string[] {
  const directory = mkdtempSync(join(tmpdir(), "threadsift-migration-dry-run-"));

  try {
    const copy = copyOf(source, directory, "copy.sqlite");
    const before = snapshotOf(copy);

    openDatabase(copy, migrations).close();

    const after = snapshotOf(copy);
    const pending = [...after.migrations].filter((name) => !before.migrations.includes(name));

    return [
      `copy: ${copy} (from ${source}; the source is read only)`,
      `applied: ${pending.length === 0 ? "none" : pending.join(", ")}`,
      ...schemaChanges(before, after),
      ...tableChanges(before, after),
      ...(rollback === undefined ? [] : rolledBack(copy, rollback, before)),
    ];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { migrations: { type: "string" }, rollback: { type: "string" } },
});

const [source] = positionals;

if (source === undefined || positionals.length > 1) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

const lines = dryRun(
  resolve(source),
  resolve(values.migrations ?? join(import.meta.dirname, "..", "migrations")),
  values.rollback === undefined ? undefined : resolve(values.rollback),
);

process.stdout.write(`${lines.join("\n")}\n`);
