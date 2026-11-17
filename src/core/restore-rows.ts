import { type SQL, and, getTableColumns, sql } from "drizzle-orm";

import type { Database } from "./ports.ts";
import { RESTORE_BIND_BYTES } from "./restore-contract.ts";
import { type Row, rowsOf } from "./restore-lines.ts";
import { type TableSpec, tableSpec } from "./restore-registry.ts";
import type { Extract } from "./restore-rewrites.ts";

const ROW = sql.raw("r");

const ENCODER = new TextEncoder();

interface Source {
  readonly from: SQL;
  readonly get: Extract;
}

function pathOf(column: string): SQL {
  return sql.raw(`'$.${column}'`);
}

function jsonSource(json: string): Source {
  return {
    from: sql`json_each(${json}) as ${ROW}`,
    get: (column) => sql`json_extract(${ROW}.value, ${pathOf(column)})`,
  };
}

function rowSource(row: Readonly<Row>): Source {
  return {
    from: sql`(select 1)`,
    get: (column) => sql`${row[column] ?? null}`,
  };
}

function parentsPresent(spec: Readonly<TableSpec>, { get }: Readonly<Source>): SQL {
  const conditions = spec.parents.map(({ table, columns, parentColumns }) => {
    const matches = columns.map(
      (column, at) =>
        sql`${sql.identifier(table)}.${sql.identifier(parentColumns[at] ?? column)} = ${get(column)}`,
    );

    const absent = columns.map((column) => sql`${get(column)} is null`);

    return sql`(${sql.join(absent, sql` and `)} or exists (select 1 from ${sql.identifier(table)} where ${sql.join(matches, sql` and `)}))`;
  });

  return and(...conditions) ?? sql`1`;
}

function valueOf(spec: Readonly<TableSpec>, name: string, source: Readonly<Source>): SQL {
  if (!spec.columns.some((column) => column.name === name)) {
    const value = spec.defaults[name];

    if (value === undefined) throw new Error(`${spec.name}.${name} has no restore default`);

    return sql`${value}`;
  }

  return spec.rewrites[name]?.(source.get) ?? source.get(name);
}

function selected(spec: Readonly<TableSpec>, source: Readonly<Source>) {
  return Object.fromEntries(
    Object.entries(getTableColumns(spec.table)).map(([key, column]) => [
      key,
      sql`${valueOf(spec, column.name, source)}`.as(column.name),
    ]),
  );
}

function sourceOf(rows: readonly Readonly<Row>[]): Source {
  const json = JSON.stringify(rows);
  const [only] = rows;

  return rows.length === 1 && only !== undefined && ENCODER.encode(json).length > RESTORE_BIND_BYTES
    ? rowSource(only)
    : jsonSource(json);
}

export function insertRows(db: Database, spec: Readonly<TableSpec>, lines: readonly Uint8Array[]) {
  const source = sourceOf(rowsOf(lines));

  const rows = db
    .select(selected(spec, source))
    .from(source.from)
    .where(parentsPresent(spec, source));

  const insert = db.insert(spec.table).select(rows);

  if (spec.singleton === null) return insert.onConflictDoNothing();

  const columns = Object.entries(getTableColumns(spec.table));
  const target = columns.find(([, column]) => column.primary)?.[1];

  if (target === undefined) throw new Error(`${spec.name} has no primary key`);

  return insert.onConflictDoUpdate({
    target,
    set: Object.fromEntries(
      columns
        .filter(([, column]) => !column.primary)
        .map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)]),
    ),
  });
}

export function knownTable(name: string): TableSpec {
  const spec = tableSpec(name);

  if (spec === undefined) throw new Error(`${name} is not a restored table`);

  return spec;
}
