import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

const LEDGER = "d1_migrations";

const NameSchema = z.object({ name: z.string() });

const ObjectSchema = z.object({ name: z.string(), sql: z.string() });

const CountSchema = z.object({ n: z.number() });

const SequenceSchema = z.object({ name: z.string(), seq: z.number() });

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function names(sqlite: DatabaseSync, query: string): readonly string[] {
  return sqlite
    .prepare(query)
    .all()
    .map((row) => NameSchema.parse(row).name);
}

function counted(sqlite: DatabaseSync, query: string): number {
  return CountSchema.parse(sqlite.prepare(query).get()).n;
}

function objectsOf(sqlite: DatabaseSync, schema: string): Record<string, string> {
  const rows = sqlite
    .prepare(
      `select type || ' ' || name as name, sql from ${schema}.sqlite_master where sql is not null and name not like 'sqlite_%' and name <> '${LEDGER}'`,
    )
    .all()
    .map((row) => ObjectSchema.parse(row));

  return Object.fromEntries(rows.map(({ name, sql }) => [name, sql]));
}

function tablesOf(sqlite: DatabaseSync, schema: string): readonly string[] {
  return names(
    sqlite,
    `select name from ${schema}.sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> '${LEDGER}' order by name`,
  );
}

function hasTable(sqlite: DatabaseSync, schema: string, table: string): boolean {
  return (
    counted(
      sqlite,
      `select count(*) as n from ${schema}.sqlite_master where type = 'table' and name = '${table}'`,
    ) > 0
  );
}

function ledgerOf(sqlite: DatabaseSync, schema: string): readonly string[] {
  return hasTable(sqlite, schema, LEDGER)
    ? names(sqlite, `select name from ${schema}.${LEDGER} order by name`)
    : [];
}

function sequencesOf(sqlite: DatabaseSync, schema: string): string {
  if (!hasTable(sqlite, schema, "sqlite_sequence")) return "";

  return sqlite
    .prepare(
      `select name, seq from ${schema}.sqlite_sequence where name <> '${LEDGER}' order by name`,
    )
    .all()
    .map((row) => SequenceSchema.parse(row))
    .map(({ name, seq }) => `${name}=${String(seq)}`)
    .join(", ");
}

function columnsOf(sqlite: DatabaseSync, schema: string, table: string): readonly string[] {
  return names(sqlite, `select name from pragma_table_info('${table}', '${schema}')`);
}

function schemaChanges(sqlite: DatabaseSync): readonly string[] {
  const was = objectsOf(sqlite, "was");
  const now = objectsOf(sqlite, "main");

  return [...new Set([...Object.keys(was), ...Object.keys(now)])].toSorted().flatMap((name) => {
    if (was[name] === now[name]) return [];

    if (was[name] === undefined) return [`schema: + ${name}`];

    return [now[name] === undefined ? `schema: - ${name}` : `schema: ~ ${name}`];
  });
}

function tableChange(sqlite: DatabaseSync, table: string): string | null {
  const was = columnsOf(sqlite, "was", table);
  const now = columnsOf(sqlite, "main", table);
  const rows = (schema: string) =>
    counted(sqlite, `select count(*) as n from ${schema}.${quoted(table)}`);

  if (was.length === 0 || now.length === 0) {
    return `table ${table}: ${was.length === 0 ? "added" : "removed"}, ${String(rows(was.length === 0 ? "main" : "was"))} rows`;
  }

  const kept = was
    .filter((column) => now.includes(column))
    .map((column) => quoted(column))
    .join(", ");
  const added = now.filter((column) => !was.includes(column));
  const dropped = was.filter((column) => !now.includes(column));
  const only = (left: string, right: string) =>
    counted(
      sqlite,
      `select count(*) as n from (select ${kept} from ${left}.${quoted(table)} except select ${kept} from ${right}.${quoted(table)})`,
    );
  const removed = only("was", "main");
  const inserted = only("main", "was");

  if (removed === 0 && inserted === 0 && added.length === 0 && dropped.length === 0) return null;

  const filled = added.map(
    (column) =>
      `${column} set on ${String(counted(sqlite, `select count(*) as n from main.${quoted(table)} where ${quoted(column)} is not null`))} rows`,
  );

  return [
    `table ${table}: ${String(rows("was"))} rows before, ${String(rows("main"))} after`,
    `${String(removed)} rows changed or removed and ${String(inserted)} changed or added in the kept columns`,
    ...(added.length === 0 ? [] : [`added columns: ${filled.join(", ")}`]),
    ...(dropped.length === 0 ? [] : [`dropped columns: ${dropped.join(", ")}`]),
  ].join("; ");
}

function tableChanges(sqlite: DatabaseSync): readonly string[] {
  const tables = [...new Set([...tablesOf(sqlite, "was"), ...tablesOf(sqlite, "main")])].toSorted();
  const changes = tables.flatMap((table) => tableChange(sqlite, table) ?? []);

  return [...changes, `unchanged tables: ${String(tables.length - changes.length)}`];
}

function compared<Result>(
  copy: string,
  original: string,
  compare: (sqlite: DatabaseSync) => Result,
) {
  const sqlite = new DatabaseSync(copy);

  try {
    sqlite.prepare("attach database ? as was").run(original);

    return compare(sqlite);
  } finally {
    sqlite.close();
  }
}

export function migrationLines(copy: string, original: string): readonly string[] {
  return compared(copy, original, (sqlite) => {
    const before = ledgerOf(sqlite, "was");
    const pending = ledgerOf(sqlite, "main").filter((name) => !before.includes(name));

    return [
      `applied: ${pending.length === 0 ? "none" : pending.join(", ")}`,
      ...schemaChanges(sqlite),
      ...tableChanges(sqlite),
    ];
  });
}

function sameText(left: string, right: string, plural: boolean): string {
  if (left === right) return plural ? "equal" : "equals";

  return plural ? "differ from" : "differs from";
}

function runInTransaction(file: string, rollback: string): void {
  const sqlite = new DatabaseSync(file);

  try {
    sqlite.exec("begin");
    sqlite.exec(readFileSync(rollback, "utf8"));
    sqlite.exec("commit");
  } catch (error) {
    if (sqlite.isTransaction) sqlite.exec("rollback");

    throw error;
  } finally {
    sqlite.close();
  }
}

export function rolledBack(copy: string, original: string, rollback: string): readonly string[] {
  runInTransaction(copy, rollback);

  return compared(copy, original, (sqlite) => {
    const schema = schemaChanges(sqlite);
    const tables = tableChanges(sqlite).slice(0, -1);
    const ledger = ledgerOf(sqlite, "main");
    const counters = sequencesOf(sqlite, "main");

    return [
      `rollback: ${rollback}, run in one transaction`,
      `rollback: the schema ${schema.length === 0 ? "equals" : "differs from"} the original`,
      ...schema,
      `rollback: the rows ${tables.length === 0 ? "equal" : "differ from"} the original`,
      ...tables,
      `rollback: the migration ledger ${sameText(ledger.join(","), ledgerOf(sqlite, "was").join(","), false)} the original (${String(ledger.length)} files)`,
      `rollback: the id counters ${sameText(counters, sequencesOf(sqlite, "was"), true)} the original (${counters})`,
    ];
  });
}
